const roleMiddleware = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Access denied. Admins only.' });
  }
  next();
};

module.exports = roleMiddleware;