const express = require('express');
const router = express.Router();
const pool = require('../db');

// LISTAR
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, sede, dow, to_char(hora, 'HH24:MI') AS hora
       FROM no_clases
       ORDER BY sede, dow, hora`
    );
    res.json(r.rows);
  } catch (e) {
    console.error('GET /no-clases', e);
    res.status(500).send('Error al obtener no_clases');
  }
});

// CREAR
router.post('/', async (req, res) => {
  try {
    const { sede, dow, hora } = req.body; // hora 'HH:MM'
    await pool.query(
      `INSERT INTO no_clases (sede, dow, hora) VALUES ($1,$2,$3::time)`,
      [sede, dow, hora]
    );
    res.sendStatus(201);
  } catch (e) {
    console.error('POST /no-clases', e);
    res.status(500).send('Error al crear no_clase');
  }
});

// ACTUALIZAR
router.put('/:id', async (req, res) => {
  try {
    const { sede, dow, hora } = req.body;
    await pool.query(
      `UPDATE no_clases SET sede=$1, dow=$2, hora=$3::time WHERE id=$4`,
      [sede, dow, hora, req.params.id]
    );
    res.sendStatus(200);
  } catch (e) {
    console.error('PUT /no-clases', e);
    res.status(500).send('Error al actualizar no_clase');
  }
});

// ELIMINAR
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM no_clases WHERE id=$1`, [req.params.id]);
    res.sendStatus(200);
  } catch (e) {
    console.error('DELETE /no-clases', e);
    res.status(500).send('Error al eliminar no_clase');
  }
});

module.exports = router;
