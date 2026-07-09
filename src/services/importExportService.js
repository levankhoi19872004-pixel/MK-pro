'use strict';

// Legacy importExportService facade kept small. Template/import/export maps are
// lazy-loaded in the import-export domain boundary.
module.exports = require('./import-export/ImportExportServiceFacade');
