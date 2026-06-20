'use strict';

// Stable public facade. Template operations no longer load the import/export
// legacy bundle; the legacy module remains available through its adapter for
// callers that have not migrated yet.
module.exports = require('../import-template/ImportTemplateApplicationService');
