const express = require('express');
const router = express.Router();
const pool = require('../db'); // Asegurate de tener esto apuntando a tu conexión PostgreSQL

// Ruta de prueba
router.get('/', (req, res) => {
  res.send('Listado de alumnos');
});

// Ruta para guardar nuevo alumno
router.post('/', async (req, res) => {
  const {
    numero_alumno,
    nombre,
    apellido,
    fecha_nacimiento,
    edad,
    telefono,
    contacto_nombre,
    contacto_telefono,
    fecha_inicio,
    tipo_clase,
    estado_pago,
    activo
  } = req.body;

  try {
    await pool.query(
      `INSERT INTO alumnos (
        numero_alumno, nombre, apellido, fecha_nacimiento, edad,
        telefono, contacto_nombre, contacto_telefono,
        fecha_inicio, tipo_clase, estado_pago, activo
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        numero_alumno, nombre, apellido, fecha_nacimiento, edad,
        telefono, contacto_nombre, contacto_telefono,
        fecha_inicio, tipo_clase, estado_pago, activo
      ]
    );

    res.status(200).send('Alumno guardado correctamente');
  } catch (err) {
    console.error('Error al guardar alumno:', err);
    res.status(500).send('Error al guardar el alumno');
  }
});

module.exports = router;
