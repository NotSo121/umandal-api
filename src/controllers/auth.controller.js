const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    // Find user with linked bhakto
    const user = await prisma.user.findUnique({
      where: { username },
      include: { bhakto: { select: { id: true, fullName: true } } },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, error: 'Account is deactivated' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Sign JWT (include bhaktoId for fast permission checks)
    const token = jwt.sign(
      {
        sub:      user.id,
        username: user.username,
        role:     user.role,
        bhaktoId: user.bhaktoId ?? null,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.json({
      success: true,
      data: {
        token,
        user: {
          id:         user.id,
          username:   user.username,
          role:       user.role,
          bhaktoId:   user.bhaktoId   ?? null,
          leaderName: user.bhakto?.fullName ?? null,
        },
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: {
        id: true, username: true, role: true, isActive: true, createdAt: true,
        bhaktoId: true,
        bhakto: { select: { id: true, fullName: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.json({
      success: true,
      data: {
        ...user,
        leaderName: user.bhakto?.fullName ?? null,
      },
    });
  } catch (err) {
    console.error('GetMe error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// PUT /api/auth/me  — change own password (and optionally username)
const updateMe = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, error: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.sub },
      data:  { password: hashed },
    });

    return res.json({ success: true, data: 'Password updated successfully' });
  } catch (err) {
    console.error('UpdateMe error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { login, getMe, updateMe };
