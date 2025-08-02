require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas
const alumnosRoutes = require('./routes/alumnosRoutes');
const tiposClaseRoutes = require('./routes/tiposClase');
const feriadosRoutes = require('./routes/feriadosRoutes');
const pagosRoutes = require('./routes/pagosRoutes');
const cuentasRoutes = require('./routes/cuentasRoutes');
const reportesRoutes = require('./routes/reportesRoutes'); // ✅ nueva ruta

app.use('/alumnos', alumnosRoutes);
app.use('/tipos-clase', tiposClaseRoutes);
app.use('/feriados', feriadosRoutes);
app.use('/pagos', pagosRoutes);
app.use('/cuentas', cuentasRoutes);
app.use('/reportes', reportesRoutes); // ✅ endpoint para reportes
app.use('/uploads', express.static('uploads'));


// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public/admin-panel')));

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
