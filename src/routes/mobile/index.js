'use strict';

const express = require('express');
const { createMobileAuthRouter } = require('./auth.routes');
const { createMobileCatalogRouter } = require('./catalog.routes');
const { createMobileSalesRouter } = require('./sales.routes');
const { createMobileDeliveryRouter } = require('./delivery.routes');
const { createMobileDebtRouter, createMobileDebtCollectionRouter } = require('./debts.routes');
const { createMobileSyncRouter } = require('./sync.routes');

function forwardTo(router, targetPath) {
  return (req, res, next) => {
    const queryIndex = req.url.indexOf('?');
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    req.url = `${targetPath}${query}`;
    return router.handle(req, res, next);
  };
}

function addCompatibilityAliases(router) {
  // Alias cũ app bán hàng: giữ API flat để frontend/mobile cũ không rơi vào 404.
  router.get('/customers', forwardTo(router, '/catalog/customers'));
  router.get('/products', forwardTo(router, '/catalog/products'));
  router.get('/stock', forwardTo(router, '/catalog/stock'));

  // Alias cũ: POST /api/mobile/orders -> /api/mobile/sales/orders
  router.post('/orders', forwardTo(router, '/sales/orders'));

  // Alias cũ app giao hàng.
  router.post('/delivery/save-money', forwardTo(router, '/delivery/payment'));
  router.get('/delivery/report', forwardTo(router, '/delivery/orders'));
  router.get('/delivery-orders', forwardTo(router, '/delivery/orders'));
  router.post('/cash/submit', forwardTo(router, '/delivery/cash/submit'));
}

// MOBILE_MODULAR_ROUTE_ONLY_START
function createMobileRouter(ctx) {
  if (!ctx || typeof ctx !== 'object') {
    throw new Error('Mobile routes require ctx. Legacy fallback disabled.');
  }

  const router = express.Router();

  addCompatibilityAliases(router);

  router.use('/auth', createMobileAuthRouter(ctx));
  router.use('/catalog', createMobileCatalogRouter(ctx));
  router.use('/debts', createMobileDebtRouter(ctx));
  router.use('/debt-collections', createMobileDebtCollectionRouter(ctx));
  router.use('/sales', createMobileSalesRouter(ctx));
  router.use('/delivery', createMobileDeliveryRouter(ctx));
  router.use('/sync', createMobileSyncRouter(ctx));

  return router;
}

function registerMobileRoutes(app, ctx) {
  app.use('/api/mobile', createMobileRouter(ctx));
}
// MOBILE_MODULAR_ROUTE_ONLY_END

module.exports = { createMobileRouter, registerMobileRoutes };
