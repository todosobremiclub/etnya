const express = require('express');
const router = express.Router();
const pool = require('../db');

// Guardar clase (única o recurrente)
router.post('/', async (req, res) => {
  const { alumno_id, clases } = req.body;

  if (!alumno_id || !Array.isArray(clases) || clases.length === 0) {
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

module.exports = router;
