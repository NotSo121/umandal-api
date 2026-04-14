const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const { roleMiddleware } = require('../middleware/role.middleware');
const {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  toggleUser,
} = require('../controllers/user.controller');

// All user routes → JWT + Admin (or SUPER_ADMIN)
router.use(authMiddleware, roleMiddleware);

router.get('/',             getAllUsers);
router.post('/',            createUser);
router.put('/:id',          updateUser);
router.delete('/:id',       deleteUser);
router.patch('/:id/toggle', toggleUser);

module.exports = router;
