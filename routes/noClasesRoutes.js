// routes/noClasesRoutes.js
const express = require('express');
const router = express.Router();
const pool = require('../db');

// Listar
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, sede, dow, to_char(hora,'HH24:MI') AS hora FROM no_clases ORDER BY sede, dow, hora"
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// Crear (idempotente si ya existe)
router.post('/', async (req, res, next) => {
  try {
    let { sede, dow, hora } = req.body;
    sede = (sede || '').trim();
    dow  = parseInt(dow, 10);
    hora = (hora && hora.length === 5) ? hora + ':00' : hora;
    if (!sede || !dow || !hora) return res.status(400).json({ error: 'faltan datos' });

    const q = `INSERT INTO no_clases (sede,dow,hora)
               VALUES ($1,$2,$3)
               ON CONFLICT (sede,dow,hora) DO NOTHING
               RETURNING id`;
    let r = await pool.query(q, [sede, dow, hora]);
    if (!r.rows.length) {
      r = await pool.query('SELECT id FROM no_clases WHERE sede=$1 AND dow=$2 AND hora=$3', [sede, dow, hora]);
      return res.status(200).json(r.rows[0]); // ya existía
    }
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// Actualizar
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    let { sede, dow, hora } = req.body;
    sede = (sede || '').trim();
    dow  = parseInt(dow, 10);
    hora = (hora && hora.length === 5) ? hora + ':00' : hora;

    const { rows } = await pool.query(
      'UPDATE no_clases SET sede=$1, dow=$2, hora=$3 WHERE id=$4 RETURNING id',
      [sede, dow, hora, id]
    );
    if (!rows.length) return res.sendStatus(404);
    res.json(rows[0]);
  } catch (e) { next(e); }
});

// Eliminar
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await pool.query('DELETE FROM no_clases WHERE id=$1', [id]);
    if (!r.rowCount) return res.sendStatus(404);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
