const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { roleMiddleware } = require("../middleware/role.middleware");
const { upload, uploadExcel } = require('../middleware/upload.middleware');
const {
  getAllBhakto, getBhaktoById, createBhakto,
  updateBhakto, deleteBhakto, toggleBhakto,
  importBhakto, exportBhakto, getBhaktoImportSample,
} = require('../controllers/bhakto.controller');

// All routes require JWT
router.use(authMiddleware);

router.get('/export',                exportBhakto);                                       // JWT only
router.get('/import/sample',         getBhaktoImportSample);                              // JWT only
router.get('/',                      getAllBhakto);                                       // JWT only
router.get('/:id',                   getBhaktoById);                                     // JWT only

// Import — admin only
router.post('/import',               roleMiddleware, uploadExcel.single('file'), importBhakto); // Admin only

// Create/Edit/Delete: JWT only — controller enforces ownership for non-admin
router.post('/',              upload.single('photo'), createBhakto);
router.put('/:id',            upload.single('photo'), updateBhakto);
router.delete('/:id',         deleteBhakto);

// Toggle: admin only
router.patch('/:id/toggle',   roleMiddleware, toggleBhakto);                       // Admin only

module.exports = router;
