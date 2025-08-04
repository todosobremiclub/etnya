const express = require('express');
const router = express.Router();
const pool = require('../db');

// Obtener lista de becados con nombre completo
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT becados.id, alumnos.id AS alumno_id,
             alumnos.numero_alumno || ' - ' || alumnos.apellido || ', ' || alumnos.nombre AS nombre_completo
      FROM becados
      JOIN alumnos ON alumnos.id = becados.alumno_id
      ORDER BY alumnos.apellido, alumnos.nombre
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener becados:', error);
    res.status(500).json({ error: 'Error al obtener becados' });
  }
});

// Agregar alumno a becados
router.post('/', async (req, res) => {
  const { alumno_id } = req.body;
  if (!alumno_id) {
    return res.status(400).json({ error: 'Falta alumno_id' });
  }

  try {
    // Evitar duplicados
    const yaExiste = await pool.query('SELECT * FROM becados WHERE alumno_id = $1', [alumno_id]);
    if (yaExiste.rowCount > 0) {
      return res.status(400).json({ error: 'El alumno ya está becado' });
    }

    const result = await pool.query('INSERT INTO becados (alumno_id) VALUES ($1) RETURNING *', [alumno_id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error al agregar becado:', error);
    res.status(500).json({ error: 'Error al agregar becado' });
  }
});

// Eliminar un becado
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM becados WHERE id = $1', [id]);
    res.sendStatus(204);
  } catch (error) {
    console.error('Error al eliminar becado:', error);
    res.status(500).json({ error: 'Error al eliminar becado' });
  }
});

module.exports = router;
