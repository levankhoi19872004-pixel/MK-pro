'use strict';

const express = require('express');
const { requireRole } = require('../middlewares/auth.middleware');
const importRuntimeController = require('../controllers/importRuntimeController');
const {
  uploadImportExcel,
  handleImportUpload,
  rejectLargeUploadByContentLength,
  validateUploadedExcelFiles
} = require('../middlewares/importUpload.middleware');

const router = express.Router();
const manageImports = requireRole(['admin', 'accountant', 'warehouse']);

router.post(
  '/preview',
  manageImports,
  rejectLargeUploadByContentLength,
  handleImportUpload(uploadImportExcel.single('file')),
  validateUploadedExcelFiles,
  importRuntimeController.preview
);

router.get('/sessions/:sessionId/rows', manageImports, importRuntimeController.sessionRows);
router.get('/sessions/:sessionId/shortage-review', manageImports, importRuntimeController.shortageReview);
router.put('/sessions/:sessionId/shortage-review', manageImports, importRuntimeController.confirmShortageReview);
router.get('/sessions/:sessionId', manageImports, importRuntimeController.sessionStatus);
router.post('/sessions/:sessionId/commit', manageImports, importRuntimeController.commit);
router.post('/commit', manageImports, importRuntimeController.commit);
router.get('/logs', manageImports, importRuntimeController.logs);

module.exports = router;
