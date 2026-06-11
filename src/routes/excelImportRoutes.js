'use strict';

const express = require('express');
const excelImportController = require('../controllers/excelImportController');
const {
  uploadImportExcel,
  handleImportUpload,
  rejectLargeUploadByContentLength,
  validateUploadedExcelFiles,
  multiExcelFields
} = require('../middlewares/importUpload.middleware');

const router = express.Router();

router.post(
  '/preview',
  rejectLargeUploadByContentLength,
  handleImportUpload(uploadImportExcel.fields(multiExcelFields)),
  validateUploadedExcelFiles,
  excelImportController.preview
);

router.get('/sessions/:sessionId', excelImportController.sessionStatus);
router.post('/commit', excelImportController.commit);

// Direct import đã bị khóa, không được gắn upload middleware để tránh tốn RAM.
router.post('/direct', excelImportController.direct);

router.get('/logs', excelImportController.logs);

module.exports = router;
