'use strict';

const express = require('express');
const searchController = require('../controllers/searchController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const viewCustomers = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

// Phase 3.6: API tìm kiếm catalog nhẹ cho autocomplete.
// Không trả toàn bộ danh mục; mặc định/tối đa 50 kết quả.
router.get('/products/search', searchController.products);
router.get('/customers/search', viewCustomers, searchController.customers);

module.exports = router;
