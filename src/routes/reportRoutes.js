'use strict';

const express = require('express');
const reportController = require('../controllers/reportController');

const router = express.Router();

// Backward-compatible report endpoints used by old UI.
router.get('/stock', reportController.stock);
router.get('/stock-card', reportController.stockCard);
router.post('/inventory/rebuild', reportController.rebuildInventory);
router.post('/inventory/normalize-one-warehouse', reportController.normalizeOneWarehouse);
router.get('/debts/init', reportController.debtsInit);
router.get('/debts/customers', reportController.debtsCustomers);
router.get('/debts/customer-detail/:customerCode?', reportController.debtsCustomerDetail);
router.get('/debts/ar-ledger', reportController.debtsArLedger);
router.get('/debts', reportController.debts);
router.get('/debts/by-salesman', reportController.debtsBySalesman);
router.get('/debts/by-delivery', reportController.debtsByDelivery);
router.get('/dashboard', reportController.dashboard);

// Clean report namespace for new UI/API.
router.get('/reports/stock', reportController.stock);
router.get('/reports/stock-card', reportController.stockCard);
router.post('/reports/inventory/rebuild', reportController.rebuildInventory);
router.post('/reports/inventory/normalize-one-warehouse', reportController.normalizeOneWarehouse);
router.get('/reports/debts/init', reportController.debtsInit);
router.get('/reports/debts/customers', reportController.debtsCustomers);
router.get('/reports/debts/customer-detail/:customerCode?', reportController.debtsCustomerDetail);
router.get('/reports/debts/ar-ledger', reportController.debtsArLedger);
router.get('/reports/debts', reportController.debts);
router.get('/reports/debts/by-salesman', reportController.debtsBySalesman);
router.get('/reports/debts/by-delivery', reportController.debtsByDelivery);
router.get('/reports/dashboard', reportController.dashboard);
router.get('/reports/sales', reportController.sales);
router.get('/reports/finance', reportController.finance);
router.get('/reports/delivery', reportController.delivery);

module.exports = router;
