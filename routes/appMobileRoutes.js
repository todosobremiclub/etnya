// routes/appMobileRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const jwtMobile = require('../middleware/jwtMobile');

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

    // 1) Intento completo: asume que existen 'becado' y/o 'estado_pago'
    const qConFlags = `
      SELECT id,
             ${NUM_FIELD} AS numero,
             ${NAME_FIELD} AS nombre,
             ${SURNAME_FIELD} AS apellido,
             ${START_FIELD} AS inicio_clases,
             ${TYPE_FIELD}  AS tipo_clase,
             ${SEDE_FIELD}  AS sede,
             becado,
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

    // normalizo flags si están presentes
    const esBecado = s.hasOwnProperty('becado') &&
                     (s.becado === true || s.becado === 1 || String(s.becado).toLowerCase() === 'true');

    const estadoPagoPositivo = s.hasOwnProperty('estado_pago') &&
      ['al_dia','ok','pago','true','1'].includes(String(s.estado_pago).toLowerCase());

    let estado = 'en_mora';
    if (esBecado || estadoPagoPositivo) {
      estado = 'al_dia';
    } else if (maxMes && String(maxMes) >= mesActual) {
      estado = 'al_dia';
    }

    res.json({
      numero: s.numero,
      nombre: s.nombre,
      apellido: s.apellido,
      inicio_clases: s.inicio_clases ? new Date(s.inicio_clases).toISOString() : null,
      estado_pago: estado,           // 'al_dia' | 'en_mora'
      tipo_clase: s.tipo_clase || '',
      sede: s.sede || ''
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

    const alumnoId = req.user.uid; // 👈 usar ID del token

    const qClases = `
      SELECT id,
             ${CLASES_FECHA}  AS fecha,
             ${CLASES_SEDE}   AS sede,
             ${CLASES_TIPO}   AS tipo,
             ${CLASES_ESTADO} AS estado
      FROM ${CLASES_TABLE}
      WHERE ${CLASES_ALUMNO_FK} = $1
        AND to_char(${CLASES_FECHA}, 'YYYY-MM') = $2
      ORDER BY ${CLASES_FECHA} ASC
    `;
    const { rows: rc } = await db.query(qClases, [alumnoId, mes]);

    const tomadas = rc.filter(x => x.estado === 'asistio').length;
    const suspendidas = rc.filter(x => x.estado === 'con_aviso' || x.estado === 'sin_aviso').length;

    res.json({
      resumen: { tomadas, suspendidas },
      items: rc.map(c => ({
        id: c.id,
        fecha: c.fecha ? new Date(c.fecha).toISOString() : null,
        sede: c.sede || '',
        tipo: c.tipo || 'normal',
        estado: c.estado || ''
      }))
    });
  } catch (e) {
    console.error('/app/clases', e);
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
