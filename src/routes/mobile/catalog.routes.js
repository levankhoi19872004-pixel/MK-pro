'use strict';

const express = require('express');
const { createMobileCatalogController } = require('../../controllers/mobile/catalog.controller');

function createMobileCatalogRouter(ctx) {
  const router = express.Router();
  const controller = createMobileCatalogController(ctx);
  const { requireMobileLogin, requireMobileRole } = ctx;
  const allowCustomerRead = [requireMobileLogin, requireMobileRole(['admin', 'manager', 'accountant', 'sales'])];
  const allowProductRead = [requireMobileLogin, requireMobileRole(['admin', 'manager', 'accountant', 'sales', 'delivery'])];

  router.get('/customers', ...allowCustomerRead, controller.customers);
  router.get('/products', ...allowProductRead, controller.products);
  router.get('/stock', ...allowProductRead, controller.stock);

  return router;
}

module.exports = { createMobileCatalogRouter };
