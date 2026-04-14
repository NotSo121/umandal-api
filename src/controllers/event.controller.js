const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /api/events
const getAllEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { eventDate: 'desc' },
    });
    return res.json({ success: true, data: events });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// GET /api/events/:id
const getEventById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const event = await prisma.event.findUnique({ where: { id } });

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    return res.json({ success: true, data: event });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// POST /api/events
const createEvent = async (req, res) => {
  try {
    const { name, eventDate, location, description } = req.body;

    if (!name || !eventDate) {
      return res.status(400).json({ success: false, error: 'Name and event date are required' });
    }

    const event = await prisma.event.create({
      data: {
        name,
        eventDate: new Date(eventDate),
        location,
        description,
      },
    });

    return res.status(201).json({ success: true, data: event });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// PUT /api/events/:id
const updateEvent = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, eventDate, location, description, isActive } = req.body;

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const event = await prisma.event.update({
      where: { id },
      data: {
        name:        name        || existing.name,
        eventDate:   eventDate   ? new Date(eventDate) : existing.eventDate,
        location:    location    ?? existing.location,
        description: description ?? existing.description,
        isActive:    isActive    !== undefined ? Boolean(isActive) : existing.isActive,
      },
    });

    return res.json({ success: true, data: event });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// DELETE /api/events/:id
const deleteEvent = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    await prisma.event.delete({ where: { id } });

    return res.json({ success: true, data: 'Event deleted successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

// PATCH /api/events/:id/toggle-open  (admin only)
const toggleOpen = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.event.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const event = await prisma.event.update({
      where: { id },
      data: { isOpen: !existing.isOpen },
      select: { id: true, name: true, isOpen: true },
    });

    return res.json({ success: true, data: event });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};

module.exports = { getAllEvents, getEventById, createEvent, updateEvent, deleteEvent, toggleOpen };
