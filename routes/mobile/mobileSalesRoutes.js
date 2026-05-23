'use strict';

const express = require('express');
const authMobile = require('../../middlewares/authMobile');
const salesService = require('../../services/mobile/mobileSalesService');

const router = express.Router();

router.use(authMobile(['sales', 'admin']));

router.get('/dashboard', async (req, res) => {
  const data = await salesService.getDashboard(req.user);
  res.json({ success: true, data });
});

router.get('/products', async (req, res) => {
  const data = await salesService.getProducts(req.user);
  res.json({ success: true, data });
});

router.get('/customers', async (req, res) => {
  const data = await salesService.getCustomers(req.user);
  res.json({ success: true, data });
});

router.post('/orders', async (req, res) => {
  const data = await salesService.createOrder(req.user, req.body);
  res.json({ success: true, message: 'Tạo đơn thành công', data });
});

router.get('/orders/today', async (req, res) => {
  const data = await salesService.getTodayOrders(req.user);
  res.json({ success: true, data });
});

router.get('/debts', async (req, res) => {
  const data = await salesService.getDebts(req.user);
  res.json({ success: true, data });
});

module.exports = router;
