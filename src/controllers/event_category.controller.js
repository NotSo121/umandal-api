const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// GET /api/event-category
const getAllEventCategories = async (req, res) => {
  try {
    const categories = await prisma.eventCategory.findMany({
      orderBy: { name: 'asc' },
    });
    return res.json({ success: true, data: categories });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// POST /api/event-category
const createEventCategory = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const category = await prisma.eventCategory.create({
      data: { name: name.trim() },
    });

    return res.status(201).json({ success: true, data: category });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'Event category name already exists' });
    }
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// PUT /api/event-category/:id
const updateEventCategory = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    const existing = await prisma.eventCategory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Event category not found' });
    }

    const category = await prisma.eventCategory.update({
      where: { id },
      data: { name: name.trim() },
    });

    return res.json({ success: true, data: category });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ success: false, error: 'Event category name already exists' });
    }
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// DELETE /api/event-category/:id
// Events keep eventCategoryId = NULL via ON DELETE SET NULL
const deleteEventCategory = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.eventCategory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Event category not found' });
    }

    await prisma.eventCategory.delete({ where: { id } });

    return res.json({ success: true, data: 'Event category deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getAllEventCategories, createEventCategory, updateEventCategory, deleteEventCategory };
