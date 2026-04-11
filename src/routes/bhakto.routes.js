const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const upload = require('../middleware/upload.middleware');
const {
  getAllBhakto, getBhaktoById, createBhakto,
  updateBhakto, deleteBhakto, toggleBhakto,
  importBhakto, exportBhakto,
} = require('../controllers/bhakto.controller');

// All routes require JWT
router.use(authMiddleware);

router.get('/export',         exportBhakto);                              // JWT only
router.get('/',               getAllBhakto);                              // JWT only
router.get('/:id',            getBhaktoById);                            // JWT only

router.post('/import',        roleMiddleware, upload.single('file'), importBhakto);  // Admin
router.post('/',              roleMiddleware, upload.single('photo'), createBhakto); // Admin
router.put('/:id',            roleMiddleware, upload.single('photo'), updateBhakto); // Admin
router.delete('/:id',         roleMiddleware, deleteBhakto);             // Admin
router.patch('/:id/toggle',   roleMiddleware, toggleBhakto);             // Admin

module.exports = router;