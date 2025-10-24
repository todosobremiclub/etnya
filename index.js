// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const rateLimit = require('express-rate-limit');          // NUEVO
const authMobileRoutes = require('./routes/authMobileRoutes'); // NUEVO
const appMobileRoutes  = require('./routes/appMobileRoutes');  // NUEVO


// ===== DB =====
const pool = require('./db');

// ====== CONFIG ======
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || 'cambia-esto';

// ===== Migración automática (no rompe si ya existe) =====
(async () => {
  try {
    // clases
    await pool.query(`ALTER TABLE clases ADD COLUMN IF NOT EXISTS estado TEXT`);
    await pool.query(`ALTER TABLE clases ADD COLUMN IF NOT EXISTS nota   TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clases_fecha_sede ON clases(fecha, sede)`);

    // no_clases (bloques sin clase por sede/día/hora)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS no_clases (
        id   SERIAL PRIMARY KEY,
        sede TEXT NOT NULL,
        dow  INT  NOT NULL CHECK (dow BETWEEN 1 AND 7), -- 1=Lun ... 7=Dom
        hora TIME NOT NULL
      )
    `);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_no_clases ON no_clases(sede, dow, hora)`);

    console.log('Migración: clases/no_clases listas (creadas/actualizadas si no existían).');
  } catch (err) {
    console.error('Error en migración automática:', err);
  }
})();

// ===== Middlewares =====
app.use(cors());
app.use(express.json());

// ====== Rutas para la App Móvil (NO pisan nada) ======
// Limitador solo para /auth/login (mitiga fuerza bruta)
const loginLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
app.use('/auth/login', loginLimiter);

// Prefijos NUEVOS (no afectan rutas actuales)
app.use('/auth', authMobileRoutes);
app.use('/app',  appMobileRoutes);
// ======================================================


// ===== Helpers de auth (admin panel) =====
function verificarAdminJWT(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).send('Falta token');
    const payload = jwt.verify(token, JWT_ADMIN_SECRET);
    req.user = { id: payload.id, username: payload.username, rol: payload.rol };
    next();
  } catch (e) {
    return res.status(401).send('Token inválido');
  }
}

function soloAdmin(req, res, next) {
  if (req.user?.rol === 'admin') return next();
  return res.status(403).send('No autorizado');
}

// ===== Login admin con roles (admin / operador) =====
// Tabla esperada: admins(id, username, password, rol)
// password almacenado con bcrypt vía pgcrypto: crypt('pass', gen_salt('bf'))
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).send('Faltan credenciales');

    const qUser = `SELECT id, username, password, rol FROM admins WHERE username=$1 LIMIT 1`;
    const { rows } = await pool.query(qUser, [username]);
    const u = rows[0];
    if (!u) return res.status(401).send('Usuario o contraseña inválidos');

    // Verificar hash con pgcrypto
    const { rows: chk } = await pool.query(`SELECT crypt($1, $2) = $2 AS ok`, [password, u.password]);
    if (!chk[0]?.ok) return res.status(401).send('Usuario o contraseña inválidos');

    const token = jwt.sign({ id: u.id, username: u.username, rol: u.rol }, JWT_ADMIN_SECRET, { expiresIn: '7d' });
    res.json({ token, username: u.username, rol: u.rol });
  } catch (e) {
    console.error('login admin error', e);
    res.status(500).send('Error login');
  }
});

// ===== Rutas =====
const alumnosRoutes     = require('./routes/alumnosRoutes');
const tiposClaseRoutes  = require('./routes/tiposClase');
const feriadosRoutes    = require('./routes/feriadosRoutes');
const pagosRoutes       = require('./routes/pagosRoutes');
const cuentasRoutes     = require('./routes/cuentasRoutes');
const reportesRoutes    = require('./routes/reportesRoutes');
const becadosRoutes     = require('./routes/becadosRoutes');
const gastosRoutes      = require('./routes/gastosRoutes');
const clasesRoutes      = require('./routes/clasesRoutes');
const noClasesRoutes    = require('./routes/noClasesRoutes'); // 👈 nuevo

// Rutas públicas (como ya las tenías)
app.use('/alumnos', alumnosRoutes);
app.use('/tipos-clase', tiposClaseRoutes);
app.use('/feriados', feriadosRoutes);
app.use('/pagos', pagosRoutes);
app.use('/cuentas', cuentasRoutes);
app.use('/becados', becadosRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/clases', clasesRoutes);
app.use('/no-clases', noClasesRoutes); // 👈 nuevo

// Rutas PROTEGIDAS solo para ADMIN:
app.use('/reportes', verificarAdminJWT, soloAdmin, reportesRoutes);
app.use('/gastos',   verificarAdminJWT, soloAdmin, gastosRoutes);

// ===== PATCH TEMPORAL: POST directo para /clases (se mantiene) =====
app.post('/clases', async (req, res, next) => {
  try {
    const { alumno_id, clases } = req.body || {};
    if (!Array.isArray(clases) || !clases.length) {
      return res.status(400).json({ error: 'Faltan clases a crear' });
    }
    const normTime = t => (t && t.length === 5) ? `${t}:00` : t;
    const ids = [];
    for (const c of clases) {
      const q = `
        INSERT INTO clases (alumno_id, fecha, hora, sede, nota)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;
      const vals = [
        alumno_id ?? null,
        String(c.fecha).slice(0, 10),
        normTime(c.hora),
        String(c.sede || '').trim(),
        c.nota ? String(c.nota).trim() : null
      ];
      const out = await pool.query(q, vals);
      ids.push(out.rows[0].id);
    }
    res.status(201).json({ created: ids.length, ids });
  } catch (e) {
    next(e);
  }
});

// ===== Listado de rutas en consola =====
const printRoutes = (label) => {
  console.log(`Rutas ${label}:`);
  app._router.stack
    .filter(l => l.route)
    .forEach(l => {
      const methods = Object.keys(l.route.methods).join(',').toUpperCase();
      console.log(methods.padEnd(12), l.route.path);
    });
};
printRoutes('registradas');

// ===== Static (panel admin) =====
app.use(express.static(path.join(__dirname, 'public/admin-panel')));

// ===== Error handler =====
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno' });
});

// ===== Start =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
