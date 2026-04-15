const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth.middleware');
const { superAdminMiddleware } = require('../middleware/role.middleware');

const prisma = new PrismaClient();

router.use(authMiddleware);

// GET /api/logs/login — SUPER_ADMIN only
// Query: ?username=&status=&page=1&limit=20
router.get('/login', superAdminMiddleware, async (req, res) => {
  try {
    const { username, status, page = '1', limit = '20' } = req.query;

    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 20);
    const skip     = (pageNum - 1) * limitNum;

    const where = {};
    if (username) {
      where.username = { contains: username, mode: 'insensitive' };
    }
    if (status) {
      where.status = status;
    }

    const [total, logs] = await Promise.all([
      prisma.loginLog.count({ where }),
      prisma.loginLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
    ]);

    return res.json({
      success: true,
      data: {
        logs,
        total,
        page:       pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error('Get login logs error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// GET /api/logs/login/users — distinct usernames in LoginLog (for dropdown filter)
router.get('/login/users', superAdminMiddleware, async (req, res) => {
  try {
    const rows = await prisma.loginLog.findMany({
      distinct:  ['username'],
      select:    { username: true },
      orderBy:   { username: 'asc' },
    });
    return res.json({
      success: true,
      data: rows.map(r => r.username),
    });
  } catch (err) {
    console.error('Get login log users error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// DELETE /api/logs/login — SUPER_ADMIN only
// Query: ?username=  (optional, exact match)
//        ?olderThanDays=N  (optional, delete logs older than N days)
// No params = delete ALL logs
router.delete('/login', superAdminMiddleware, async (req, res) => {
  try {
    const { username, olderThanDays } = req.query;

    const where = {};
    if (username) {
      where.username = username;
    }
    if (olderThanDays) {
      const days = parseInt(olderThanDays, 10);
      if (!isNaN(days) && days > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        where.createdAt = { lt: cutoff };
      }
    }

    const { count } = await prisma.loginLog.deleteMany({ where });

    return res.json({
      success: true,
      data: { deleted: count },
    });
  } catch (err) {
    console.error('Delete login logs error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
