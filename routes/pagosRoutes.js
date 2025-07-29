const express = require('express');
const router = express.Router();
const pool = require('../db');

// Guardar pago
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

module.exports = router;
