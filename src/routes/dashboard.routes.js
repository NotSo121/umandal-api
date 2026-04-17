const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { getStats, getCharts } = require('../controllers/dashboard.controller');

router.use(authMiddleware);

router.get('/stats', getStats);
router.get('/charts', getCharts);

module.exports = router;