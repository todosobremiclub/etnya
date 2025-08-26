const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_ADMIN_SECRET || 'cambia-esto';

module.exports = function verificarAdminJWT(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).send('Falta token');

  try {
    const payload = jwt.verify(token, SECRET);
    req.user = { id: payload.id, username: payload.username, rol: payload.rol };
    next();
  } catch (e) {
    return res.status(401).send('Token inválido');
  }
};
