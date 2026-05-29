'use strict';

const express = require('express');
const reportController = require('../controllers/reportController');

const router = express.Router();

// Backward-compatible report endpoints used by old UI.
router.get('/stock', reportController.stock);
router.get('/debts', reportController.debts);
router.get('/dashboard', reportController.dashboard);

// Clean report namespace for new UI/API.
router.get('/reports/stock', reportController.stock);
router.get('/reports/debts', reportController.debts);
router.get('/reports/dashboard', reportController.dashboard);
router.get('/reports/sales', reportController.sales);
router.get('/reports/finance', reportController.finance);
router.get('/reports/delivery', reportController.delivery);

module.exports = router;
