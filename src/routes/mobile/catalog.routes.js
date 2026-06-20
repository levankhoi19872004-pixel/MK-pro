'use strict';

const express = require('express');
const { query } = require('express-validator');
const { createMobileCatalogController } = require('../../controllers/mobile/catalog.controller');

function createMobileCatalogRouter(ctx) {
  const router = express.Router();
  const controller = createMobileCatalogController(ctx);
  const { requireMobileLogin, requireMobileRole, validateRequest } = ctx;
  const allowCustomerRead = [requireMobileLogin, requireMobileRole(['admin', 'manager', 'accountant', 'sales'])];
  const allowProductRead = [requireMobileLogin, requireMobileRole(['admin', 'manager', 'accountant', 'sales', 'delivery'])];

  const pageRules = [
    query('page').optional().isInt({ min: 1 }).withMessage('page không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('limit không hợp lệ')
  ];

  router.get('/customers', ...allowCustomerRead, pageRules, validateRequest, controller.customers);
  router.get('/product-groups', ...allowProductRead, controller.productGroups);
  router.get('/products', ...allowProductRead, pageRules, validateRequest, controller.products);
  router.get('/stock', ...allowProductRead, controller.stock);

  return router;
}

module.exports = { createMobileCatalogRouter };
