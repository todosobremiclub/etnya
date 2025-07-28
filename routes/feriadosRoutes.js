const express = require('express');
const router = express.Router();
const pool = require('../db');

// Obtener todos los feriados
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM feriados ORDER BY fecha');
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener feriados:', error);
    res.status(500).send('Error al obtener feriados');
  }
});

// Crear un nuevo feriado
router.post('/', async (req, res) => {
  const { fecha, descripcion } = req.body;
  try {
    await pool.query('INSERT INTO feriados (fecha, descripcion) VALUES ($1, $2)', [fecha, descripcion]);
    res.sendStatus(201);
  } catch (error) {
    console.error('Error al crear feriado:', error);
    res.status(500).send('Error al crear feriado');
  }
});

// Actualizar feriado
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { fecha, descripcion } = req.body;
  try {
    await pool.query('UPDATE feriados SET fecha = $1, descripcion = $2 WHERE id = $3', [fecha, descripcion, id]);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error al actualizar feriado:', error);
    res.status(500).send('Error al actualizar feriado');
  }
});

// Eliminar feriado
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM feriados WHERE id = $1', [id]);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error al eliminar feriado:', error);
    res.status(500).send('Error al eliminar feriado');
  }
});

module.exports = router;
