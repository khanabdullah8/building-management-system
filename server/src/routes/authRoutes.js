const express = require('express');
const { login, getMe, logout } = require('../controllers/authController');
const { protect } = require('../middlewares/auth');
const { createLoginLimiter } = require('../middlewares/rateLimit');

const router = express.Router();

const loginLimiter = createLoginLimiter();

router.post('/login', loginLimiter, login);
router.get('/me', protect, getMe);
router.post('/logout', protect, logout);

module.exports = router;
