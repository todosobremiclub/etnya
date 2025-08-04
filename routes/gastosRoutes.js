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

module.exports = router;
