const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { getNotifications } = require('../controllers/notification.controller');

router.use(authMiddleware);
router.get('/', getNotifications);

module.exports = router;
