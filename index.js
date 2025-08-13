require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// ===== DB =====
const pool = require('./db');

// Migración automática para asegurar columnas/índice requeridos por Agenda
(async () => {
  try {
    await pool.query(`ALTER TABLE clases ADD COLUMN IF NOT EXISTS estado TEXT`);
    await pool.query(`ALTER TABLE clases ADD COLUMN IF NOT EXISTS nota   TEXT`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clases_fecha_sede ON clases(fecha, sede)`);
    console.log('Migración: columnas estado/nota e índice creados (si no existían).');
  } catch (err) {
    console.error('Error en migración automática de clases:', err);
  }
})();

// ===== Middlewares =====
app.use(cors());
app.use(express.json());

// ===== Rutas =====
const alumnosRoutes   = require('./routes/alumnosRoutes');
const tiposClaseRoutes= require('./routes/tiposClase');
const feriadosRoutes  = require('./routes/feriadosRoutes');
const pagosRoutes     = require('./routes/pagosRoutes');
const cuentasRoutes   = require('./routes/cuentasRoutes');
const reportesRoutes  = require('./routes/reportesRoutes');
const becadosRoutes   = require('./routes/becadosRoutes');
const gastosRoutes    = require('./routes/gastosRoutes');
const clasesRoutes    = require('./routes/clasesRoutes');

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

// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public/admin-panel')));

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
