'use strict';
const legacy = require('../importExportLegacy.service');
module.exports = {
  getBuiltInTemplates: legacy.getBuiltInTemplates,
  buildBuiltInTemplateFile: legacy.buildBuiltInTemplateFile,
  getFields: legacy.getFields,
  listCustomTemplates: legacy.listCustomTemplates,
  saveCustomTemplate: legacy.saveCustomTemplate,
  deleteCustomTemplate: legacy.deleteCustomTemplate,
  buildCustomTemplateFile: legacy.buildCustomTemplateFile
};
