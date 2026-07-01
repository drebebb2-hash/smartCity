const express = require('express');
const multer = require('multer');
const profileController = require('../controllers/profileController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB
  }
});

router.get('/profile', requireAuth, profileController.getProfile);
router.post('/profile', requireAuth, upload.single('avatar'), profileController.updateProfile);
router.post('/profile/password', requireAuth, profileController.updatePassword);

module.exports = router;
