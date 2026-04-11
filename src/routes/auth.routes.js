const express = require('express');
const router = express.Router();
const { login, getMe } = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.post('/login', login);
router.get('/me', authMiddleware, getMe);

module.exports = router;