'use strict';
const legacy = require('../importExportLegacy.service');
module.exports = {
  previewImport: legacy.previewImport,
  commitImport: legacy.commitImport,
  getImportLogs: legacy.getImportLogs
};
