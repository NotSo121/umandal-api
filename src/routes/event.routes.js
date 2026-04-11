const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const {
  getAllEvents, getEventById, createEvent, updateEvent, deleteEvent,
} = require('../controllers/event.controller');

router.use(authMiddleware);

router.get('/',     getAllEvents);
router.get('/:id',  getEventById);
router.post('/',    createEvent);
router.put('/:id',  updateEvent);
router.delete('/:id', deleteEvent);

module.exports = router;