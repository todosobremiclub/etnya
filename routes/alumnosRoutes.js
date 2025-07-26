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
    // Validar si ese número de alumno ya existe en otro registro
    const existente = await pool.query(
      'SELECT id FROM alumnos WHERE numero_alumno = $1 AND id != $2',
      [numero_alumno, id]
    );

    if (existente.rows.length > 0) {
      return res.status(400).send('El número de alumno ya está en uso por otro alumno.');
    }

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

// Cambiar solo el estado activo
router.put('/:id/activo', async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;
  try {
    await pool.query('UPDATE alumnos SET activo = $1 WHERE id = $2', [activo, id]);
    res.sendStatus(200);
  } catch (err) {
    console.error('Error al actualizar estado activo:', err);
    res.status(500).send('Error al actualizar estado activo');
  }
});

module.exports = router;


