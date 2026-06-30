'use strict';

const express = require('express');
const reportController = require('../controllers/reportController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const adminOnly = requireRole(['admin']);
const viewBusinessReports = requireRole(['admin', 'manager', 'accountant']);
const viewStockReports = requireRole(['admin', 'manager', 'accountant', 'warehouse', 'sales']);
const reportCenterAccess = requireRole(['admin', 'manager', 'accountant', 'warehouse', 'sales']);

// Backward-compatible report endpoints used by old UI.
router.get('/stock', viewStockReports, reportController.stock);
router.get('/inventory-movement', viewStockReports, reportController.inventoryMovement);
router.get('/stock-card', viewStockReports, reportController.stockCard);
router.post('/inventory/rebuild', adminOnly, reportController.rebuildInventory);
router.post('/inventory/normalize-one-warehouse', adminOnly, reportController.normalizeOneWarehouse);
router.get('/debts/init', viewBusinessReports, reportController.debtsInit);
router.get('/debts/customers', viewBusinessReports, reportController.debtsCustomers);
router.get('/debts/customers/:customerCode/orders', viewBusinessReports, reportController.debtsCustomerOrders);
router.get('/debts/customer-detail/:customerCode?', viewBusinessReports, reportController.debtsCustomerDetail);
router.get('/debts/ar-ledger', viewBusinessReports, reportController.debtsArLedger);
router.get('/debts', viewBusinessReports, reportController.debts);
router.get('/debts/by-salesman', viewBusinessReports, reportController.debtsBySalesman);
router.get('/debts/by-delivery', viewBusinessReports, reportController.debtsByDelivery);
router.get('/dashboard', viewBusinessReports, reportController.dashboard);

// Report Center v2: catalog được lọc theo vai trò; từng mẫu tiếp tục kiểm tra quyền trong service.
router.get('/reports/catalog', reportCenterAccess, reportController.reportCatalog);
router.get('/reports/overview', reportCenterAccess, reportController.reportOverview);
router.get('/reports/run/:code', reportCenterAccess, reportController.runReport);

// Clean report namespace for new UI/API.
router.get('/reports/stock', viewStockReports, reportController.stock);
router.get('/reports/inventory-movement', viewStockReports, reportController.inventoryMovement);
router.get('/reports/stock-card', viewStockReports, reportController.stockCard);
router.post('/reports/inventory/rebuild', adminOnly, reportController.rebuildInventory);
router.post('/reports/inventory/normalize-one-warehouse', adminOnly, reportController.normalizeOneWarehouse);
router.get('/reports/debts/init', viewBusinessReports, reportController.debtsInit);
router.get('/reports/debts/customers', viewBusinessReports, reportController.debtsCustomers);
router.get('/reports/debts/customers/:customerCode/orders', viewBusinessReports, reportController.debtsCustomerOrders);
router.get('/reports/debts/customer-detail/:customerCode?', viewBusinessReports, reportController.debtsCustomerDetail);
router.get('/reports/debts/ar-ledger', viewBusinessReports, reportController.debtsArLedger);
router.get('/reports/debts', viewBusinessReports, reportController.debts);
router.get('/reports/debts/by-salesman', viewBusinessReports, reportController.debtsBySalesman);
router.get('/reports/debts/by-delivery', viewBusinessReports, reportController.debtsByDelivery);
router.get('/reports/dashboard', viewBusinessReports, reportController.dashboard);
router.get('/reports/sales', viewBusinessReports, reportController.sales);
router.get('/reports/finance', viewBusinessReports, reportController.finance);
router.get('/reports/delivery', viewBusinessReports, reportController.delivery);
router.get('/reports/returns', viewBusinessReports, reportController.returns);

module.exports = router;
