const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { roleMiddleware } = require('../middleware/role.middleware');
const {
  getAllEventCategories,
  createEventCategory,
  updateEventCategory,
  deleteEventCategory,
} = require('../controllers/event_category.controller');

router.use(authMiddleware);

router.get('/',       getAllEventCategories);
router.post('/',      roleMiddleware, createEventCategory);
router.put('/:id',    roleMiddleware, updateEventCategory);
router.delete('/:id', roleMiddleware, deleteEventCategory);

module.exports = router;
