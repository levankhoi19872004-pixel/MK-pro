'use strict';

const express = require('express');
const { body, query } = require('express-validator');
const { createMobileDeliveryController } = require('../../controllers/mobile/delivery.controller');

function createMobileDeliveryRouter(ctx) {
  const router = express.Router();
  const controller = createMobileDeliveryController(ctx);
  const { requireMobileLogin, requireMobileRole, validateRequest } = ctx;
  const onlyDelivery = [requireMobileLogin, requireMobileRole(['delivery'])];

  router.get('/orders', ...onlyDelivery, [
    query('date').optional().isISO8601().withMessage('Ngày giao không hợp lệ'),
    query('status').optional().isString().trim(),
    query('q').optional().isString().trim(),
    query('includeCompleted').optional().isIn(['0', '1', 'true', 'false']).withMessage('includeCompleted không hợp lệ')
  ], validateRequest, controller.listOrders);

  router.get('/returns', ...onlyDelivery, [
    query('date').optional().isISO8601().withMessage('Ngày giao không hợp lệ'),
    query('orderId').optional().isString().trim(),
    query('orderCode').optional().isString().trim(),
    query('salesOrderId').optional().isString().trim(),
    query('salesOrderCode').optional().isString().trim(),
    query('deliveryStaffCode').optional().isString().trim(),
    query('q').optional().isString().trim()
  ], validateRequest, controller.listReturns);

  router.post('/confirm', ...onlyDelivery, [
    body('orderId').isString().trim().notEmpty().withMessage('Thiếu mã đơn giao'),
    body('status').isIn(['success', 'failed']).withMessage('Trạng thái giao hàng không hợp lệ'),
    body('collectAmount').optional().isFloat({ min: 0 }).withMessage('Tiền thu không được âm'),
    body('cashAmount').optional().isFloat({ min: 0 }).withMessage('Tiền mặt không được âm'),
    body('bankAmount').optional().isFloat({ min: 0 }).withMessage('Chuyển khoản không được âm'),
    body('rewardAmount').optional().isFloat({ min: 0 }).withMessage('Tiền trả thưởng không được âm'),
    body('collectionMethod').optional().isIn(['cash', 'transfer']).withMessage('Hình thức thu không hợp lệ'),
    body('paymentMethod').optional().isIn(['cash', 'transfer']).withMessage('Hình thức thu không hợp lệ'),
    body('note').optional().isString().trim(),
    body('idempotencyKey').optional().isString().trim().isLength({ max: 160 })
  ], validateRequest, controller.confirm);

  router.post('/return', ...onlyDelivery, [
    body('orderId').isString().trim().notEmpty().withMessage('Thiếu mã đơn giao'),
    body('returnType').optional().isIn(['full', 'partial']).withMessage('Loại trả hàng không hợp lệ'),
    body('items').optional().isArray().withMessage('Danh sách hàng trả không hợp lệ'),
    body('note').optional().isString().trim(),
    body('idempotencyKey').optional().isString().trim().isLength({ max: 160 })
  ], validateRequest, controller.createReturn);


  router.post('/payment', ...onlyDelivery, [
    body('orderId').isString().trim().notEmpty().withMessage('Thiếu mã đơn giao'),
    body('cashAmount').optional().isFloat({ min: 0 }).withMessage('Tiền mặt không được âm'),
    body('bankAmount').optional().isFloat({ min: 0 }).withMessage('Chuyển khoản không được âm'),
    body('rewardAmount').optional().isFloat({ min: 0 }).withMessage('Tiền trả thưởng không được âm'),
    body('note').optional().isString().trim(),
    body('idempotencyKey').optional().isString().trim().isLength({ max: 160 })
  ], validateRequest, controller.submitPayment);



  router.get('/reconciliation', ...onlyDelivery, [
    query('date').optional().isISO8601().withMessage('Ngày đối soát không hợp lệ'),
    query('deliveryStaffCode').optional().isString().trim()
  ], validateRequest, controller.reconciliation);


  router.post('/location/session/start', ...onlyDelivery, [
    body('date').optional().isISO8601().withMessage('Ngày tuyến không hợp lệ'),
    body('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Vĩ độ không hợp lệ'),
    body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Kinh độ không hợp lệ'),
    body('accuracy').optional().isFloat({ min: 0 }).withMessage('Sai số GPS không hợp lệ'),
    body('clientTs').optional().isString().trim()
  ], validateRequest, controller.startRouteSession);

  router.post('/location/ping', ...onlyDelivery, [
    body('sessionId').optional().isString().trim(),
    body('date').optional().isISO8601().withMessage('Ngày tuyến không hợp lệ'),
    body('lat').isFloat({ min: -90, max: 90 }).withMessage('Thiếu/vĩ độ GPS không hợp lệ'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Thiếu/kinh độ GPS không hợp lệ'),
    body('accuracy').optional().isFloat({ min: 0 }).withMessage('Sai số GPS không hợp lệ'),
    body('speed').optional().isFloat().withMessage('Tốc độ GPS không hợp lệ'),
    body('heading').optional().isFloat().withMessage('Hướng GPS không hợp lệ'),
    body('altitude').optional().isFloat().withMessage('Cao độ GPS không hợp lệ'),
    body('clientTs').optional().isString().trim(),
    body('eventType').optional().isIn(['periodic', 'start', 'stop', 'customer_selected', 'delivery_confirmed']).withMessage('Loại điểm GPS không hợp lệ'),
    body('orderCode').optional().isString().trim(),
    body('customerCode').optional().isString().trim(),
    body('customerName').optional().isString().trim()
  ], validateRequest, controller.pingRouteLocation);

  router.post('/location/session/stop', ...onlyDelivery, [
    body('sessionId').optional().isString().trim(),
    body('date').optional().isISO8601().withMessage('Ngày tuyến không hợp lệ'),
    body('lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Vĩ độ không hợp lệ'),
    body('lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Kinh độ không hợp lệ'),
    body('accuracy').optional().isFloat({ min: 0 }).withMessage('Sai số GPS không hợp lệ'),
    body('clientTs').optional().isString().trim()
  ], validateRequest, controller.stopRouteSession);

  router.get('/location/session/current', ...onlyDelivery, [
    query('date').optional().isISO8601().withMessage('Ngày tuyến không hợp lệ')
  ], validateRequest, controller.currentRouteSession);

  router.post('/cash/submit', ...onlyDelivery, [
    body('amount').isFloat({ gt: 0 }).withMessage('Số tiền nộp quỹ phải lớn hơn 0'),
    body('note').optional().isString().trim(),
    body('idempotencyKey').optional().isString().trim().isLength({ max: 160 })
  ], validateRequest, controller.submitCash);

  return router;
}

module.exports = { createMobileDeliveryRouter };
