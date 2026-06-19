'use strict';

const express = require('express');
const searchController = require('../controllers/searchController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

const viewOperationalData = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const viewFinancialData = requireRole(['admin', 'manager', 'accountant']);

function requireSearchTypeAccess(req, res, next) {
  const type = String(req.params.type || '').trim().toLowerCase();
  const role = String(req.user?.role || '').trim().toLowerCase();
  const publicCatalogTypes = new Set(['product', 'products', 'stock']);
  const financialTypes = new Set(['ar-ledger', 'ar_ledger', 'debt', 'debts']);
  const operationalTypes = new Set([
    'customer', 'customers',
    'staff', 'staffs', 'user', 'users',
    'sales-staff', 'sales_staff', 'salesstaff', 'sales',
    'delivery-staff', 'delivery_staff', 'deliverystaff', 'delivery',
    'order', 'orders', 'master-order', 'master-orders', 'master_order', 'master_orders'
  ]);

  if (publicCatalogTypes.has(type)) return next();
  if (financialTypes.has(type) && ['admin', 'manager', 'accountant'].includes(role)) return next();
  if (operationalTypes.has(type) && ['admin', 'manager', 'accountant', 'warehouse'].includes(role)) return next();

  return res.status(403).json({
    ok: false,
    success: false,
    message: 'Bạn không có quyền truy cập loại dữ liệu tìm kiếm này'
  });
}

router.get('/customers', viewOperationalData, searchController.customers);
router.get('/products', searchController.products);
router.get('/sales-staff', viewOperationalData, searchController.salesStaff);
router.get('/delivery-staff', viewOperationalData, searchController.deliveryStaff);
router.get('/orders', viewOperationalData, searchController.orders);
router.get('/master-orders', viewOperationalData, searchController.masterOrders);
router.get('/ar-ledger', viewFinancialData, searchController.arLedger);

// Backward-compatible aliases.
router.get('/staffs', viewOperationalData, searchController.staffs);
router.get('/users', viewOperationalData, searchController.staffs);
router.get('/:type', requireSearchTypeAccess, searchController.byType);

module.exports = router;
