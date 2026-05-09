const express = require('express');
const router  = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { superAdminMiddleware } = require('../middleware/role.middleware');
const {
  createManualBackup,
  createAutoBackup,
  listBackups,
  getStats,
  downloadBackup,
  deleteBackup,
} = require('../controllers/backup.controller');

// Secret-gated auto-backup endpoint — MUST come before authMiddleware
router.post('/auto', createAutoBackup);

// All other routes require JWT + SUPER_ADMIN
router.use(authMiddleware);
router.use(superAdminMiddleware);

router.get('/',                       listBackups);
router.get('/stats',                  getStats);
router.post('/create',                createManualBackup);
router.get('/:id/download/:kind',     downloadBackup);
router.delete('/:id',                 deleteBackup);

module.exports = router;
