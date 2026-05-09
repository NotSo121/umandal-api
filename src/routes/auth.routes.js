const express = require('express');
const router = express.Router();
const { login, getMe, updateMe, saveFcmToken } = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

router.post('/login',       login);
router.get('/me',           authMiddleware, getMe);
router.put('/me',           authMiddleware, updateMe);
router.put('/fcm-token',    authMiddleware, saveFcmToken);

module.exports = router;
