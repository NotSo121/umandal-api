const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// GET /api/users
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// POST /api/users
const createUser = async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: role === 'ADMIN' ? 'ADMIN' : 'USER',
      },
      select: { id: true, username: true, role: true, isActive: true, createdAt: true },
    });

    return res.status(201).json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// PUT /api/users/:id
const updateUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { username, password, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const updateData = {};
    if (username) updateData.username = username;
    if (role) updateData.role = role === 'ADMIN' ? 'ADMIN' : 'USER';
    if (password) updateData.password = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, role: true, isActive: true, updatedAt: true },
    });

    return res.json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// DELETE /api/users/:id
const deleteUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // Prevent deleting yourself
    if (id === req.user.sub) {
      return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    await prisma.user.delete({ where: { id } });

    return res.json({ success: true, data: 'User deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// PATCH /api/users/:id/toggle
const toggleUser = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (id === req.user.sub) {
      return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    }

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { isActive: !existing.isActive },
      select: { id: true, username: true, role: true, isActive: true },
    });

    return res.json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getAllUsers, createUser, updateUser, deleteUser, toggleUser };