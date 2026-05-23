'use strict';

const express = require('express');
const authMobile = require('../../middlewares/authMobile');
const deliveryService = require('../../services/mobile/mobileDeliveryService');

const router = express.Router();

router.use(authMobile(['delivery', 'admin']));

router.get('/dashboard', async (req, res) => {
  const data = await deliveryService.getDashboard(req.user);
  res.json({ success: true, data });
});

router.get('/orders-today', async (req, res) => {
  const data = await deliveryService.getTodayOrders(req.user);
  res.json({ success: true, data });
});

router.get('/debts', async (req, res) => {
  const data = await deliveryService.getDebts(req.user);
  res.json({ success: true, data });
});

router.post('/confirm', async (req, res) => {
  const data = await deliveryService.confirmDelivery(req.user, req.body);
  res.json({ success: true, message: 'Xác nhận giao hàng thành công', data });
});

router.post('/collect-debt', async (req, res) => {
  const data = await deliveryService.collectDebt(req.user, req.body);
  res.json({ success: true, message: 'Thu nợ thành công', data });
});

module.exports = router;
