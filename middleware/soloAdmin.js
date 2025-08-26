module.exports = function soloAdmin(req, res, next) {
  if (req.user?.rol === 'admin') return next();
  return res.status(403).send('No autorizado');
};
