'use strict';

const express = require('express');
const searchController = require('../controllers/searchController');

const router = express.Router();

router.get('/customers', searchController.customers);
router.get('/products', searchController.products);
router.get('/sales-staff', searchController.salesStaff);
router.get('/delivery-staff', searchController.deliveryStaff);
router.get('/orders', searchController.orders);
router.get('/master-orders', searchController.masterOrders);
router.get('/ar-ledger', searchController.arLedger);

// Backward-compatible aliases.
router.get('/staffs', searchController.staffs);
router.get('/users', searchController.staffs);
router.get('/:type', searchController.byType);

module.exports = router;
