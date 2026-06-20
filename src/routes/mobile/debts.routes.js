'use strict';

const express = require('express');
const { body, query } = require('express-validator');
const { createMobileDebtController } = require('../../controllers/mobile/debts.controller');

function createMobileDebtRouter(ctx) {
  const router = express.Router();
  const controller = createMobileDebtController(ctx);
  const { requireMobileLogin, requireMobileRole, validateRequest } = ctx;
  const collectors = [requireMobileLogin, requireMobileRole(['sales', 'delivery'])];

  router.get('/', ...collectors, [
    query('collectorType').optional().isIn(['sales', 'delivery']).withMessage('collectorType không hợp lệ'),
    query('customerKeyword').optional().isString().trim(),
    query('q').optional().isString().trim(),
    query('includePendingCollections').optional().isIn(['0', '1']).withMessage('includePendingCollections chỉ nhận 0 hoặc 1'),
    query('page').optional().isInt({ min: 1 }).withMessage('page công nợ không hợp lệ'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit công nợ không hợp lệ')
  ], validateRequest, controller.listDebts);

  return router;
}

function createMobileDebtCollectionRouter(ctx) {
  const router = express.Router();
  const controller = createMobileDebtController(ctx);
  const { requireMobileLogin, requireMobileRole, validateRequest } = ctx;
  const collectors = [requireMobileLogin, requireMobileRole(['sales', 'delivery'])];

  router.post('/', ...collectors, [
    body('customerCode').isString().trim().notEmpty().withMessage('Thiếu mã khách hàng'),
    body('amount').isFloat({ gt: 0 }).withMessage('Số tiền thu phải lớn hơn 0'),
    body('paymentMethod').optional().isIn(['cash', 'bank_transfer', 'bank', 'transfer', 'other']).withMessage('Hình thức thanh toán không hợp lệ'),
    body('note').optional().isString().trim(),
    body('allocations').isArray({ min: 1 }).withMessage('Cần chọn ít nhất một đơn nợ'),
    body('allocations.*.salesOrderCode').optional().isString().trim(),
    body('allocations.*.orderCode').optional().isString().trim(),
    body('allocations.*.allocatedAmount').isFloat({ gt: 0 }).withMessage('Số tiền phân bổ phải lớn hơn 0'),
    body('idempotencyKey').optional().isString().trim().isLength({ max: 160 })
  ], validateRequest, controller.submitCollection);

  return router;
}

module.exports = {
  createMobileDebtRouter,
  createMobileDebtCollectionRouter
};
