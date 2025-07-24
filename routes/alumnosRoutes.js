const express = require('express');
const router = express.Router();

// Ejemplo de ruta simple
router.get('/', (req, res) => {
  res.send('Listado de alumnos');
});

module.exports = router;
