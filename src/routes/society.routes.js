const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { getAllSocieties, createSociety, updateSociety, deleteSociety } = require('../controllers/society.controller');

// All routes require JWT
router.use(authMiddleware);

router.get('/',       getAllSocieties);                   // JWT only
router.post('/',      roleMiddleware, createSociety);     // Admin
router.put('/:id',    roleMiddleware, updateSociety);     // Admin
router.delete('/:id', roleMiddleware, deleteSociety);     // Admin

module.exports = router;
