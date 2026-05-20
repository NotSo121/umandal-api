const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // DB check: ensures deleted / deactivated / password-changed tokens are rejected
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, username: true, role: true, isActive: true, bhaktoId: true, tokenVersion: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Account not found' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, error: 'Account is deactivated' });
    }

    if (user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
    }

    req.user = {
      sub:          user.id,
      username:     user.username,
      role:         user.role,
      bhaktoId:     user.bhaktoId ?? null,
      tokenVersion: user.tokenVersion,
    };

    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

module.exports = authMiddleware;
