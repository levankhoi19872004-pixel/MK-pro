'use strict';

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const controller = require('../controllers/debtCollectionController');

const router = express.Router();

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  return res.status(400).json({
    ok: false,
    message: errors.array()[0]?.msg || 'Dữ liệu không hợp lệ',
    errors: errors.array()
  });
}

router.get('/', [
  query('status').optional().isString().trim(),
  query('fromDate').optional().isISO8601().withMessage('fromDate không hợp lệ'),
  query('toDate').optional().isISO8601().withMessage('toDate không hợp lệ'),
  query('collectorType').optional().isIn(['sales', 'delivery']).withMessage('collectorType không hợp lệ'),
  query('customerCode').optional().isString().trim(),
  query('limit').optional().isInt({ min: 1, max: 1000 }).withMessage('limit không hợp lệ')
], validateRequest, controller.list);

router.post('/:id/confirm', [
  param('id').isString().trim().notEmpty().withMessage('Thiếu mã phiếu thu nợ'),
  body('actualReceivedAmount').isFloat({ gt: 0 }).withMessage('Số tiền thực nhận phải lớn hơn 0'),
  body('accountingNote').optional().isString().trim()
], validateRequest, controller.confirm);

router.post('/:id/reject', [
  param('id').isString().trim().notEmpty().withMessage('Thiếu mã phiếu thu nợ'),
  body('reason').isString().trim().notEmpty().withMessage('Cần nhập lý do từ chối')
], validateRequest, controller.reject);

module.exports = router;
