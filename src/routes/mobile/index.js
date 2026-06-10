'use strict';

const express = require('express');
const legacyMobileRoutes = require('../mobileRoutes');
const { createMobileAuthRouter } = require('./auth.routes');
const { createMobileCatalogRouter } = require('./catalog.routes');
const { createMobileSalesRouter } = require('./sales.routes');
const { createMobileDeliveryRouter } = require('./delivery.routes');

function forwardTo(router, targetPath) {
  return (req, res, next) => {
    const queryIndex = req.url.indexOf('?');
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    req.url = `${targetPath}${query}`;
    return router.handle(req, res, next);
  };
}

function addCompatibilityAliases(router) {
  // Mobile sales app historical alias: POST /api/mobile/orders -> /api/mobile/sales/orders
  router.post('/orders', forwardTo(router, '/sales/orders'));
  // Mobile delivery app historical alias: save money means delivery payment persistence.
  router.post('/delivery/save-money', forwardTo(router, '/delivery/payment'));
  // Report tab currently reads the same delivery order list with filters/status.
  router.get('/delivery/report', forwardTo(router, '/delivery/orders'));
}

function createMobileRouter(ctx) {
  const router = express.Router();

  addCompatibilityAliases(router);

  if (ctx) {
    router.use(createMobileAuthRouter(ctx));
    router.use(createMobileCatalogRouter(ctx));
    router.use(createMobileSalesRouter(ctx));
    router.use(createMobileDeliveryRouter(ctx));

    // Legacy mobile routes are kept as rollback/fallback while modular route contracts are hardened.
    router.use(legacyMobileRoutes);
    return router;
  }

  // Safe default for current production wiring: route mount moves to ./mobile,
  // while business logic still falls back to the battle-tested legacy router.
  router.use(legacyMobileRoutes);
  return router;
}

function registerMobileRoutes(app, ctx) {
  app.use('/api/mobile', createMobileRouter(ctx));
}

module.exports = { createMobileRouter, registerMobileRoutes };
