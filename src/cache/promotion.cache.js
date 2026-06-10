'use strict';
const catalogCache = require('../services/cache/catalogCache.service');
module.exports = { get: catalogCache.getPromotionCatalog, invalidate: () => catalogCache.invalidateCatalog('promotions') };
