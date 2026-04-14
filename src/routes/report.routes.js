const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const {
  getEventReport, getEventReportDetail, getLeaderSummary, getLeaderDetail,
} = require('../controllers/report.controller');

router.use(authMiddleware);

// All authenticated users: event report (scoped by role)
router.get('/events',              getEventReport);
router.get('/events/:eventId',     getEventReportDetail);

// Admin only: leader summary + detail
router.get('/leaders',             roleMiddleware, getLeaderSummary);
router.get('/leaders/detail',      roleMiddleware, getLeaderDetail);

module.exports = router;
