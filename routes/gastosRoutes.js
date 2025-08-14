const express = require('express');
const router = express.Router();
const pool = require('../db');

// ----------------------------- TIPOS DE GASTO -----------------------------

// Obtener tipos de gasto
router.get('/tipos-gasto', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre FROM tipos_gasto ORDER BY nombre');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener tipos de gasto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Crear tipo de gasto
router.post('/tipos-gasto', async (req, res) => {
  const { nombre } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO tipos_gasto (nombre) VALUES ($1) RETURNING *',
      [nombre]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear tipo de gasto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Editar tipo de gasto
router.put('/tipos-gasto/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;
  try {
    await pool.query('UPDATE tipos_gasto SET nombre = $1 WHERE id = $2', [nombre, id]);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error al actualizar tipo de gasto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar tipo de gasto
router.delete('/tipos-gasto/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM tipos_gasto WHERE id = $1', [id]);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error al eliminar tipo de gasto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// ----------------------------- GASTOS REGISTRADOS -----------------------------

// Obtener gastos registrados
router.get('/registrados', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM gastos ORDER BY fecha DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener gastos registrados:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Registrar nuevo gasto
router.post('/', async (req, res) => {
  const { nombre, monto, fecha, cuenta } = req.body;
  try {
    await pool.query(
      'INSERT INTO gastos (nombre, monto, fecha, cuenta) VALUES ($1, $2, $3, $4)',
      [nombre, monto, fecha, cuenta]
    );
    res.status(201).send('Gasto registrado');
  } catch (err) {
    console.error('Error al registrar gasto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar gasto
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM gastos WHERE id = $1', [id]);
    res.send('Gasto eliminado');
  } catch (err) {
    console.error('Error al eliminar gasto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;
