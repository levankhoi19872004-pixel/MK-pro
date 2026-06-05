'use strict';

const express = require('express');
const { createMobileCatalogController } = require('../../controllers/mobile/catalog.controller');

function createMobileCatalogRouter(ctx) {
  const router = express.Router();
  const controller = createMobileCatalogController(ctx);
  const { requireMobileLogin, requireMobileRole } = ctx;
  const allowAppRead = [requireMobileLogin, requireMobileRole(['accountant', 'sales', 'delivery'])];

  router.get('/customers', ...allowAppRead, controller.customers);
  router.get('/products', ...allowAppRead, controller.products);
  router.get('/stock', ...allowAppRead, controller.stock);

  return router;
}

module.exports = { createMobileCatalogRouter };
