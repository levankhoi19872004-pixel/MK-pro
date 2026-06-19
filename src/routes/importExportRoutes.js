'use strict';

const express = require('express');
const controller = require('../controllers/importExportController');
const { requireRole } = require('../middlewares/auth.middleware');
const {
  uploadImportExcel,
  handleImportUpload,
  rejectLargeUploadByContentLength,
  validateUploadedExcelFiles,
  multiExcelFields
} = require('../middlewares/importUpload.middleware');

const importRouter = express.Router();
const exportRouter = express.Router();
const manageImports = requireRole(['admin', 'accountant', 'warehouse']);
const viewExports = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

importRouter.use(manageImports);
exportRouter.use(viewExports);

// Import runtime
importRouter.post(
  '/preview',
  rejectLargeUploadByContentLength,
  handleImportUpload(uploadImportExcel.fields(multiExcelFields)),
  validateUploadedExcelFiles,
  controller.previewImport
);

// Direct import đã bị khóa, không được parse file upload.
importRouter.post('/direct', controller.directImport);

importRouter.get('/sessions/:sessionId/rows', controller.sessionRows);
importRouter.get('/sessions/:sessionId', controller.sessionStatus);
importRouter.post('/commit', controller.commitImport);
importRouter.get('/logs', controller.importLogs);

// Import shortage reconciliation reports. These routes must live on the
// router actually mounted at /api/import.
importRouter.get('/shortage-reports', controller.shortageReports);
importRouter.get('/shortage-reports/:id', controller.shortageReportDetail);
importRouter.patch('/shortage-reports/:id', controller.updateShortageReport);

// Import templates
importRouter.get('/templates', controller.listBuiltInTemplates);
importRouter.get('/template/:type', controller.downloadBuiltInTemplate);
importRouter.get('/fields/:type', controller.fields);
importRouter.get('/custom-templates', controller.listCustomTemplates);
importRouter.post('/custom-templates', controller.saveCustomTemplate);
importRouter.delete('/custom-templates/:id', controller.removeCustomTemplate);
importRouter.get('/custom-template/:id/download', controller.downloadCustomTemplate);

// Export Excel
exportRouter.get('/types', controller.exportTypes);
exportRouter.get('/:type.xlsx', controller.exportExcel);
exportRouter.get('/:type', controller.exportExcel);

module.exports = { importRouter, exportRouter };
