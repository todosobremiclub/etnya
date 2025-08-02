const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Monto por cuenta
router.get('/por-cuenta', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT cuenta, SUM(monto) AS total
      FROM pagos
      GROUP BY cuenta
      ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /por-cuenta:', err);
    res.status(500).send('Error en reporte por cuenta');
  }
});

// 2. Monto por mes pagado (corregido)
router.get('/por-mes-pagado', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT mes_pagado AS mes, SUM(monto) AS total
      FROM pagos
      GROUP BY mes_pagado
      ORDER BY mes_pagado
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /por-mes-pagado:', err);
    res.status(500).send('Error en reporte por mes pagado');
  }
});

// 3. Monto por fecha de pago
router.get('/por-fecha-pago', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', fecha_pago), 'YYYY-MM') AS mes, SUM(monto) AS total
      FROM pagos
      WHERE fecha_pago IS NOT NULL
      GROUP BY DATE_TRUNC('month', fecha_pago)
      ORDER BY mes
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /por-fecha-pago:', err);
    res.status(500).send('Error en reporte por fecha de pago');
  }
});

	
// 4. Monto por sede
router.get('/por-sede', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.sede, SUM(p.monto) AS total
      FROM pagos p
      JOIN alumnos a ON a.id = p.alumno_id
      GROUP BY a.sede
      ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /por-sede:', err);
    res.status(500).send('Error en reporte por sede');
  }
});

// 5. Monto por modalidad
router.get('/por-modalidad', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.tipo_clase AS modalidad, SUM(p.monto) AS total
      FROM pagos p
      JOIN alumnos a ON a.id = p.alumno_id
      GROUP BY modalidad
      ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /por-modalidad:', err);
    res.status(500).send('Error en reporte por modalidad');
  }
});

// 6. Alumnos por sede
router.get('/alumnos-por-sede', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT sede, COUNT(*) AS cantidad
      FROM alumnos
      GROUP BY sede
      ORDER BY cantidad DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /alumnos-por-sede:', err);
    res.status(500).send('Error en reporte de alumnos por sede');
  }
});

// 7. Alumnos por modalidad
router.get('/alumnos-por-modalidad', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT tipo_clase AS modalidad, COUNT(*) AS cantidad
      FROM alumnos
      GROUP BY modalidad
      ORDER BY cantidad DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en /alumnos-por-modalidad:', err);
    res.status(500).send('Error en reporte de alumnos por modalidad');
  }
});

module.exports = router;
