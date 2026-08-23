const express = require('express');
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../controllers/notificationController');

const router = express.Router();

router.post('/read-all', markAllNotificationsRead);
router.get('/', getNotifications);
router.patch('/:id/read', markNotificationRead);

module.exports = router;
