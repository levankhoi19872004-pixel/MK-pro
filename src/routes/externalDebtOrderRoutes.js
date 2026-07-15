'use strict';

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const controller = require('../controllers/externalDebtOrderController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({ ok: false, message: errors.array()[0]?.msg || 'Dữ liệu không hợp lệ', errors: errors.array() });
}

router.get('/', requireRole(['admin', 'accountant', 'manager']), [
  query('status').optional().isString().trim(),
  query('customerCode').optional().isString().trim(),
  query('salesStaffCode').optional().isString().trim(),
  query('deliveryStaffCode').optional().isString().trim(),
  query('fromDate').optional().isISO8601().withMessage('fromDate không hợp lệ'),
  query('toDate').optional().isISO8601().withMessage('toDate không hợp lệ'),
  query('q').optional().isString().trim().isLength({ max: 100 }).withMessage('q không hợp lệ'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('search không hợp lệ'),
  query('page').optional().isInt({ min: 1 }).withMessage('page không hợp lệ'),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('limit không hợp lệ')
], validateRequest, controller.list);

router.post('/', requireRole(['admin', 'accountant']), [
  body('customerCode').isString().trim().notEmpty().withMessage('Cần chọn khách hàng'),
  body('salesStaffCode').isString().trim().notEmpty().withMessage('Cần chọn nhân viên bán hàng phụ trách'),
  body('deliveryStaffCode').isString().trim().notEmpty().withMessage('Cần chọn nhân viên giao hàng phụ trách'),
  body('amount').isFloat({ gt: 0 }).withMessage('Số tiền công nợ phải lớn hơn 0'),
  body('documentDate').isISO8601().withMessage('Ngày ghi nhận không hợp lệ'),
  body('dueDate').optional({ checkFalsy: true }).isISO8601().withMessage('Hạn thanh toán không hợp lệ'),
  body('referenceCode').optional().isString().trim().isLength({ max: 120 }),
  body('reason').isString().trim().notEmpty().withMessage('Cần nhập lý do tạo công nợ'),
  body('idempotencyKey').optional().isString().trim().isLength({ max: 180 })
], validateRequest, controller.create);

module.exports = router;
