'use strict';

const express = require('express');
const importTemplateController = require('../controllers/importTemplateController');

const router = express.Router();

router.get('/custom-templates', importTemplateController.listCustom);
router.post('/custom-templates', importTemplateController.saveCustom);
router.delete('/custom-templates/:id', importTemplateController.removeCustom);
router.get('/custom-template/:id/download', importTemplateController.downloadCustom);
router.get('/templates', importTemplateController.listBuiltIn);
router.get('/template/:type', importTemplateController.downloadBuiltIn);
router.get('/fields/:type', importTemplateController.fields);

module.exports = router;
