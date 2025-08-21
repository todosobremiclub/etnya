require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// ===== DB =====
const pool = require('./db');

// Migración automática
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

app.use('/alumnos', alumnosRoutes);
app.use('/tipos-clase', tiposClaseRoutes);
app.use('/feriados', feriadosRoutes);
app.use('/pagos', pagosRoutes);
app.use('/cuentas', cuentasRoutes);
app.use('/reportes', reportesRoutes);
app.use('/becados', becadosRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/gastos', gastosRoutes);
app.use('/clases', clasesRoutes);
app.use('/no-clases', noClasesRoutes); // 👈 nuevo

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Error interno' });
});


// ===== PATCH TEMPORAL: POST directo para /clases =====
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

// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public/admin-panel')));

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
