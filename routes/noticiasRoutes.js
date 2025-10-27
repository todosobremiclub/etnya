// routes/noticiasRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../config/db');
const verificarToken = require('../middlewares/verificarToken');
const subirImagen = require('../utils/subirAFirebase'); // devuelve { url, path }

// ---------- Multer (memoria) con validaciones ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Tipo de archivo no permitido'), ok);
  }
});

// ---------- Helpers ----------
const normalizarSede = (s) =>
  String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // saca acentos
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_'); // "Craig Reformer" -> "craig_reformer"

function parsearSedes(destino, sedesRaw) {
  if (destino !== 'sede') return null;
  if (!sedesRaw) throw new Error('Debe especificar "sedes" (array JSON) cuando destino = "sede"');

  let parsed = sedesRaw;
  if (typeof sedesRaw === 'string') {
    try { parsed = JSON.parse(sedesRaw); } catch { throw new Error('Formato de "sedes" inválido (debe ser JSON array)'); }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('"sedes" debe ser un array con al menos una sede');
  }
  return parsed.map(normalizarSede);
}

// ---------- Endpoints ----------

// Crear noticia
// Body: titulo, texto, destino ('todos'|'sede'), sedes (JSON array si destino='sede'), imagen (file opcional)
router.post('/', verificarToken, upload.single('imagen'), async (req, res) => {
  try {
    const { titulo, texto, destino } = req.body;

    if (!titulo || !texto || !destino) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: titulo, texto, destino' });
    }
    if (!['todos', 'sede'].includes(destino)) {
      return res.status(400).json({ error: 'destino inválido (use "todos" o "sede")' });
    }

    let sedesArr = null;
    try {
      sedesArr = parsearSedes(destino, req.body.sedes);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    let imagen_url = null;
    if (req.file) {
      const subida = await subirImagen(req.file.buffer, req.file.originalname);
      imagen_url = subida.url;
    }

    await db.query(
      `INSERT INTO public.noticias (titulo, texto, imagen_url, destino, sedes)
       VALUES ($1, $2, $3, $4, $5)`,
      [titulo, texto, imagen_url, destino, sedesArr]
    );

    res.json({ mensaje: 'Noticia creada' });
  } catch (err) {
    console.error('POST /noticias error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Listado completo (ADMIN)
router.get('/', verificarToken, async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, titulo, texto, imagen_url, destino, sedes, fecha
         FROM public.noticias
        ORDER BY fecha DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /noticias error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Para la app (filtrado por sede): incluye "todos" + las de esa sede
// GET /noticias/para-app?sede=Craig Reformer
router.get('/para-app', verificarToken, async (req, res) => {
  try {
    const sedeQ = String(req.query.sede || '').trim();
    if (!sedeQ) {
      const { rows } = await db.query(
        `SELECT id, titulo, texto, imagen_url, destino, sedes, fecha
           FROM public.noticias
          WHERE destino = 'todos'
          ORDER BY fecha DESC`
      );
      return res.json(rows);
    }

    const claveSede = normalizarSede(sedeQ);

    const { rows } = await db.query(
      `SELECT id, titulo, texto, imagen_url, destino, sedes, fecha
         FROM public.noticias
        WHERE destino = 'todos'
           OR (destino = 'sede' AND sedes @> ARRAY[$1])
        ORDER BY fecha DESC`,
      [claveSede]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /noticias/para-app error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener una noticia puntual (opcional, útil para edición puntual)
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT id, titulo, texto, imagen_url, destino, sedes, fecha
         FROM public.noticias
        WHERE id = $1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No encontrada' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /noticias/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Editar noticia (con posible reemplazo de imagen)
router.put('/:id', verificarToken, upload.single('imagen'), async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, texto, destino } = req.body;

    if (!titulo || !texto || !destino) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: titulo, texto, destino' });
    }
    if (!['todos', 'sede'].includes(destino)) {
      return res.status(400).json({ error: 'destino inválido (use "todos" o "sede")' });
    }

    let sedesArr = null;
    try {
      sedesArr = parsearSedes(destino, req.body.sedes);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    let nuevaImagenUrl = null;
    if (req.file) {
      const subida = await subirImagen(req.file.buffer, req.file.originalname);
      nuevaImagenUrl = subida.url;
    }

    await db.query(
      `UPDATE public.noticias
          SET titulo = $1,
              texto = $2,
              destino = $3,
              sedes = $4,
              imagen_url = COALESCE($5, imagen_url)
        WHERE id = $6`,
      [titulo, texto, destino, sedesArr, nuevaImagenUrl, id]
    );

    res.json({ mensaje: 'Noticia actualizada' });
  } catch (err) {
    console.error('PUT /noticias/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar noticia
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM public.noticias WHERE id = $1', [id]);
    res.json({ mensaje: 'Noticia eliminada' });
  } catch (err) {
    console.error('DELETE /noticias/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
