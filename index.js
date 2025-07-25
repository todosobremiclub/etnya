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
app.use('/alumnos', alumnosRoutes);

// Servir frontend estático
app.use(express.static(path.join(__dirname, 'public/admin-panel')));

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
