const express = require('express');
const router = express.Router();
const pool = require('../db');

// Obtener todos los tipos de clase
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tipos_clase ORDER BY modalidad');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener tipos de clase:', err);
    res.status(500).send('Error interno');
  }
});

// Crear nuevo tipo de clase
router.post('/', async (req, res) => {
  const { modalidad, precio } = req.body;
  try {
    await pool.query(
      'INSERT INTO tipos_clase (modalidad, precio) VALUES ($1, $2)',
      [modalidad, precio]
    );
    res.status(201).send('Tipo de clase creado');
  } catch (err) {
    console.error('Error al guardar tipo de clase:', err);
    res.status(500).send('Error interno');
  }
});

// Eliminar tipo de clase
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM tipos_clase WHERE id = $1', [id]);
    res.sendStatus(204);
  } catch (err) {
    console.error('Error al eliminar tipo de clase:', err);
    res.status(500).send('Error interno');
  }
});

module.exports = router;
