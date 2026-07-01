const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/dashboard', requireAuth, requireRole('warga'), dashboardController.showWargaDashboard);
router.get('/petugas/dashboard', requireAuth, requireRole('petugas'), dashboardController.showPetugasDashboard);
router.get('/admin/dashboard', requireAuth, requireRole('admin'), dashboardController.showAdminDashboard);

module.exports = router;
