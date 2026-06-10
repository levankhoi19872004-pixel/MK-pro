'use strict';
const catalogCache = require('../services/cache/catalogCache.service');
module.exports = { get: catalogCache.getCustomerCatalog, invalidate: () => catalogCache.invalidateCatalog('customers') };
