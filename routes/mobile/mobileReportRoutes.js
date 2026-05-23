'use strict';

const express = require('express');
const authMobile = require('../../middlewares/authMobile');
const reportService = require('../../services/mobile/mobileReportService');

const router = express.Router();

router.use(authMobile(['sales', 'delivery', 'admin', 'accountant']));

router.get('/sales', async (req, res) => {
  const data = await reportService.getSalesReport(req.user, req.query);
  res.json({ success: true, data });
});

router.get('/delivery', async (req, res) => {
  const data = await reportService.getDeliveryReport(req.user, req.query);
  res.json({ success: true, data });
});

module.exports = router;
