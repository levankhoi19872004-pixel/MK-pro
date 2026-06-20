'use strict';

// Transitional adapter: preserves the template methods exported by
// importExportLegacy.service.js while runtime callers move to the explicit
// application-service contract.
const applicationService = require('./ImportTemplateApplicationService');
const { createImportTemplateContract } = require('./ImportTemplateContract');

module.exports = createImportTemplateContract(
  applicationService,
  'LegacyImportTemplateAdapter implementation'
);
