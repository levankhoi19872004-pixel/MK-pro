'use strict';

// Legacy facade kept API-compatible, but load import/export domains on demand.
// This avoids loading report/export/VNPT Excel code during unrelated screens
// such as /api/reports/catalog.
const SERVICE_METHODS = Object.freeze({
  previewImport: './ImportFacade',
  directImport: './ImportFacade',
  commitImport: './ImportFacade',
  getImportLogs: './ImportFacade',

  // Canonical import-template contract methods.
  getBuiltInTemplates: './TemplateFacade',
  buildBuiltInTemplateFile: './TemplateFacade',
  getFields: './TemplateFacade',
  listCustomTemplates: './TemplateFacade',
  saveCustomTemplate: './TemplateFacade',
  deleteCustomTemplate: './TemplateFacade',
  buildCustomTemplateFile: './TemplateFacade',

  // Backward-compatible import/export facade method names.
  listBuiltInTemplates: './TemplateFacade',
  downloadBuiltInTemplate: './TemplateFacade',
  fields: './TemplateFacade',
  removeCustomTemplate: './TemplateFacade',
  downloadCustomTemplate: './TemplateFacade',

  getExportTypes: './ExportFacade',
  exportToExcel: './ExportFacade'
});

const cache = new Map();
function load(modulePath) {
  if (!cache.has(modulePath)) cache.set(modulePath, require(modulePath));
  return cache.get(modulePath);
}

const facade = {};
for (const [method, modulePath] of Object.entries(SERVICE_METHODS)) {
  Object.defineProperty(facade, method, {
    enumerable: true,
    configurable: false,
    get() {
      return load(modulePath)[method];
    }
  });
}

module.exports = facade;
