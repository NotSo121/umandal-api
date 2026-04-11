const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { getStats } = require('../controllers/dashboard.controller');

router.use(authMiddleware);

router.get('/stats', getStats);

module.exports = router;