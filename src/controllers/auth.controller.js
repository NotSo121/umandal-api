const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function logLogin(username, role, status, req) {
  try {
    await prisma.loginLog.create({
      data: {
        username,
        role:       role ?? null,
        status,
        ipAddress:  req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
        deviceInfo: req.body?.deviceInfo ?? null,
      },
    });
  } catch (_) { /* never block login */ }
}

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
      await logLogin(username, null, 'FAILED', req);
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      await logLogin(username, null, 'FAILED', req);
      return res.status(401).json({ success: false, error: 'Account is deactivated' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logLogin(username, null, 'FAILED', req);
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

    await logLogin(user.username, user.role, 'SUCCESS', req);

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

// PUT /api/auth/me  — update own username and/or password
const updateMe = async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;

    if (!username && !newPassword) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const updateData = {};

    // ── Username change ──────────────────────────────────────────────────
    if (username && username.trim() !== user.username) {
      const taken = await prisma.user.findUnique({ where: { username: username.trim() } });
      if (taken) {
        return res.status(400).json({ success: false, error: 'Username already taken' });
      }
      updateData.username = username.trim();
    }

    // ── Password change ──────────────────────────────────────────────────
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          error: 'Current password is required to change password',
        });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'New password must be at least 6 characters',
        });
      }
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, error: 'Current password is incorrect' });
      }
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return res.json({ success: true, data: { message: 'No changes made' } });
    }

    await prisma.user.update({ where: { id: req.user.sub }, data: updateData });

    return res.json({
      success: true,
      data: {
        usernameChanged: !!updateData.username,
        passwordChanged: !!updateData.password,
        newUsername:     updateData.username ?? user.username,
      },
    });
  } catch (err) {
    console.error('UpdateMe error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { login, getMe, updateMe };
