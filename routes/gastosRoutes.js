const express = require('express');
const router = express.Router();
const pool = require('../db');

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
  const { nombre, monto, fecha } = req.body;
  try {
    await pool.query(
      'INSERT INTO gastos (nombre, monto, fecha) VALUES ($1, $2, $3)',
      [nombre, monto, fecha]
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
