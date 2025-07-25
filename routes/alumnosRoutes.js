const express = require('express');
const router = express.Router();
const pool = require('../db');

// Obtener todos los alumnos
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM alumnos ORDER BY numero_alumno ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener alumnos:', err);
    res.status(500).send('Error al obtener alumnos');
  }
});

// Guardar nuevo alumno
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

// Eliminar alumno por ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM alumnos WHERE id = $1', [id]);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error al eliminar alumno:', err);
    res.status(500).send('Error al eliminar alumno');
  }
});

// Actualizar alumno por ID
router.put('/:id', async (req, res) => {
  const { id } = req.params;
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
      `UPDATE alumnos SET
        numero_alumno = $1,
        nombre = $2,
        apellido = $3,
        fecha_nacimiento = $4,
        edad = $5,
        telefono = $6,
        contacto_nombre = $7,
        contacto_telefono = $8,
        fecha_inicio = $9,
        tipo_clase = $10,
        estado_pago = $11,
        activo = $12
      WHERE id = $13`,
      [
        numero_alumno, nombre, apellido, fecha_nacimiento, edad,
        telefono, contacto_nombre, contacto_telefono,
        fecha_inicio, tipo_clase, estado_pago, activo, id
      ]
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('Error al actualizar alumno:', err);
    res.status(500).send('Error al actualizar alumno');
  }
});


module.exports = router;

