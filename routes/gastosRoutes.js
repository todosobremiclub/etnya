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

// Crear tipo de gasto
router.post('/tipos-gasto', async (req, res) => {
  const { nombre } = req.body;
  try {
    await pool.query('INSERT INTO tipos_gasto (nombre) VALUES ($1)', [nombre]);
    res.status(201).send('Gasto creado');
  } catch (err) {
    console.error('Error al crear gasto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Actualizar tipo de gasto
router.put('/tipos-gasto/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;
  try {
    await pool.query('UPDATE tipos_gasto SET nombre = $1 WHERE id = $2', [nombre, id]);
    res.send('Gasto actualizado');
  } catch (err) {
    console.error('Error al actualizar gasto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Eliminar tipo de gasto
router.delete('/tipos-gasto/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM tipos_gasto WHERE id = $1', [id]);
    res.send('Gasto eliminado');
  } catch (err) {
    console.error('Error al eliminar gasto:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});


module.exports = router;
