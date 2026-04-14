// Allows ADMIN and SUPER_ADMIN
const roleMiddleware = (req, res, next) => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Access denied. Admins only.' });
  }
  next();
};

// Allows SUPER_ADMIN only
const superAdminMiddleware = (req, res, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Access denied. Super Admins only.' });
  }
  next();
};

// Role rank — higher = more privileged
const roleRank = { SUPER_ADMIN: 3, ADMIN: 2, USER: 1 };
const getRank = (role) => roleRank[role] ?? 0;

module.exports = { roleMiddleware, superAdminMiddleware, getRank };
