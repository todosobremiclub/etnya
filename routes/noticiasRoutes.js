// routes/noticiasRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db'); // antes: ../config/db
const verificarToken = require('../middleware/verificarToken'); // antes: ../middlewares/verificarToken
const subirImagen = require('../utils/subirAFirebase'); // (si aún no tenés este archivo, decime y te lo paso)

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
const normalizarSede = (s) => {
  const val = String(s || '').trim().toLowerCase();
  if (val.includes('craig')) return 'craig';
  if (val.includes('goyena')) return 'goyena';
  return '';
};

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

// Selección común de columnas (incluye el nombre/color de la categoría
// vía JOIN, para no obligar a la app a pedirlos aparte).
const SELECT_NOTICIA = `
  SELECT n.id, n.titulo, n.texto, n.vista_previa, n.imagen_url, n.destino, n.sedes, n.fecha,
         n.categoria_id,
         c.nombre AS categoria_nombre,
         c.color  AS categoria_color
    FROM public.noticias n
    LEFT JOIN noticias_categorias c ON c.id = n.categoria_id
`;

// =====================================================
//  Categorías de noticias (configurables desde el panel,
//  solapa Configuración)
// =====================================================

// Listado de categorías (con cantidad de noticias que la usan)
router.get('/categorias', verificarToken, async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.nombre, c.color, COUNT(n.id)::int AS cantidad
         FROM noticias_categorias c
         LEFT JOIN public.noticias n ON n.categoria_id = c.id
        GROUP BY c.id
        ORDER BY c.nombre`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /noticias/categorias error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Crear categoría
router.post('/categorias', verificarToken, async (req, res) => {
  try {
    const nombre = (req.body.nombre || '').toString().trim();
    const color = (req.body.color || '#B7E4C7').toString().trim();
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre de la categoría' });

    const { rows } = await db.query(
      `INSERT INTO noticias_categorias (nombre, color) VALUES ($1, $2) RETURNING *`,
      [nombre, color]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
    }
    console.error('POST /noticias/categorias error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Editar categoría (nombre y/o color)
router.put('/categorias/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const nombre = (req.body.nombre || '').toString().trim();
    const color = (req.body.color || '#B7E4C7').toString().trim();
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre de la categoría' });

    await db.query(
      `UPDATE noticias_categorias SET nombre = $1, color = $2 WHERE id = $3`,
      [nombre, color, id]
    );
    res.json({ mensaje: 'Categoría actualizada' });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya existe una categoría con ese nombre' });
    }
    console.error('PUT /noticias/categorias/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Eliminar categoría (las noticias que la usaban quedan sin categoría,
// no se borran)
router.delete('/categorias/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`UPDATE public.noticias SET categoria_id = NULL WHERE categoria_id = $1`, [id]);
    await db.query(`DELETE FROM noticias_categorias WHERE id = $1`, [id]);
    res.json({ mensaje: 'Categoría eliminada' });
  } catch (err) {
    console.error('DELETE /noticias/categorias/:id error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ---------- Endpoints de noticias ----------

// Crear noticia
// Body: titulo, texto, vista_previa, categoria_id, destino ('todos'|'sede'),
// sedes (JSON array si destino='sede'), imagen (file opcional)
router.post('/', verificarToken, upload.single('imagen'), async (req, res) => {
  try {
    const { titulo, texto, destino, vista_previa } = req.body;
    const categoriaId = req.body.categoria_id ? parseInt(req.body.categoria_id, 10) : null;

    // --- parsear "sedes" manualmente desde FormData ---
    let sedesLimpias = [];
    if (req.body.sedes) {
      try {
        const parsed = JSON.parse(req.body.sedes);
        sedesLimpias = Array.isArray(parsed) ? parsed.map(s => normalizarSede(s)) : [];
      } catch (e) {
        console.warn('⚠️ Error al parsear sedes:', req.body.sedes, e.message);
        sedesLimpias = [];
      }
    }

    if (!titulo || !texto || !destino) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: titulo, texto, destino' });
    }
    if (!['todos', 'sede'].includes(destino)) {
      return res.status(400).json({ error: 'destino inválido (use "todos" o "sede")' });
    }
    if (!categoriaId) {
      return res.status(400).json({ error: 'Falta la categoría' });
    }

    const sedesArr = destino === 'sede' ? sedesLimpias : null;

    let imagen_url = null;
    if (req.file) {
      const subida = await subirImagen(req.file.buffer, req.file.originalname);
      imagen_url = subida.url;
    }

    await db.query(
      `INSERT INTO public.noticias (titulo, texto, vista_previa, imagen_url, destino, sedes, categoria_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [titulo, texto, (vista_previa || '').toString().trim() || null, imagen_url, destino, sedesArr, categoriaId]
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
    const { rows } = await db.query(`${SELECT_NOTICIA} ORDER BY n.fecha DESC`);
    res.json(rows);
  } catch (err) {
    console.error('GET /noticias error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// =====================================================
//  Obtener noticias para la app Flutter (por sede)
// =====================================================
router.get('/para-app', async (req, res) => {
  try {
    // Normalizar sede del parámetro
    const sedeRaw = (req.query.sede || '').toString().trim().toLowerCase();
    let sede = '';
    if (sedeRaw.includes('craig')) sede = 'craig';
    else if (sedeRaw.includes('goyena')) sede = 'goyena';

    console.log('📰 /para-app -> sede solicitada:', sede || '(todas)');

    // Base query: todas las noticias "para todos"
    let query = `
      ${SELECT_NOTICIA}
      WHERE n.destino = 'todos'
    `;
    const params = [];

    // Agregar filtro por sede si corresponde
    if (sede) {
      query += `
        OR (
          n.destino = 'sede' AND (
            -- para text[] válido
            (ARRAY[$1] && n.sedes)
            -- para texto plano en caso de sedes mal tipeadas
            OR n.sedes::text ILIKE '%' || $1 || '%'
          )
        )
      `;
      params.push(sede);
    }

    query += ' ORDER BY n.fecha DESC LIMIT 100;';

    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('❌ GET /noticias/para-app error:', err);
    res.status(500).json({ error: 'No se pudieron obtener las noticias' });
  }
});

// Obtener una noticia puntual (opcional, útil para edición puntual)
router.get('/:id', verificarToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(`${SELECT_NOTICIA} WHERE n.id = $1`, [id]);
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
    const { titulo, texto, destino, vista_previa } = req.body;
    const categoriaId = req.body.categoria_id ? parseInt(req.body.categoria_id, 10) : null;

    if (!titulo || !texto || !destino) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: titulo, texto, destino' });
    }
    if (!['todos', 'sede'].includes(destino)) {
      return res.status(400).json({ error: 'destino inválido (use "todos" o "sede")' });
    }
    if (!categoriaId) {
      return res.status(400).json({ error: 'Falta la categoría' });
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
              imagen_url = COALESCE($5, imagen_url),
              categoria_id = $6,
              vista_previa = $7
        WHERE id = $8`,
      [titulo, texto, destino, sedesArr, nuevaImagenUrl, categoriaId,
       (vista_previa || '').toString().trim() || null, id]
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
