const express = require('express');
const router = express.Router();
const pool = require('../db');

// Registrar un nuevo pago
// Registrar un nuevo pago
router.post('/', async (req, res) => {
  const { alumno_id, mes_pagado, monto, cuenta } = req.body;
  const fecha_pago = new Date(); // Fecha actual

  if (!alumno_id || !mes_pagado || !monto || !cuenta) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  try {
    // Verificar si ya existe un pago para ese alumno y mes
    const existe = await pool.query(
      `SELECT 1 FROM pagos WHERE alumno_id = $1 AND mes_pagado = $2`,
      [alumno_id, mes_pagado]
    );

    if (existe.rows.length > 0) {
      return res.status(409).json({ error: 'Ya existe un pago para ese mes.' });
    }

    // Si no existe, insertarlo
    await pool.query(
      `INSERT INTO pagos (alumno_id, mes_pagado, monto, cuenta, fecha_pago)
       VALUES ($1, $2, $3, $4, $5)`,
      [alumno_id, mes_pagado, monto, cuenta, fecha_pago]
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

// Eliminar un pago por ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM pagos WHERE id = $1', [id]);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error al eliminar pago:', error);
    res.status(500).json({ error: 'Error al eliminar el pago.' });
  }
});

// ===== Pagos de clases de prueba =====
// Crea la tabla si no existe: id, comentario, monto, cuenta, fecha_pago
async function ensureTablaPagosPrueba() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pagos_prueba (
      id SERIAL PRIMARY KEY,
      comentario TEXT,
      monto NUMERIC NOT NULL,
      cuenta TEXT NOT NULL,
      fecha_pago TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}

// Registrar un pago de prueba (monto fijo + comentario + cuenta)
router.post('/prueba', async (req, res) => {
  const { comentario, monto, cuenta } = req.body || {};
  if (!monto || !cuenta) {
    return res.status(400).json({ error: 'Faltan datos: monto y cuenta son obligatorios.' });
  }
  try {
    await ensureTablaPagosPrueba();
    await pool.query(
      `INSERT INTO pagos_prueba (comentario, monto, cuenta) VALUES ($1, $2, $3)`,
      [comentario || null, monto, cuenta]
    );
    res.status(200).json({ message: 'Pago de prueba registrado.' });
  } catch (e) {
    console.error('Error al guardar pago de prueba:', e);
    res.status(500).json({ error: 'Error al guardar pago de prueba.' });
  }
});

// Listar pagos de prueba (orden por fecha desc)
router.get('/prueba', async (_req, res) => {
  try {
    await ensureTablaPagosPrueba();
    const r = await pool.query(`SELECT * FROM pagos_prueba ORDER BY fecha_pago DESC`);
    res.json(r.rows);
  } catch (e) {
    console.error('Error al obtener pagos de prueba:', e);
    res.status(500).json({ error: 'Error al obtener pagos de prueba' });
  }
});

// Eliminar pago de prueba
router.delete('/prueba/:id', async (req, res) => {
  const { id } = req.params || {};
  try {
    await pool.query(`DELETE FROM pagos_prueba WHERE id = $1`, [id]);
    res.sendStatus(200);
  } catch (e) {
    console.error('Error al eliminar pago de prueba:', e);
    res.status(500).json({ error: 'Error al eliminar pago de prueba.' });
  }
});


module.exports = router;

