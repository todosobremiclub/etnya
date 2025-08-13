const express = require('express');
const router = express.Router();
// Dejá tu import real del pool:
const pool = require('../db'); // <-- ajustá si tu proyecto usa otra ruta

// GET /clases?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&sede=...][&alumno_id=...]
router.get('/', async (req, res) => {
  const { desde, hasta, alumno_id, sede } = req.query;

  try {
    const params = [desde, hasta];
    let where = 'c.fecha BETWEEN $1 AND $2';

    if (sede) {
      params.push(sede.trim());
      where += ` AND c.sede = $${params.length}`;
    }
    if (alumno_id) {
      params.push(parseInt(alumno_id, 10));
      where += ` AND c.alumno_id = $${params.length}`;
    }

    const sql = `
      SELECT
        c.id, c.alumno_id, c.fecha, c.hora, c.sede, c.nota, c.estado,
        a.nombre, a.apellido, a.numero_alumno
      FROM clases c
      LEFT JOIN alumnos a ON a.id = c.alumno_id
      WHERE ${where}
      ORDER BY c.fecha, c.hora
    `;

    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error('Error al obtener clases:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// POST /clases  { alumno_id?: number|null, clases: [{fecha, hora, sede, nota?}] }
router.post('/', async (req, res) => {
  const { alumno_id, clases } = req.body;

  if (!Array.isArray(clases) || clases.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    for (const clase of clases) {
      await pool.query(
        `INSERT INTO clases (alumno_id, fecha, hora, sede, nota)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          alumno_id ?? null,
          clase.fecha,
          clase.hora,
          (clase.sede || '').trim(),
          clase.nota ?? null
        ]
      );
    }
    res.status(201).json({ mensaje: 'Clases guardadas con éxito' });
  } catch (err) {
    console.error('Error al guardar clase:', err);
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
  const { estado } = req.body;
  try {
    const r = await pool.query(
      'UPDATE clases SET estado = $1 WHERE id = $2',
      [estado ?? null, id]
    );
    res.json({ updated: r.rowCount });
  } catch (err) {
    console.error('Error al actualizar estado:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Fallback: POST /clases/estado  { id, estado }
router.post('/estado', async (req, res) => {
  const { id, estado } = req.body;
  if (!id) return res.status(400).json({ error: 'id requerido' });
  try {
    const r = await pool.query(
      'UPDATE clases SET estado = $1 WHERE id = $2',
      [estado ?? null, id]
    );
    res.json({ updated: r.rowCount });
  } catch (err) {
    console.error('Error en /clases/estado:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
