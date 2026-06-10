'use strict';
const catalogCache = require('../services/cache/catalogCache.service');
module.exports = { get: catalogCache.getProductCatalog, invalidate: () => catalogCache.invalidateCatalog('products') };
