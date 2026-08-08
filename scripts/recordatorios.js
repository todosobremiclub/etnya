// scripts/recordatorios.js
//
// Envía una notificación push a la socia 1 hora antes de cada clase
// agendada, usando el token FCM guardado en alumnos.fcm_token
// (ver POST /app/fcm-token en routes/appMobileRoutes.js).
//
// Corre cada 5 minutos y busca clases cuyo horario caiga dentro de una
// ventana de 55 a 70 minutos desde "ahora" (la ventana es más ancha que
// el intervalo del cron para no dejar pasar ninguna clase por un
// desajuste de segundos entre corridas).
//
// OJO TIMEZONE: las columnas clases.fecha/hora no tienen zona horaria
// explícita en la base. Si al probarlo el recordatorio llega con un
// desfasaje de horas (ej. 3 horas antes/después de lo esperado), ajustá
// OFFSET_HORAS más abajo (Argentina es UTC-3, así que probablemente sea
// -3 o +3 según cómo esté configurado el reloj del servidor/Postgres).

const cron = require('node-cron');
const pool = require('../db');
const admin = require('../firebase');

const OFFSET_HORAS = 0; // <-- ajustar si el recordatorio llega desfasado
const VENTANA_DESDE_MIN = 55;
const VENTANA_HASTA_MIN = 70;

async function enviarRecordatorios() {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.hora, c.sede, c.tipo, a.id AS alumno_id, a.fcm_token
       FROM clases c
       JOIN alumnos a ON a.id = c.alumno_id
       WHERE c.recordatorio_enviado IS NOT TRUE
         AND a.fcm_token IS NOT NULL
         AND (c.fecha + c.hora) BETWEEN
             (NOW() + INTERVAL '${OFFSET_HORAS} hours' + INTERVAL '${VENTANA_DESDE_MIN} minutes')
         AND (NOW() + INTERVAL '${OFFSET_HORAS} hours' + INTERVAL '${VENTANA_HASTA_MIN} minutes')`
    );

    for (const clase of rows) {
      const horaStr = String(clase.hora).slice(0, 5);
      const tipo = clase.tipo && clase.tipo !== 'normal' ? clase.tipo : 'Pilates';

      try {
        await admin.messaging().send({
          token: clase.fcm_token,
          notification: {
            title: 'Tu clase es en 1 hora',
            body: `${tipo} a las ${horaStr} hs en ${clase.sede || 'Etnya'}`,
          },
        });
        console.log(`🔔 Recordatorio enviado a alumno ${clase.alumno_id} (clase ${clase.id})`);
      } catch (err) {
        // token inválido, dispositivo desinstalado, etc.
        console.error(`Error enviando recordatorio a alumno ${clase.alumno_id}:`, err.message);
      }

      // Se marca como enviado haya salido bien o mal, para no reintentar
      // en loop sobre la misma clase/token en cada corrida del cron.
      await pool.query(
        'UPDATE clases SET recordatorio_enviado = TRUE WHERE id = $1',
        [clase.id]
      );
    }
  } catch (err) {
    console.error('Error en enviarRecordatorios:', err);
  }
}

function iniciarRecordatorios() {
  cron.schedule('*/5 * * * *', enviarRecordatorios);
  console.log('⏰ Job de recordatorios de clases iniciado (corre cada 5 min).');
}

module.exports = { iniciarRecordatorios, enviarRecordatorios };
