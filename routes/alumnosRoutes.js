const express = require('express');
const router = express.Router();
const pool = require('../db');
const bucket = require('../config/firebase-config');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Configuración de multer para subida de archivos locales (por si se necesita)
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombre = Date.now() + ext;
    cb(null, nombre);
  }
});

// === ALUMNOS ===

// Obtener todos los alumnos con último mes pagado
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.*,
        (
          SELECT MAX(mes_pagado)
          FROM pagos
          WHERE alumno_id = a.id
        ) AS ultimo_mes_pagado
      FROM alumnos a
      ORDER BY numero_alumno ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener alumnos con pagos:', err);
    res.status(500).send('Error al obtener alumnos');
  }
});

// Guardar nuevo alumno
router.post('/', async (req, res) => {
  const {
    numero_alumno, nombre, apellido, fecha_nacimiento, edad,
    telefono, contacto_nombre, contacto_telefono,
    fecha_inicio, tipo_clase, sede, estado_pago, activo
  } = req.body;

  try {
    await pool.query(
      `INSERT INTO alumnos (
        numero_alumno, nombre, apellido, fecha_nacimiento, edad,
        telefono, contacto_nombre, contacto_telefono,
        fecha_inicio, tipo_clase, sede, estado_pago, activo
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        numero_alumno, nombre, apellido, fecha_nacimiento, edad,
        telefono, contacto_nombre, contacto_telefono,
        fecha_inicio, tipo_clase, sede, estado_pago, activo
      ]
    );

    res.status(200).send('Alumno guardado correctamente');
  } catch (err) {
    console.error('Error al guardar alumno:', err);
    res.status(500).send('Error al guardar el alumno');
  }
});

// Eliminar alumno por ID (con borrado de dependencias y adjuntos en Firebase)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Adjuntos: borrar archivos en Firebase (no rompe si no existen)
    const { rows: adjuntos } = await client.query(
      'SELECT nombre_archivo FROM adjuntos WHERE alumno_id = $1',
      [id]
    );
    for (const a of adjuntos) {
      try {
        await bucket.file(a.nombre_archivo).delete();
      } catch (e) {
        if (e.code !== 404) console.warn('No se pudo borrar en Firebase:', a.nombre_archivo, e.message);
      }
    }

    // 2) Borrar dependencias (ajustá si tenés más tablas hijas)
// ⚠️ NO borrar de pagos: la FK SET NULL preserva el histórico
await client.query('DELETE FROM clases        WHERE alumno_id = $1', [id]);
await client.query('DELETE FROM observaciones WHERE alumno_id = $1', [id]);
await client.query('DELETE FROM adjuntos      WHERE alumno_id = $1', [id]);
// await client.query('DELETE FROM pagos      WHERE alumno_id = $1', [id]);  // ← quitado
await client.query('DELETE FROM becados       WHERE alumno_id = $1', [id]);


    // 3) Borrar el alumno
    await client.query('DELETE FROM alumnos WHERE id = $1', [id]);

    await client.query('COMMIT');
    res.sendStatus(204);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('DELETE /alumnos error:', err.code, err.detail || err.message);
    res.status(500).json({ error: 'No se pudo eliminar el alumno' });
  } finally {
    client.release();
  }
});

// Actualizar alumno por ID
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    numero_alumno, nombre, apellido, fecha_nacimiento, edad,
    telefono, contacto_nombre, contacto_telefono,
    fecha_inicio, tipo_clase, sede, estado_pago, activo
  } = req.body;

  try {
    const existente = await pool.query(
      'SELECT id FROM alumnos WHERE numero_alumno = $1 AND sede = $2 AND id != $3',
      [numero_alumno, sede, id]
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
        sede = $11,
        estado_pago = $12,
        activo = $13
      WHERE id = $14`,
      [
        numero_alumno, nombre, apellido, fecha_nacimiento, edad,
        telefono, contacto_nombre, contacto_telefono,
        fecha_inicio, tipo_clase, sede, estado_pago, activo, id
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


// === OBSERVACIONES ===

// Obtener observaciones de un alumno
router.get('/:id/observaciones', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM observaciones WHERE alumno_id = $1 ORDER BY fecha DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener observaciones:', err);
    res.status(500).send('Error al obtener observaciones');
  }
});

// Agregar nueva observación
router.post('/:id/observaciones', async (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;
  try {
    await pool.query(
      'INSERT INTO observaciones (alumno_id, texto, fecha) VALUES ($1, $2, NOW())',
      [id, texto]
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('Error al guardar observación:', err);
    res.status(500).send('Error al guardar observación');
  }
});

// Eliminar observación
router.delete('/:id/observaciones/:idObservacion', async (req, res) => {
  const { id, idObservacion } = req.params;
  try {
    await pool.query(
      'DELETE FROM observaciones WHERE id = $1 AND alumno_id = $2',
      [idObservacion, id]
    );
    res.sendStatus(200);
  } catch (err) {
    console.error('Error al eliminar observación:', err);
    res.status(500).send('Error al eliminar observación');
  }
});


// === ADJUNTOS ===

// Obtener archivos adjuntos de un alumno
router.get('/:id/adjuntos', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM adjuntos WHERE alumno_id = $1 ORDER BY fecha DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener adjuntos:', err);
    res.status(500).send('Error al obtener adjuntos');
  }
});

// Subir archivo adjunto a Firebase
router.post('/:id/adjuntos', upload.single('archivo'), async (req, res) => {
  const { id } = req.params;
  const archivo = req.file;

  if (!archivo) return res.status(400).send('Archivo no recibido');

  try {
    const nombreUnico = `${Date.now()}-${uuidv4()}-${archivo.originalname}`;
    const file = bucket.file(nombreUnico);

    const stream = file.createWriteStream({
      metadata: { contentType: archivo.mimetype }
    });

    stream.on('error', (err) => {
      console.error('Error al subir a Firebase:', err);
      res.status(500).send('Error al subir archivo');
    });

    stream.on('finish', async () => {
      await file.makePublic();
      const url = file.publicUrl();

      await pool.query(
        'INSERT INTO adjuntos (alumno_id, nombre_archivo, url, fecha) VALUES ($1, $2, $3, NOW())',
        [id, nombreUnico, url]
      );

      res.sendStatus(200);
    });

    stream.end(archivo.buffer);
  } catch (err) {
    console.error('Error al subir archivo:', err);
    res.status(500).send('Error al subir archivo');
  }
});

// Eliminar archivo adjunto
router.delete('/:id/archivos/:nombreArchivo', async (req, res) => {
  const { id, nombreArchivo } = req.params;

  try {
    // Intentar eliminar de Firebase Storage
    try {
      await bucket.file(nombreArchivo).delete();
    } catch (error) {
      if (error.code === 404) {
        console.warn(`Archivo no encontrado en Firebase: ${nombreArchivo}`);
      } else {
        throw error; // Si es otro error, lo relanzamos
      }
    }

    // Eliminar de la base de datos
    await pool.query(
      'DELETE FROM adjuntos WHERE alumno_id = $1 AND nombre_archivo = $2',
      [id, nombreArchivo]
    );

    res.sendStatus(200);
  } catch (err) {
    console.error('Error al eliminar archivo adjunto:', err);
    res.status(500).send('Error al eliminar archivo');
  }
});

router.get('/buscar', async (req, res) => {
  const q = req.query.q || '';
  try {
    const resultado = await pool.query(`
      SELECT id, numero_alumno, nombre, apellido
      FROM alumnos
      WHERE CAST(numero_alumno AS TEXT) ILIKE $1
         OR nombre ILIKE $1
         OR apellido ILIKE $1
      ORDER BY apellido, nombre
      LIMIT 20
    `, [`%${q}%`]);

    res.json(resultado.rows);
  } catch (err) {
    console.error('Error al buscar alumnos:', err);
    res.status(500).send('Error al buscar alumnos');
  }
});

const ExcelJS = require('exceljs');

router.get('/exportar-xls', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM alumnos ORDER BY numero_alumno ASC');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Alumnos');

    worksheet.columns = [
      { header: 'N°', key: 'numero_alumno', width: 10 },
      { header: 'Nombre', key: 'nombre', width: 20 },
      { header: 'Apellido', key: 'apellido', width: 20 },
      { header: 'Teléfono', key: 'telefono', width: 15 },
      { header: 'Contacto', key: 'contacto_nombre', width: 20 },
      { header: 'Tel. contacto', key: 'contacto_telefono', width: 15 },
      { header: 'Fecha nacimiento', key: 'fecha_nacimiento', width: 15 },
      { header: 'Edad', key: 'edad', width: 8 },
      { header: 'Fecha ingreso', key: 'fecha_inicio', width: 15 },
      { header: 'Tipo clase', key: 'tipo_clase', width: 20 },
      { header: 'Sede', key: 'sede', width: 10 },
      { header: 'Activo', key: 'activo', width: 8 },
    ];

    result.rows.forEach(alumno => {
      worksheet.addRow(alumno);
    });

    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', 'attachment; filename="alumnos.xls"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error al exportar alumnos:', err);
    res.status(500).send('Error al exportar');
  }
});



module.exports = router;
