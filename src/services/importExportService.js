'use strict';

// Legacy facade kept API-compatible, but load import/export domains on demand.
// This avoids loading report/export/VNPT Excel code during unrelated screens
// such as /api/reports/catalog.
const SERVICE_METHODS = Object.freeze({
  previewImport: './import-export/ImportFacade',
  directImport: './import-export/ImportFacade',
  commitImport: './import-export/ImportFacade',
  getImportLogs: './import-export/ImportFacade',

  listBuiltInTemplates: './import-export/TemplateFacade',
  downloadBuiltInTemplate: './import-export/TemplateFacade',
  fields: './import-export/TemplateFacade',
  listCustomTemplates: './import-export/TemplateFacade',
  saveCustomTemplate: './import-export/TemplateFacade',
  removeCustomTemplate: './import-export/TemplateFacade',
  downloadCustomTemplate: './import-export/TemplateFacade',

  getExportTypes: './import-export/ExportFacade',
  exportToExcel: './import-export/ExportFacade'
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
