'use strict';

const express = require('express');
const importTemplateController = require('../controllers/importTemplateController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const manageImportTemplates = requireRole(['admin', 'accountant', 'warehouse']);
const viewImportTemplates = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

router.get('/custom-templates', viewImportTemplates, importTemplateController.listCustom);
router.post('/custom-templates', manageImportTemplates, importTemplateController.saveCustom);
router.delete('/custom-templates/:id', manageImportTemplates, importTemplateController.removeCustom);
router.get('/custom-template/:id/download', viewImportTemplates, importTemplateController.downloadCustom);
router.get('/templates', viewImportTemplates, importTemplateController.listBuiltIn);
router.get('/template/:type', viewImportTemplates, importTemplateController.downloadBuiltIn);
router.get('/fields/:type', viewImportTemplates, importTemplateController.fields);

module.exports = router;
