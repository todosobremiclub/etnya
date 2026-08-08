// scripts/avisosPago.js
//
// El día 11 de cada mes (un día después del vencimiento del 10), les manda
// una notificación push a las socias que todavía están en mora, para
// recordarles el pago pendiente.
//
// OJO TIMEZONE: mismo caveat que scripts/recordatorios.js — si el aviso
// sale el día equivocado según el reloj del servidor, ajustá OFFSET_HORAS.

const cron = require('node-cron');
const pool = require('../db');
const admin = require('../firebase');

const OFFSET_HORAS = 0; // <-- ajustar si el aviso sale un día antes/después
const DIA_AVISO = 11;
const HORA_AVISO = '10:00'; // hora del servidor a la que corre el cron

function ymKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function obtenerAlumnosConToken() {
  // "becado" NO es columna de alumnos (es la tabla aparte "becados"), se
  // consulta por separado más abajo. Si 'estado_pago' no existe como
  // columna en tu base, caemos a la consulta básica sin romper.
  try {
    const { rows } = await pool.query(
      `SELECT id, nombre, fcm_token, estado_pago
       FROM alumnos
       WHERE fcm_token IS NOT NULL`
    );
    return rows;
  } catch (err) {
    if (String(err.code) === '42703') {
      const { rows } = await pool.query(
        `SELECT id, nombre, fcm_token FROM alumnos WHERE fcm_token IS NOT NULL`
      );
      return rows;
    }
    throw err;
  }
}

async function avisarMorosas() {
  try {
    const hoy = new Date(Date.now() + OFFSET_HORAS * 3600000);
    if (hoy.getDate() !== DIA_AVISO) return; // solo corre el día 11

    const mesActual = ymKey(hoy);

    const alumnos = await obtenerAlumnosConToken();
    if (alumnos.length === 0) return;

    const { rows: pagosDelMes } = await pool.query(
      `SELECT DISTINCT alumno_id FROM pagos WHERE mes_pagado = $1`,
      [mesActual]
    );
    const pagaronEsteMes = new Set(pagosDelMes.map(p => p.alumno_id));

    const { rows: becRows } = await pool.query('SELECT alumno_id FROM becados');
    const becadas = new Set(becRows.map(b => b.alumno_id));

    for (const a of alumnos) {
      const esBecado = becadas.has(a.id);

      const estadoPagoPositivo = a.hasOwnProperty('estado_pago') &&
        ['al_dia', 'ok', 'pago', 'true', '1'].includes(String(a.estado_pago).toLowerCase());

      const alDia = esBecado || estadoPagoPositivo || pagaronEsteMes.has(a.id);
      if (alDia) continue; // solo avisamos a las que están en mora

      try {
        await admin.messaging().send({
          token: a.fcm_token,
          notification: {
            title: 'Tenés un pago pendiente',
            body: 'Todavía no registramos el pago de este mes. ¡Te esperamos para regularizarlo!',
          },
        });
        console.log(`💸 Aviso de mora enviado a alumno ${a.id}`);
      } catch (err) {
        console.error(`Error enviando aviso de mora a alumno ${a.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Error en avisarMorosas:', err);
  }
}

function iniciarAvisosPago() {
  const [hh, mm] = HORA_AVISO.split(':');
  cron.schedule(`${parseInt(mm, 10)} ${parseInt(hh, 10)} * * *`, avisarMorosas);
  console.log(`⏰ Job de aviso de mora (día ${DIA_AVISO}, ${HORA_AVISO} hs) iniciado.`);
}

module.exports = { iniciarAvisosPago, avisarMorosas };
