const express = require('express');
const router = express.Router();
const db = require('../db');         // tu pool PG
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_ADMIN_SECRET || 'cambia-esto';

router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).send('Faltan credenciales');

    const { rows } = await db.query(
      'SELECT id, username, password, rol FROM admins WHERE username=$1 LIMIT 1',
      [username]
    );
    const u = rows[0];
    if (!u) return res.status(401).send('Usuario o contraseña inválidos');

    // Verificar bcrypt almacenado con pgcrypto
    const { rows: chk } = await db.query(
      'SELECT crypt($1, $2) = $2 AS ok',
      [password, u.password]
    );
    if (!chk[0].ok) return res.status(401).send('Usuario o contraseña inválidos');

    const token = jwt.sign({ id: u.id, username: u.username, rol: u.rol }, SECRET, { expiresIn: '7d' });
    res.json({ token, username: u.username, rol: u.rol });
  } catch (e) {
    console.error('login admin error', e);
    res.status(500).send('Error login');
  }
});

module.exports = router;
