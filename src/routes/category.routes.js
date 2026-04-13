const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const roleMiddleware = require('../middleware/role.middleware');
const { getAllCategories, createCategory, updateCategory, deleteCategory } = require('../controllers/category.controller');

// All routes require JWT
router.use(authMiddleware);

router.get('/',       getAllCategories);                   // JWT only
router.post('/',      roleMiddleware, createCategory);     // Admin
router.put('/:id',    roleMiddleware, updateCategory);     // Admin
router.delete('/:id', roleMiddleware, deleteCategory);     // Admin

module.exports = router;
