require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Importar rutas
const alumnosRoutes = require('./routes/alumnosRoutes');

// Usar rutas
app.use('/alumnos', alumnosRoutes);

// Servir frontend
app.use(express.static(path.join(__dirname, 'public/admin-panel')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});
