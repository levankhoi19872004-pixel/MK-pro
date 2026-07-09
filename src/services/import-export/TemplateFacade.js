'use strict';

// Stable public facade. Template operations no longer load the import/export
// legacy bundle; the legacy module remains available through its adapter for
// callers that have not migrated yet. Canonical contract stays exactly seven
// enumerable methods; legacy aliases are non-enumerable compatibility shims.
const templateService = require('../import-template/ImportTemplateApplicationService');

const facade = { ...templateService };

Object.defineProperties(facade, {
  listBuiltInTemplates: { enumerable: false, value: (...args) => templateService.getBuiltInTemplates(...args) },
  downloadBuiltInTemplate: { enumerable: false, value: (...args) => templateService.buildBuiltInTemplateFile(...args) },
  fields: { enumerable: false, value: (...args) => templateService.getFields(...args) },
  removeCustomTemplate: { enumerable: false, value: (...args) => templateService.deleteCustomTemplate(...args) },
  downloadCustomTemplate: { enumerable: false, value: (...args) => templateService.buildCustomTemplateFile(...args) }
});

module.exports = Object.freeze(facade);
