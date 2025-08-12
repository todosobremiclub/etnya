const express = require('express');
const router = express.Router();
const pool = require('../db');

// Guardar clase (única o recurrente)
router.post('/', async (req, res) => {
  const { alumno_id, clases } = req.body;

  if (!Array.isArray(clases) || clases.length === 0) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  try {
    for (const clase of clases) {
      await pool.query(`
        INSERT INTO clases (alumno_id, fecha, hora, sede)
        VALUES ($1, $2, $3, $4)
      `, [alumno_id, clase.fecha, clase.hora, clase.sede]);
    }

    res.status(201).json({ mensaje: 'Clases guardadas con éxito' });
  } catch (err) {
    console.error('Error al guardar clase:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener clases de una semana
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

    const resultado = await pool.query(
      `
      SELECT c.*, a.nombre, a.apellido, a.numero_alumno
      FROM clases c
      JOIN alumnos a ON a.id = c.alumno_id
      WHERE ${where}
      ORDER BY c.fecha, c.hora
      `,
      params
    );

    res.json(resultado.rows);
  } catch (err) {
    console.error('Error al obtener clases:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Borrar muchas clases por ID
router.delete('/', async (req, res) => {
  const { ids } = req.body; // { ids: number[] }

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids requeridos' });
  }

  try {
    const r = await pool.query(
      'DELETE FROM clases WHERE id = ANY($1::int[])',
      [ids]
    );
    res.json({ eliminadas: r.rowCount });
  } catch (err) {
    console.error('Error al borrar clases:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
