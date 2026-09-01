// routes/appMobileRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const jwtMobile = require('../middleware/jwtMobile');
const PDFDocument = require('pdfkit');

// ====== CONFIG (ajustable por .env) ======
const TBL           = process.env.MOBILE_TABLE || 'alumnos';
const NUM_FIELD     = process.env.MOBILE_NUM_FIELD || 'numero_alumno';
const NAME_FIELD    = process.env.MOBILE_NAME_FIELD || 'nombre';
const SURNAME_FIELD = process.env.MOBILE_SURNAME_FIELD || 'apellido';
const START_FIELD   = process.env.MOBILE_START_FIELD || 'fecha_inicio';
const TYPE_FIELD    = process.env.MOBILE_TYPE_FIELD || 'tipo_clase';
const SEDE_FIELD    = process.env.MOBILE_SEDE_FIELD || 'sede';
const SCHOLAR_FIELD = process.env.MOBILE_BECADO_FIELD || 'becado';

const PAGOS_TABLE     = process.env.MOBILE_PAGOS_TABLE || 'pagos';
const PAGOS_ALUMNO_FK = process.env.MOBILE_PAGOS_ALUMNO_FIELD || 'alumno_id';
const PAGOS_MES_FIELD = process.env.MOBILE_PAGOS_MES_FIELD || 'mes_pagado';

const CLASES_TABLE      = process.env.MOBILE_CLASES_TABLE || 'clases';
const CLASES_ALUMNO_FK  = process.env.MOBILE_CLASES_ALUMNO_FIELD || 'alumno_id';
const CLASES_FECHA      = process.env.MOBILE_CLASES_FECHA_FIELD || 'fecha';
const CLASES_SEDE       = process.env.MOBILE_CLASES_SEDE_FIELD || 'sede';
const CLASES_TIPO       = process.env.MOBILE_CLASES_TIPO_FIELD || 'tipo';
const CLASES_ESTADO     = process.env.MOBILE_CLASES_ESTADO_FIELD || 'estado';

// Día del mes en que vence la cuota (mismo criterio que ya usa el panel
// admin en calcularEstadoPago() de public/admin-panel/index.html).
const DIA_VENCIMIENTO = 10;

// Duración estimada de una clase para "Mi recorrido". La tabla "clases" no
// tiene columna de duración, así que usamos un valor fijo configurable.
const DURACION_CLASE_MINUTOS = parseInt(process.env.MOBILE_DURACION_CLASE_MIN || '50', 10);

// =========================================

router.use(jwtMobile);

function ymKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** GET /app/perfil */
router.get('/perfil', async (req, res) => {
  try {
    const alumnoId = req.user.uid; // usamos el ID real del token

    // 1) Intento completo: asume que existe 'estado_pago'.
    // (OJO: "becado" NO es columna de alumnos, es la tabla aparte
    // "becados" con alumno_id — se consulta más abajo por separado)
    const qConFlags = `
      SELECT id,
             ${NUM_FIELD} AS numero,
             ${NAME_FIELD} AS nombre,
             ${SURNAME_FIELD} AS apellido,
             ${START_FIELD} AS inicio_clases,
             ${TYPE_FIELD}  AS tipo_clase,
             ${SEDE_FIELD}  AS sede,
             estado_pago
      FROM ${TBL}
      WHERE id = $1
      LIMIT 1
    `;

    // 2) Fallback: sin columnas opcionales
    const qBasica = `
      SELECT id,
             ${NUM_FIELD} AS numero,
             ${NAME_FIELD} AS nombre,
             ${SURNAME_FIELD} AS apellido,
             ${START_FIELD} AS inicio_clases,
             ${TYPE_FIELD}  AS tipo_clase,
             ${SEDE_FIELD}  AS sede
      FROM ${TBL}
      WHERE id = $1
      LIMIT 1
    `;

    let s;
    try {
      const { rows } = await db.query(qConFlags, [alumnoId]);
      s = rows[0];
    } catch (err) {
      // Si la columna no existe (42703), hacemos la consulta básica
      if (String(err.code) === '42703') {
        const { rows } = await db.query(qBasica, [alumnoId]);
        s = rows[0];
      } else {
        throw err;
      }
    }

    if (!s) return res.status(404).json({ error: 'Alumno no encontrado' });

    // último mes pagado por ID
    let maxMes = null;
    try {
      const { rows: rp } = await db.query(
        `SELECT MAX(${PAGOS_MES_FIELD}) AS max_mes
         FROM ${PAGOS_TABLE}
         WHERE ${PAGOS_ALUMNO_FK} = $1`,
        [alumnoId]
      );
      maxMes = rp[0]?.max_mes || null;
    } catch (_) {}

    // cálculo estado
    const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const mesActual = ymKey(new Date());

    // Beca: vive en la tabla "becados" (alumno_id), no como columna de alumnos.
    let esBecado = false;
    try {
      const { rows: becRows } = await db.query(
        'SELECT 1 FROM becados WHERE alumno_id = $1 LIMIT 1',
        [alumnoId]
      );
      esBecado = becRows.length > 0;
    } catch (_) {
      // si la tabla no existiera, seguimos sin romper
    }

    const estadoPagoPositivo = s.hasOwnProperty('estado_pago') &&
      ['al_dia','ok','pago','true','1'].includes(String(s.estado_pago).toLowerCase());

    // Términos, condiciones y riesgos médicos: un único formulario que la
    // socia acepta una vez desde la app (misma lógica defensiva que
    // "becado", para no depender de que la columna ya exista) y que vence
    // al año de aceptado: pasado ese plazo hay que volver a mostrarlo.
    let terminosAceptados = false;
    let terminosAceptadosEn = null;
    try {
      const { rows: trows } = await db.query(
        `SELECT terminos_aceptados_en,
                (terminos_aceptados_en IS NOT NULL
                  AND terminos_aceptados_en > NOW() - INTERVAL '1 year') AS vigente
         FROM ${TBL} WHERE id = $1 LIMIT 1`,
        [alumnoId]
      );
      terminosAceptadosEn = trows[0]?.terminos_aceptados_en || null;
      terminosAceptados = !!(trows[0] && trows[0].vigente);
    } catch (_) {}

    let estado = 'en_mora';
    if (esBecado || estadoPagoPositivo) {
      estado = 'al_dia';
    } else if (maxMes && String(maxMes) >= mesActual) {
      estado = 'al_dia';
    }

    // Próximo vencimiento (día 10). Si ya está al día con el mes actual,
    // el próximo vencimiento es el 10 del mes que viene; si no, es el 10
    // de este mes (que puede estar ya vencido).
    let proximoVencimiento = null;
    if (!esBecado) {
      const hoy = new Date();
      let vencAnio = hoy.getFullYear();
      let vencMes = hoy.getMonth() + 1; // 1..12
      if (estado === 'al_dia') {
        vencMes += 1;
        if (vencMes > 12) { vencMes = 1; vencAnio += 1; }
      }
      proximoVencimiento = `${vencAnio}-${String(vencMes).padStart(2, '0')}-${String(DIA_VENCIMIENTO).padStart(2, '0')}`;
    }

    res.json({
      numero: s.numero,
      nombre: s.nombre,
      apellido: s.apellido,
      inicio_clases: s.inicio_clases ? new Date(s.inicio_clases).toISOString() : null,
      estado_pago: estado,                     // 'al_dia' | 'en_mora'
      proximo_vencimiento: proximoVencimiento, // 'YYYY-MM-DD' o null (becada)
      tipo_clase: s.tipo_clase || '',
      sede: s.sede || '',
      terminos_aceptados: terminosAceptados,
      terminos_aceptados_en: terminosAceptadosEn
        ? new Date(terminosAceptadosEn).toISOString()
        : null
    });
  } catch (e) {
    console.error('/app/perfil', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/** GET /app/clases?mes=YYYY-MM */
router.get('/clases', async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes) return res.status(400).json({ error: 'Parametro mes (YYYY-MM) requerido' });

    const alumnoId = req.user.uid;

    // Traemos fecha (date), hora (time) y demás
    const qClases = `
      SELECT id,
             ${CLASES_FECHA}  AS fecha,        -- DATE
             hora,                              -- TIME (existe en tu tabla)
             ${CLASES_SEDE}   AS sede,
             ${CLASES_TIPO}   AS tipo,
             ${CLASES_ESTADO} AS estado
      FROM ${CLASES_TABLE}
      WHERE ${CLASES_ALUMNO_FK} = $1
        AND to_char(${CLASES_FECHA}, 'YYYY-MM') = $2
      ORDER BY ${CLASES_FECHA} ASC, hora ASC
    `;
    const { rows } = await db.query(qClases, [alumnoId, mes]);

    const items = rows.map(r => {
      let iso = null;
      let hhmm = null;

      // hora puede venir como "HH:MM:SS" o "HH:MM"
      if (r.hora) {
        const parts = String(r.hora).split(':');
        const hh = parseInt(parts[0] || '0', 10);
        const mm = parseInt(parts[1] || '0', 10);
        hhmm = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
      }

      if (r.fecha) {
        // armamos un Date con fecha y (si hay) hora. Usamos UTC para no desfasar.
        const d = new Date(r.fecha);
        if (hhmm) {
          const [H, M] = hhmm.split(':').map(n => parseInt(n, 10));
          // setUTC... para evitar corrimiento por timezone
          d.setUTCHours(H, M, 0, 0);
        } else {
          d.setUTCHours(0, 0, 0, 0);
        }
        iso = d.toISOString();
      }

      return {
        id: r.id,
        fecha_hora: iso,         // <-- ISO combinando fecha + hora
        hora: hhmm,              // <-- HH:MM (útil de respaldo)
        sede: r.sede || '',
        tipo: r.tipo || 'normal',
        estado: r.estado || ''
      };
    });

    const tomadas = items.filter(x => x.estado === 'asistio').length;
    const suspendidas = items.filter(x => x.estado === 'con_aviso' || x.estado === 'sin_aviso').length;

    res.json({ resumen: { tomadas, suspendidas }, items });
  } catch (e) {
    console.error('/app/clases', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /app/clases/:id/no-asistira
 * La socia avisa desde la app que no va a asistir a una clase futura.
 * Marca la clase como estado='con_aviso' (mismo estado que ya usa el panel
 * admin para "no asistió, avisó con anticipación").
 */
router.post('/clases/:id/no-asistira', async (req, res) => {
  try {
    const alumnoId = req.user.uid;
    const { id } = req.params;
    const comentario = (req.body?.comentario || '').toString().trim().slice(0, 500);

    const { rows } = await db.query(
      `SELECT id, ${CLASES_FECHA} AS fecha, hora, ${CLASES_ESTADO} AS estado
       FROM ${CLASES_TABLE}
       WHERE id = $1 AND ${CLASES_ALUMNO_FK} = $2
       LIMIT 1`,
      [id, alumnoId]
    );
    const clase = rows[0];
    if (!clase) return res.status(404).json({ error: 'Clase no encontrada' });

    // Armamos fecha+hora de la clase para validar que sea futura
    const fechaHora = new Date(clase.fecha);
    if (clase.hora) {
      const partes = String(clase.hora).split(':');
      const h = parseInt(partes[0] || '0', 10);
      const m = parseInt(partes[1] || '0', 10);
      fechaHora.setUTCHours(h, m, 0, 0);
    }
    if (fechaHora.getTime() < Date.now()) {
      return res.status(400).json({ error: 'La clase ya pasó' });
    }
    if (clase.estado === 'con_aviso' || clase.estado === 'sin_aviso' || clase.estado === 'asistio') {
      return res.status(400).json({ error: 'Esta clase ya tiene un estado registrado' });
    }

    const observacion = comentario
      ? `Avisó desde la app que no asistirá: ${comentario}`
      : 'Avisó desde la app que no asistirá';

    await db.query(
      `UPDATE ${CLASES_TABLE}
       SET ${CLASES_ESTADO} = 'con_aviso', observacion = $2
       WHERE id = $1`,
      [id, observacion]
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('/app/clases/:id/no-asistira', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /app/fcm-token  { token: string }
 * Guarda/actualiza el token de notificaciones push del dispositivo de la
 * socia logueada, para poder enviarle el recordatorio 1 hora antes de clase.
 */
router.post('/fcm-token', async (req, res) => {
  try {
    const alumnoId = req.user.uid;
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token requerido' });

    await db.query(`UPDATE ${TBL} SET fcm_token = $1 WHERE id = $2`, [token, alumnoId]);
    res.json({ ok: true });
  } catch (e) {
    console.error('/app/fcm-token', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * POST /app/terminos/aceptar
 * La socia acepta, en un único formulario, los términos y condiciones y
 * los riesgos médicos asociados a la práctica de Pilates. Se guarda la
 * fecha/hora en el backend (no solo en el dispositivo) para que quede
 * registrado incluso si cambia de teléfono o reinstala la app. Esta
 * aceptación vence al año: pasado ese plazo, GET /app/perfil vuelve a
 * devolver terminos_aceptados:false y la app le vuelve a mostrar el
 * formulario (este mismo endpoint la renueva por otro año).
 */
router.post('/terminos/aceptar', async (req, res) => {
  try {
    const alumnoId = req.user.uid;
    await db.query(
      `UPDATE ${TBL} SET terminos_aceptados_en = NOW() WHERE id = $1`,
      [alumnoId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('/app/terminos/aceptar', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /app/recorrido -> estadísticas de "Mi recorrido": clases tomadas
 * (mes actual y acumulado histórico), minutos practicados (mes y
 * acumulado) y días desde que empezó a practicar.
 */
router.get('/recorrido', async (req, res) => {
  try {
    const alumnoId = req.user.uid;
    const mesActual = ymKey(new Date());

    const { rows: rMes } = await db.query(
      `SELECT COUNT(*) AS n
       FROM ${CLASES_TABLE}
       WHERE ${CLASES_ALUMNO_FK} = $1
         AND ${CLASES_ESTADO} = 'asistio'
         AND to_char(${CLASES_FECHA}, 'YYYY-MM') = $2`,
      [alumnoId, mesActual]
    );
    const clasesMes = parseInt(rMes[0]?.n || '0', 10);

    const { rows: rTot } = await db.query(
      `SELECT COUNT(*) AS n
       FROM ${CLASES_TABLE}
       WHERE ${CLASES_ALUMNO_FK} = $1
         AND ${CLASES_ESTADO} = 'asistio'`,
      [alumnoId]
    );
    const clasesTotales = parseInt(rTot[0]?.n || '0', 10);

    let diasPracticando = null;
    try {
      const { rows: rInicio } = await db.query(
        `SELECT ${START_FIELD} AS inicio FROM ${TBL} WHERE id = $1 LIMIT 1`,
        [alumnoId]
      );
      const inicio = rInicio[0]?.inicio ? new Date(rInicio[0].inicio) : null;
      if (inicio) {
        diasPracticando = Math.max(0, Math.floor((Date.now() - inicio.getTime()) / 86400000));
      }
    } catch (_) {}

    res.json({
      clases_mes: clasesMes,
      clases_totales: clasesTotales,
      minutos_mes: clasesMes * DURACION_CLASE_MINUTOS,
      minutos_totales: clasesTotales * DURACION_CLASE_MINUTOS,
      dias_practicando: diasPracticando
    });
  } catch (e) {
    console.error('/app/recorrido', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/** GET /app/pagos -> pagos propios de la socia logueada, más recientes primero */
router.get('/pagos', async (req, res) => {
  try {
    const alumnoId = req.user.uid;
    const { rows } = await db.query(
      `SELECT id, fecha_pago, mes_pagado, monto, alumno_modalidad
       FROM ${PAGOS_TABLE}
       WHERE ${PAGOS_ALUMNO_FK} = $1
       ORDER BY fecha_pago DESC`,
      [alumnoId]
    );

    res.json(rows.map(p => ({
      id: p.id,
      fecha_pago: p.fecha_pago ? new Date(p.fecha_pago).toISOString() : null,
      mes_pagado: p.mes_pagado || '',
      monto: p.monto,
      // el snapshot guarda algo como "Pilates Reformer - 2 x semana": solo
      // mostramos la actividad, sin la aclaración de frecuencia.
      actividad: (p.alumno_modalidad || '').split('-')[0].trim(),
    })));
  } catch (e) {
    console.error('/app/pagos', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /app/pagos/:id/recibo.pdf -> comprobante de pago en PDF.
 * Se abre como link normal (no fetch con headers), por eso jwtMobile
 * también acepta el token por query string (?token=...) para esta ruta.
 */
router.get('/pagos/:id/recibo.pdf', async (req, res) => {
  try {
    const alumnoId = req.user.uid;
    const { id } = req.params;

    const { rows } = await db.query(
      `SELECT id, fecha_pago, mes_pagado, monto, alumno_nombre, alumno_apellido,
              alumno_numero, alumno_modalidad
       FROM ${PAGOS_TABLE}
       WHERE id = $1 AND ${PAGOS_ALUMNO_FK} = $2
       LIMIT 1`,
      [id, alumnoId]
    );
    const pago = rows[0];
    if (!pago) return res.status(404).json({ error: 'Recibo no encontrado' });

    const fecha = pago.fecha_pago ? new Date(pago.fecha_pago) : null;
    const fechaStr = fecha ? fecha.toLocaleDateString('es-AR') : '-';
    const actividad = (pago.alumno_modalidad || '').split('-')[0].trim() || '-';
    const monto = pago.monto != null
      ? `$ ${Number(pago.monto).toLocaleString('es-AR')}`
      : '-';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="recibo-${pago.mes_pagado || pago.id}.pdf"`
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).text('Etnya Pilates', { align: 'center' });
    doc.fontSize(12).fillColor('#555').text('Comprobante de pago', { align: 'center' });
    doc.moveDown(2);

    doc.fillColor('#000').fontSize(11);
    doc.text(`Socia: ${pago.alumno_nombre || ''} ${pago.alumno_apellido || ''} (N° ${pago.alumno_numero || '-'})`);
    doc.moveDown(0.5);
    doc.text(`Fecha de pago: ${fechaStr}`);
    doc.text(`Mes abonado: ${pago.mes_pagado || '-'}`);
    doc.text(`Actividad: ${actividad}`);
    doc.text(`Monto: ${monto}`);
    doc.moveDown(2);

    doc.fontSize(9).fillColor('#888').text(
      'Comprobante generado automáticamente por la app de Etnya Pilates.',
      { align: 'center' }
    );

    doc.end();
  } catch (e) {
    console.error('/app/pagos/:id/recibo.pdf', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/** GET /app/novedades */
router.get('/novedades', async (_req, res) => {
  try {
    // Ajustá a tu tabla real si se llama 'novedades' o 'noticias'
    const q = `
      SELECT id, titulo, texto, imagen_url AS "imagenUrl", fecha
      FROM novedades
      WHERE publicado = true
      ORDER BY fecha DESC
      LIMIT 50
    `;
    const { rows } = await db.query(q).catch(() => ({ rows: [] }));
    res.json(rows.map(n => ({
      id: n.id,
      titulo: n.titulo,
      texto: n.texto,
      imagenUrl: n.imagenUrl || null,
      fecha: n.fecha ? new Date(n.fecha).toISOString().slice(0,10) : null
    })));
  } catch (e) {
    console.error('/app/novedades', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/** GET /app/notificaciones */
router.get('/notificaciones', async (_req, res) => {
  try {
    const q = `
      SELECT id, titulo, texto, fecha
      FROM notificaciones
      WHERE visible = true
      ORDER BY fecha DESC
      LIMIT 100
    `;
    const { rows } = await db.query(q).catch(() => ({ rows: [] }));
    res.json(rows.map(n => ({
      id: n.id,
      titulo: n.titulo,
      texto: n.texto,
      fecha: n.fecha ? new Date(n.fecha).toISOString() : null
    })));
  } catch (e) {
    console.error('/app/notificaciones', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
