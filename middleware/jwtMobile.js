// middleware/jwtMobile.js
const jwt = require('jsonwebtoken');

module.exports = function jwtMobile(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const parts = auth.split(' ');
    const token = parts.length === 2 ? parts[1] : null;
    if (!token) return res.status(401).json({ error: 'Sin token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'cambia-esto');
    // payload: { numero, uid }
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};
