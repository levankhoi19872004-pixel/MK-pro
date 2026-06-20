'use strict';

const importTemplateService = require('../importTemplateService');
const { createImportTemplateContract } = require('./ImportTemplateContract');

module.exports = createImportTemplateContract(
  importTemplateService,
  'ImportTemplateApplicationService implementation'
);
