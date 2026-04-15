const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth.middleware');
const { superAdminMiddleware } = require('../middleware/role.middleware');

const prisma = new PrismaClient();

router.use(authMiddleware);

// GET /api/logs/login — SUPER_ADMIN only
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

module.exports = router;
