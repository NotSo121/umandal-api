const express = require('express');
const router = express.Router();
const { login, getMe, updateMe } = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.post('/login',       login);
router.get('/me',           authMiddleware, getMe);
router.put('/me',           authMiddleware, updateMe);   // change password

module.exports = router;
