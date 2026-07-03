'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');
const { createMobileSalesController } = require('../../controllers/mobile/sales.controller');

function createMobileSalesRouter(ctx) {
  const router = express.Router();
  const controller = createMobileSalesController(ctx);
  const { requireMobileLogin, requireMobileRole, validateRequest } = ctx;
  const onlySales = [requireMobileLogin, requireMobileRole(['sales'])];

  const orderPayloadRules = [
    body('customer').optional().isObject().withMessage('Khách hàng không hợp lệ'),
    body('customerId').optional().isString().trim(),
    body('customerCode').optional().isString().trim(),
    body('items').isArray({ min: 1 }).withMessage('Đơn phải có ít nhất 1 sản phẩm'),
    body('items.*.quantity').optional().isFloat({ gt: 0 }).withMessage('Số lượng phải lớn hơn 0'),
    body('items.*.qty').optional().isFloat({ gt: 0 }).withMessage('Số lượng phải lớn hơn 0'),
    body('paidAmount').optional().isFloat({ min: 0 }).withMessage('Tiền thu không được âm'),
    body('note').optional().isString().trim(),
    body('idempotencyKey').optional().isString().trim().isLength({ max: 160 })
  ];

  router.post('/orders', ...onlySales, orderPayloadRules, validateRequest, controller.createOrder);
  router.get('/orders/:id/print.pdf', ...onlySales, param('id').isString().trim().notEmpty(), validateRequest, controller.renderOrderPrint);
  router.get('/orders/:id', ...onlySales, param('id').isString().trim().notEmpty(), validateRequest, controller.getOrder);
  router.put('/orders/:id', ...onlySales, param('id').isString().trim().notEmpty(), orderPayloadRules, validateRequest, controller.updateOrder);
  router.delete('/orders/:id', ...onlySales, param('id').isString().trim().notEmpty(), validateRequest, controller.deleteOrder);
  router.get('/orders', ...onlySales, [
    query('date').optional().isISO8601().withMessage('Ngày không hợp lệ'),
    query('mine').optional().isIn(['0', '1']).withMessage('mine chỉ nhận 0 hoặc 1'),
    query('q').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }).withMessage('page đơn hàng không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit đơn hàng không hợp lệ')
  ], validateRequest, controller.listOrders);

  router.get('/debts', ...onlySales, [
    query('q').optional().isString().trim(),
    query('page').optional().isInt({ min: 1 }).withMessage('page công nợ không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit công nợ không hợp lệ'),
    query('includePaid').optional().isIn(['0', '1']).withMessage('includePaid chỉ nhận 0 hoặc 1')
  ], validateRequest, controller.listDebts);

  return router;
}

module.exports = { createMobileSalesRouter };
