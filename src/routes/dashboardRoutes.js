'use strict';

const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireRole } = require('../middlewares/auth.middleware');
const {
  uploadImportExcel,
  handleImportUpload,
  rejectLargeUploadByContentLength,
  validateUploadedExcelFiles
} = require('../middlewares/importUpload.middleware');

const router = express.Router();
const viewDashboard = requireRole(['admin', 'manager', 'accountant']);
const manageTargets = requireRole(['admin', 'manager']);

router.get('/home', viewDashboard, dashboardController.home);
router.get('/targets', viewDashboard, dashboardController.listTargets);
router.get('/targets/template', manageTargets, dashboardController.downloadTargetTemplate);
router.put('/targets/:period', manageTargets, dashboardController.saveTargets);
router.post(
  '/targets/:period/import',
  manageTargets,
  rejectLargeUploadByContentLength,
  handleImportUpload(uploadImportExcel.single('file')),
  validateUploadedExcelFiles,
  dashboardController.importTargets
);

module.exports = router;
