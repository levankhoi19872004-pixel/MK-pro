'use strict';

const express = require('express');
const { createMobileAuthRouter } = require('./auth.routes');
const { createMobileCatalogRouter } = require('./catalog.routes');
const { createMobileSalesRouter } = require('./sales.routes');
const { createMobileDeliveryRouter } = require('./delivery.routes');

function createMobileRouter(ctx) {
  const router = express.Router();
  router.use(createMobileAuthRouter(ctx));
  router.use(createMobileCatalogRouter(ctx));
  router.use(createMobileSalesRouter(ctx));
  router.use(createMobileDeliveryRouter(ctx));
  return router;
}

function registerMobileRoutes(app, ctx) {
  app.use('/api/mobile', createMobileRouter(ctx));
}

module.exports = { createMobileRouter, registerMobileRoutes };
