// routes/authMobileRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db'); // tu pool/cliente PG

// ====== CONFIG (ajustable por .env) ======
const TBL        = process.env.MOBILE_TABLE || 'alumnos';
const NUM_FIELD  = process.env.MOBILE_NUM_FIELD || 'numero_alumno';
const SURNAME_FIELD = process.env.MOBILE_SURNAME_FIELD || 'apellido';
const NAME_FIELD    = process.env.MOBILE_NAME_FIELD || 'nombre';
const ACTIVE_FIELD  = process.env.MOBILE_ACTIVE_FIELD || 'activo';
const ACTIVE_TRUE_VAL = process.env.MOBILE_ACTIVE_TRUE_VAL || 'true';
// =========================================

const JWT_SECRET = process.env.JWT_SECRET || 'cambia-esto';

function norm(s) { return String(s || '').trim(); }

/** Intenta con unaccent; si falla (extensión no disponible), cae a translate(). */
async function findUserByNumeroApellido(numero, apellido) {
  const num = norm(numero);
  const ape = norm(apellido);

  const baseSelect = `
    SELECT id,
           ${NUM_FIELD}   AS numero,
           ${NAME_FIELD}  AS nombre,
           ${SURNAME_FIELD} AS apellido,
           ${ACTIVE_FIELD} AS activo_raw
    FROM ${TBL}
    WHERE ${NUM_FIELD} = $1
      AND %%APELLIDO_MATCH%%
    LIMIT 1
  `;

  // 1) Intento con unaccent (si existe)
  const sqlUnaccent = baseSelect.replace(
    '%%APELLIDO_MATCH%%',
    `unaccent(lower(${SURNAME_FIELD})) = unaccent(lower($2))`
  );
  try {
    const { rows } = await db.query(sqlUnaccent, [num, ape]);
    return rows[0] || null;
  } catch (_) {
    // 2) Fallback sin extensión: translate()
    const sqlTranslate = baseSelect.replace(
      '%%APELLIDO_MATCH%%',
      `translate(lower(${SURNAME_FIELD}),
        'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouaeiouuuñn'
      ) = translate(lower($2),
        'áéíóúÁÉÍÓÚüÜñÑ', 'aeiouaeiouuuñn')`
    );
    const { rows } = await db.query(sqlTranslate, [num, ape]);
    return rows[0] || null;
  }
}

router.post('/login', async (req, res) => {
  try {
    const { numero, apellido } = req.body || {};
    if (!numero || !apellido) {
      return res.status(400).json({ error: 'Faltan credenciales' });
    }

    const u = await findUserByNumeroApellido(numero, apellido);
    if (!u) return res.status(401).json({ error: 'Credenciales inválidas' });

    // normalizamos "activo"
    let isActive = true;
    if (u.activo_raw === null || u.activo_raw === undefined) {
      isActive = true;
    } else if (typeof u.activo_raw === 'boolean') {
      isActive = u.activo_raw;
    } else if (typeof u.activo_raw === 'string') {
      isActive = u.activo_raw.toLowerCase() === String(ACTIVE_TRUE_VAL).toLowerCase();
    } else if (typeof u.activo_raw === 'number') {
      isActive = u.activo_raw === 1;
    }

    if (!isActive) return res.status(403).json({ error: 'Usuario inactivo' });

    const token = jwt.sign({ numero: u.numero, uid: u.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      usuario: { id: u.id, numero: u.numero, nombre: u.nombre, apellido: u.apellido }
    });
  } catch (e) {
    console.error('authMobile/login', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

module.exports = router;
