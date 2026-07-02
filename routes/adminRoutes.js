const express = require('express');
const adminController = require('../controllers/adminController');
const petugasController = require('../controllers/petugasController');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/admin/dashboard', requireAuth, requireRole('admin'), adminController.getDashboard);
router.get('/admin/reports', requireAuth, requireRole('admin', 'petugas'), adminController.getAllReports);
router.get('/admin/reports/export/excel', requireAuth, requireRole('admin'), adminController.exportReportsExcel);
router.get('/admin/statistics', requireAuth, requireRole('admin'), adminController.getStatisticsPage);
router.get('/api/admin/stats-data', requireAuth, requireRole('admin'), adminController.getStatsData);
router.get('/admin/categories', requireAuth, requireRole('admin'), adminController.getCategoriesPage);
router.get('/admin/categories/new', requireAuth, requireRole('admin'), adminController.getNewCategoryForm);
router.post('/admin/categories', requireAuth, requireRole('admin'), adminController.createCategory);
router.get('/admin/categories/:id/edit', requireAuth, requireRole('admin'), adminController.getEditCategoryForm);
router.put('/admin/categories/:id', requireAuth, requireRole('admin'), adminController.updateCategory);
router.delete('/admin/categories/:id', requireAuth, requireRole('admin'), adminController.deleteCategory);
router.post('/admin/reports/:id/assign', requireAuth, requireRole('admin'), adminController.assignReport);
router.post('/admin/reports/:id/status', requireAuth, requireRole('admin', 'petugas'), adminController.updateReportStatus);

// Petugas Routes
router.get('/petugas/reports', requireAuth, requireRole('petugas'), petugasController.getMyReports);

module.exports = router;
