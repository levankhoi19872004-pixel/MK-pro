'use strict';

/**
 * Mobile Delivery Routes - V45
 *
 * Route chỉ khai báo endpoint + middleware.
 * Logic HTTP nằm ở controller, nghiệp vụ ở service, dữ liệu ở repository.
 */

const express = require('express');
const { createMobileDeliveryController } = require('../../controllers/mobile/delivery.controller');

function createMobileDeliveryRouter(ctx) {
  const router = express.Router();
  const controller = createMobileDeliveryController(ctx);
  const { requireMobileLogin, requireMobileRole } = ctx;
  const onlyDelivery = [requireMobileLogin, requireMobileRole(['delivery'])];

  router.get('/delivery/orders', ...onlyDelivery, controller.listOrders);
  router.post('/delivery/confirm', ...onlyDelivery, controller.confirm);
  router.post('/delivery/return', ...onlyDelivery, controller.createReturn);
  router.post('/cash/submit', ...onlyDelivery, controller.submitCash);

  return router;
}

function registerMobileDeliveryRoutes(app, ctx) {
  app.use('/api/mobile', createMobileDeliveryRouter(ctx));
}

module.exports = { createMobileDeliveryRouter, registerMobileDeliveryRoutes };
