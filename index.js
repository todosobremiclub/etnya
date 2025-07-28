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
const feriadosRoutes = require('./routes/feriadosRoutes'); // ✅ nueva línea

app.use('/alumnos', alumnosRoutes);
app.use('/tipos-clase', tiposClaseRoutes);
app.use('/feriados', feriadosRoutes); // ✅ endpoint para feriados

// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public/admin-panel')));

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
