'use strict';

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const controller = require('../controllers/debtCollectionController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const viewCollections = requireRole(['admin', 'manager', 'accountant']);
const submitCollection = requireRole(['admin', 'manager', 'sales', 'delivery']);
const accountCollection = requireRole(['admin', 'accountant']);

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    ok: false,
    message: errors.array()[0]?.msg || 'Dữ liệu không hợp lệ',
    errors: errors.array()
  });
}

router.get('/', viewCollections, [
  query('status').optional().isString().trim(),
  query('fromDate').optional().isISO8601().withMessage('fromDate không hợp lệ'),
  query('toDate').optional().isISO8601().withMessage('toDate không hợp lệ'),
  query('collectorType').optional().isIn(['sales', 'delivery']).withMessage('collectorType không hợp lệ'),
  query('customerCode').optional().isString().trim(),
  query('q').optional().isString().trim().isLength({ max: 100 }).withMessage('q không hợp lệ'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('search không hợp lệ'),
  query('page').optional().isInt({ min: 1 }).withMessage('page không hợp lệ'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('limit không hợp lệ')
], validateRequest, controller.list);


router.post('/', submitCollection, [
  body('customerCode').isString().trim().notEmpty().withMessage('Thiếu mã khách hàng'),
  body('amount').isFloat({ gt: 0 }).withMessage('Số tiền thu phải lớn hơn 0'),
  body('paymentMethod').optional().isIn(['cash', 'bank_transfer', 'bank', 'transfer', 'other']).withMessage('Hình thức thanh toán không hợp lệ'),
  body('note').optional().isString().trim(),
  body('collectorType').optional().isIn(['sales', 'delivery']).withMessage('collectorType không hợp lệ'),
  body('allocations').isArray({ min: 1 }).withMessage('Cần chọn ít nhất một đơn nợ'),
  body('allocations.*.salesOrderCode').optional().isString().trim(),
  body('allocations.*.orderCode').optional().isString().trim(),
  body('allocations.*.allocatedAmount').isFloat({ gt: 0 }).withMessage('Số tiền phân bổ phải lớn hơn 0'),
  body('idempotencyKey').optional().isString().trim().isLength({ max: 160 })
], validateRequest, controller.submit);

router.post('/:id/confirm', accountCollection, [
  param('id').isString().trim().notEmpty().withMessage('Thiếu mã phiếu thu nợ'),
  body('actualReceivedAmount').isFloat({ gt: 0 }).withMessage('Số tiền thực nhận phải lớn hơn 0'),
  body('accountingNote').optional().isString().trim()
], validateRequest, controller.confirm);

router.post('/:id/reject', accountCollection, [
  param('id').isString().trim().notEmpty().withMessage('Thiếu mã phiếu thu nợ'),
  body('reason').isString().trim().notEmpty().withMessage('Cần nhập lý do từ chối')
], validateRequest, controller.reject);

module.exports = router;
