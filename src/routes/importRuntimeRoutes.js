'use strict';

const express = require('express');
const importRuntimeController = require('../controllers/importRuntimeController');
const {
  uploadImportExcel,
  handleImportUpload,
  rejectLargeUploadByContentLength,
  validateUploadedExcelFiles
} = require('../middlewares/importUpload.middleware');

const router = express.Router();

router.post(
  '/preview',
  rejectLargeUploadByContentLength,
  handleImportUpload(uploadImportExcel.single('file')),
  validateUploadedExcelFiles,
  importRuntimeController.preview
);

router.get('/sessions/:sessionId', importRuntimeController.sessionStatus);
router.post('/commit', importRuntimeController.commit);
router.get('/logs', importRuntimeController.logs);

module.exports = router;
