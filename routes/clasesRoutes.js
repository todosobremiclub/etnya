const express = require('express');
const router = express.Router();
// Dejá tu import real del pool:
const pool = require('../db'); // <-- ajustá si tu proyecto usa otra ruta

// GET /clases?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&sede=...][&alumno_id=...]
router.get('/', async (req, res) => {
  try {
    let { desde, hasta, alumno_id, sede } = req.query;

    // Validación temprana
    if (!desde || !hasta) {
      return res.status(400).json({
        error: 'Parámetros "desde" y "hasta" son requeridos',
        got: { desde, hasta, sede, alumno_id }
      });
    }

    // Construcción segura del WHERE y los parámetros
    const params = [];
    const wheres = [];

    params.push(desde);
    wheres.push(`c.fecha >= $${params.length}`);

    params.push(hasta);
    wheres.push(`c.fecha <= $${params.length}`);

    if (sede) {
      sede = String(sede).trim();
      params.push(sede);
      wheres.push(`c.sede = $${params.length}`);
    }

    if (alumno_id) {
      params.push(parseInt(alumno_id, 10));
      wheres.push(`c.alumno_id = $${params.length}`);
    }

    const sql = `
     SELECT
  c.id, c.alumno_id, c.fecha, c.hora, c.sede, c.nota, c.observacion, c.estado, c.tipo,
   a.nombre, a.apellido, a.numero_alumno, a.sede AS sede_alumno

      FROM clases c
      LEFT JOIN alumnos a ON a.id = c.alumno_id
      ${wheres.length ? 'WHERE ' + wheres.join(' AND ') : ''}
      ORDER BY c.fecha, c.hora
    `;

    // Logs útiles para Render
    console.log('[GET /clases] params:', { desde, hasta, sede, alumno_id });
    console.log('[GET /clases] SQL:', sql, 'params:', params);

    const r = await pool.query(sql, params);
    return res.json(r.rows);
  } catch (err) {
    console.error('[GET /clases] error:', err);
    return res.status(500).json({ error: 'Error del servidor', detail: err.message });
  }
});

// DELETE /clases/:id  -> borra una sola clase
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query('DELETE FROM clases WHERE id = $1', [id]);
    res.json({ eliminadas: r.rowCount });
  } catch (err) {
    console.error('Error al borrar clase por id:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});


// DELETE /clases  { ids: number[] }
router.delete('/', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids requeridos' });
  }
  try {
    const r = await pool.query('DELETE FROM clases WHERE id = ANY($1::int[])', [ids]);
    res.json({ eliminadas: r.rowCount });
  } catch (err) {
    console.error('Error al borrar clases:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Fallback: POST /clases/bulk-delete  { ids: number[] }
router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids requeridos' });
  }
  try {
    const r = await pool.query('DELETE FROM clases WHERE id = ANY($1::int[])', [ids]);
    res.json({ eliminadas: r.rowCount });
  } catch (err) {
    console.error('Error en bulk-delete:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PATCH /clases/:id  { estado: 'asistio'|'sin_aviso'|'con_aviso'|'sobre_hora'|null }
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { estado, observacion } = req.body;  
try {
    const r = await pool.query(
      'UPDATE clases SET estado = $1, observacion = $2 WHERE id = $3',
      [estado ?? null, observacion ?? null, id]
    );
    res.json({ updated: r.rowCount });
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Fallback: POST /clases/estado  { id, estado }
  router.post('/estado', async (req, res) => {
  const { id, estado, observacion } = req.body;  if (!id) return res.status(400).json({ error: 'id requerido' });
  try {
    const r = await pool.query(
      'UPDATE clases SET estado = $1, observacion = $2 WHERE id = $3',
      [estado ?? null, observacion ?? null, id]
    );
    res.json({ updated: r.rowCount });
  } catch (err) {
    console.error('Error en /clases/estado:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /clases  -> crea 1..N clases
// body: { alumno_id?: number|null, clases: [{ fecha: 'YYYY-MM-DD', hora: 'HH:MM'|'HH:MM:SS', sede: string, nota?: string }] }
router.post('/', async (req, res) => {
  let { alumno_id, clases } = req.body || {};
  if (!Array.isArray(clases) || clases.length === 0) {
    return res.status(400).json({ error: 'Faltan clases a crear' });
  }

  // normalizar alumno_id (permitimos null para "clase de prueba")
  if (alumno_id === undefined) alumno_id = null;
  if (alumno_id !== null && Number.isNaN(Number(alumno_id))) {
    return res.status(400).json({ error: 'alumno_id inválido' });
  }

  // validación básica y normalización de hora
  const rows = [];
for (const c of clases) {
  if (!c || !c.fecha || !c.hora || !c.sede) {
    return res.status(400).json({ error: 'Cada clase requiere fecha, hora y sede' });
  }
  const hora = (c.hora.length === 5) ? `${c.hora}:00` : c.hora;
  rows.push({
    alumno_id: alumno_id === null ? null : Number(alumno_id),
    fecha: c.fecha.slice(0, 10),
    hora,
    sede: String(c.sede).trim(),
     nota: c.nota ? String(c.nota).trim() : null,
     observacion: c.observacion ? String(c.observacion).trim() : null,
     tipo: c.tipo ? String(c.tipo).trim() : null
  });
}

try {
  const insertedIds = [];
  for (const r of rows) {
    const q = `
      INSERT INTO clases (alumno_id, fecha, hora, sede, nota, observacion, tipo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;
    const vals = [r.alumno_id, r.fecha, r.hora, r.sede, r.nota, r.observacion, r.tipo];
    const out = await pool.query(q, vals);
    insertedIds.push(out.rows[0].id);
  }
  return res.status(201).json({ created: insertedIds.length, ids: insertedIds });
} catch (err) {
    console.error('[POST /clases] error:', err);
    return res.status(500).json({ error: 'Error del servidor', detail: err.message });
  }
});


module.exports = router;
