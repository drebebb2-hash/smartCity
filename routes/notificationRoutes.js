const express = require('express');
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/notifications', requireAuth, notificationController.getNotifications);
router.post('/notifications/:id/read', requireAuth, notificationController.markAsRead);

module.exports = router;
