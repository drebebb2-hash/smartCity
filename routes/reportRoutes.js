const express = require('express');
const multer = require('multer');
const reportController = require('../controllers/reportController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');
 
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});
 
router.get('/reports/new', requireAuth, requireRole('warga'), reportController.getNewReportForm);
router.post('/reports', requireAuth, requireRole('warga'), upload.single('photo'), reportController.createReport);
router.get('/reports/my', requireAuth, reportController.getMyReports);
router.get('/reports/map', requireAuth, reportController.getMapPage);
router.get('/api/reports/map-data', requireAuth, reportController.getMapData);
router.post('/reports/:id/comments', requireAuth, reportController.addComment);
router.post('/reports/:id/upvote', requireAuth, reportController.toggleUpvote);
router.get('/reports/:id', requireAuth, reportController.getReportDetail);
 
module.exports = router;
