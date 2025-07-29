const express = require('express');
const router = express.Router();
const pool = require('../db');

// Registrar un nuevo pago
router.post('/', async (req, res) => {
  const { alumno_id, mes_pagado, monto } = req.body;
  const fecha_pago = new Date(); // Fecha actual

  if (!alumno_id || !mes_pagado || !monto) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  try {
    await pool.query(
      `INSERT INTO pagos (alumno_id, mes_pagado, monto, fecha_pago)
       VALUES ($1, $2, $3, $4)`,
      [alumno_id, mes_pagado, monto, fecha_pago]
    );
    res.status(200).json({ message: 'Pago registrado correctamente.' });
  } catch (error) {
    console.error('Error al guardar pago:', error);
    res.status(500).json({ error: 'Error al guardar el pago.' });
  }
});

// Obtener todos los pagos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM pagos ORDER BY fecha_pago DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener pagos:', error);
    res.status(500).json({ error: 'Error al obtener pagos' });
  }
});

module.exports = router;
