'use strict';

const express = require('express');
const { requireRole } = require('../middlewares/auth.middleware');
const excelImportController = require('../controllers/excelImportController');
const {
  uploadImportExcel,
  handleImportUpload,
  rejectLargeUploadByContentLength,
  validateUploadedExcelFiles,
  multiExcelFields
} = require('../middlewares/importUpload.middleware');

const router = express.Router();
const manageImports = requireRole(['admin', 'accountant', 'warehouse']);

router.post(
  '/preview',
  manageImports,
  rejectLargeUploadByContentLength,
  handleImportUpload(uploadImportExcel.fields(multiExcelFields)),
  validateUploadedExcelFiles,
  excelImportController.preview
);

router.get('/sessions/:sessionId/rows', manageImports, excelImportController.sessionRows);
router.get('/sessions/:sessionId/shortage-review', manageImports, excelImportController.shortageReview);
router.put('/sessions/:sessionId/shortage-review', manageImports, excelImportController.confirmShortageReview);
router.get('/sessions/:sessionId', manageImports, excelImportController.sessionStatus);
router.post('/sessions/:sessionId/commit', manageImports, excelImportController.commit);
router.post('/commit', manageImports, excelImportController.commit);

// Direct import đã bị khóa, không được gắn upload middleware để tránh tốn RAM.
router.post('/direct', manageImports, excelImportController.direct);

router.get('/shortage-reports', manageImports, excelImportController.shortageReports);
router.get('/shortage-reports/:id', manageImports, excelImportController.shortageReportDetail);
router.patch('/shortage-reports/:id', manageImports, excelImportController.updateShortageReport);

router.get('/logs', manageImports, excelImportController.logs);

module.exports = router;
