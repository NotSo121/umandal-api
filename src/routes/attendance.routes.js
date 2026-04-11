const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const {
  getAttendanceByEvent, saveAttendance, getAttendanceByBhakto,
} = require('../controllers/attendance.controller');

router.use(authMiddleware);

router.get('/bhakto/:bhaktoId',    getAttendanceByBhakto);
router.get('/:eventId',            getAttendanceByEvent);
router.post('/:eventId/save',      saveAttendance);

module.exports = router;