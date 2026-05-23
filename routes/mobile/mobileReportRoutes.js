'use strict';

const express = require('express');
const authMobile = require('../../middlewares/authMobile');
const reportService = require('../../services/mobile/mobileReportService');
const { asyncHandler, ok } = require('../../utils/http');

const router = express.Router();

router.use(authMobile(['sales', 'delivery', 'admin', 'accountant']));

router.get('/sales', asyncHandler(async (req, res) => ok(res, await reportService.getSalesReport(req.user, req.query))));
router.get('/delivery', asyncHandler(async (req, res) => ok(res, await reportService.getDeliveryReport(req.user, req.query))));

module.exports = router;
