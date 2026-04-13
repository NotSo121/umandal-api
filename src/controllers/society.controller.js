const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// GET /api/society
const getAllSocieties = async (req, res) => {
  try {
    const societies = await prisma.society.findMany({
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: societies });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// POST /api/society
const createSociety = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const society = await prisma.society.create({
      data: { name: name.trim() },
    });

    return res.status(201).json({ success: true, data: society });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'Society name already exists' });
    }
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// PUT /api/society/:id
const updateSociety = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const existing = await prisma.society.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Society not found' });
    }

    const society = await prisma.society.update({
      where: { id },
      data: { name: name.trim() },
    });

    return res.json({ success: true, data: society });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'Society name already exists' });
    }
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// DELETE /api/society/:id
const deleteSociety = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.society.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Society not found' });
    }

    await prisma.society.delete({ where: { id } });

    return res.json({ success: true, data: 'Society deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getAllSocieties, createSociety, updateSociety, deleteSociety };
