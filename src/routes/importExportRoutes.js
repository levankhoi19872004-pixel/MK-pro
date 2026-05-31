'use strict';

const express = require('express');
const multer = require('multer');
const controller = require('../controllers/importExportController');

const importRouter = express.Router();
const exportRouter = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Import runtime
importRouter.post('/preview', upload.single('file'), controller.previewImport);
importRouter.post('/direct', upload.single('file'), controller.directImport);
importRouter.post('/commit', controller.commitImport);
importRouter.get('/logs', controller.importLogs);

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
