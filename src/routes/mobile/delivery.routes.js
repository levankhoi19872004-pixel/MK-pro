'use strict';

const express = require('express');
const { body, query } = require('express-validator');
const { createMobileDeliveryController } = require('../../controllers/mobile/delivery.controller');

function createMobileDeliveryRouter(ctx) {
  const router = express.Router();
  const controller = createMobileDeliveryController(ctx);
  const { requireMobileLogin, requireMobileRole, validateRequest } = ctx;
  const onlyDelivery = [requireMobileLogin, requireMobileRole(['delivery'])];

  router.get('/delivery/orders', ...onlyDelivery, [
    query('date').optional().isISO8601().withMessage('Ngày giao không hợp lệ'),
    query('status').optional().isString().trim(),
    query('q').optional().isString().trim(),
    query('includeCompleted').optional().isIn(['0', '1', 'true', 'false']).withMessage('includeCompleted không hợp lệ')
  ], validateRequest, controller.listOrders);

  router.post('/delivery/confirm', ...onlyDelivery, [
    body('orderId').isString().trim().notEmpty().withMessage('Thiếu mã đơn giao'),
    body('status').isIn(['success', 'failed']).withMessage('Trạng thái giao hàng không hợp lệ'),
    body('collectAmount').optional().isFloat({ min: 0 }).withMessage('Tiền thu không được âm'),
    body('collectionMethod').optional().isIn(['cash', 'transfer']).withMessage('Hình thức thu không hợp lệ'),
    body('paymentMethod').optional().isIn(['cash', 'transfer']).withMessage('Hình thức thu không hợp lệ'),
    body('note').optional().isString().trim()
  ], validateRequest, controller.confirm);

  router.post('/delivery/return', ...onlyDelivery, [
    body('orderId').isString().trim().notEmpty().withMessage('Thiếu mã đơn giao'),
    body('returnType').optional().isIn(['full', 'partial']).withMessage('Loại trả hàng không hợp lệ'),
    body('items').optional().isArray().withMessage('Danh sách hàng trả không hợp lệ'),
    body('note').optional().isString().trim()
  ], validateRequest, controller.createReturn);

  router.post('/cash/submit', ...onlyDelivery, [
    body('amount').isFloat({ gt: 0 }).withMessage('Số tiền nộp quỹ phải lớn hơn 0'),
    body('note').optional().isString().trim()
  ], validateRequest, controller.submitCash);

  return router;
}

function registerMobileDeliveryRoutes(app, ctx) {
  app.use('/api/mobile', createMobileDeliveryRouter(ctx));
}

module.exports = { createMobileDeliveryRouter, registerMobileDeliveryRoutes };
