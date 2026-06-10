'use strict';
const catalogCache = require('../services/cache/catalogCache.service');
module.exports = { get: catalogCache.getStaffCatalog, invalidate: () => catalogCache.invalidateCatalog('staffs') };
