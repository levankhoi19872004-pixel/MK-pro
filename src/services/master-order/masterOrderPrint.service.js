'use strict';

// Refactor phase 1: thin domain module over the preserved implementation.
// Business behavior is intentionally unchanged; routes continue through the facade.
const legacy = require('./masterOrderLegacy.service');

module.exports = {
  buildAggregateMasterPrintDocument: legacy.buildAggregateMasterPrintDocument,
};
