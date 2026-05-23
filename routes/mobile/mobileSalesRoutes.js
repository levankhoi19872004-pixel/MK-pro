'use strict';

const express = require('express');
const authMobile = require('../../middlewares/authMobile');
const salesService = require('../../services/mobile/mobileSalesService');
const { asyncHandler, ok } = require('../../utils/http');

const router = express.Router();

router.use(authMobile(['sales', 'admin']));

router.get('/dashboard', asyncHandler(async (req, res) => {
  const data = await salesService.getDashboard(req.user);
  return ok(res, data);
}));

router.get('/products', asyncHandler(async (req, res) => {
  const data = await salesService.getProducts(req.user);
  return ok(res, data);
}));

router.get('/customers', asyncHandler(async (req, res) => {
  const data = await salesService.getCustomers(req.user);
  return ok(res, data);
}));

router.post('/orders', asyncHandler(async (req, res) => {
  const data = await salesService.createOrder(req.user, req.body);
  const message = data.updated ? 'Đã cập nhật đơn' : (data.created === false ? 'Đơn đã tồn tại, không tạo trùng' : 'Tạo đơn thành công');
  return ok(res, data, message);
}));

router.delete('/orders/:id', asyncHandler(async (req, res) => {
  const data = await salesService.deleteOrder(req.user, req.params.id);
  return ok(res, data, 'Đã xóa đơn');
}));

router.get('/orders/today', asyncHandler(async (req, res) => {
  const data = await salesService.getTodayOrders(req.user);
  return ok(res, data);
}));

router.get('/debts', asyncHandler(async (req, res) => {
  const data = await salesService.getDebts(req.user);
  return ok(res, data);
}));

module.exports = router;
