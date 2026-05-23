'use strict';

const express = require('express');
const authMobile = require('../../middlewares/authMobile');
const deliveryService = require('../../services/mobile/mobileDeliveryService');
const { asyncHandler, ok } = require('../../utils/http');

const router = express.Router();

router.use(authMobile(['delivery', 'admin']));

router.get('/dashboard', asyncHandler(async (req, res) => ok(res, await deliveryService.getDashboard(req.user))));
router.get('/orders-today', asyncHandler(async (req, res) => ok(res, await deliveryService.getTodayOrders(req.user))));
router.get('/debts', asyncHandler(async (req, res) => ok(res, await deliveryService.getDebts(req.user))));
router.post('/confirm', asyncHandler(async (req, res) => ok(res, await deliveryService.confirmDelivery(req.user, req.body), 'Xác nhận giao hàng thành công')));
router.post('/collect-debt', asyncHandler(async (req, res) => ok(res, await deliveryService.collectDebt(req.user, req.body), 'Thu nợ thành công')));
router.post('/reports', asyncHandler(async (req, res) => ok(res, await deliveryService.createReport(req.user, req.body), 'Lưu báo cáo thành công')));

module.exports = router;
