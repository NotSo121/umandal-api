const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const {
  getAllEvents, getEventById, createEvent, updateEvent, deleteEvent,
} = require('../controllers/event.controller');

router.use(authMiddleware);

// Anyone authenticated can view events
router.get('/',     getAllEvents);
router.get('/:id',  getEventById);

// Admin only: create / edit / delete
router.post('/',        roleMiddleware, createEvent);
router.put('/:id',      roleMiddleware, updateEvent);
router.delete('/:id',   roleMiddleware, deleteEvent);

module.exports = router;
