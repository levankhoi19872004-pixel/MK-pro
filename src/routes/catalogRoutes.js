'use strict';

const express = require('express');
const searchController = require('../controllers/searchController');

const router = express.Router();

// Phase 3.6: API tìm kiếm catalog nhẹ cho autocomplete.
// Không trả toàn bộ danh mục; mặc định/tối đa 50 kết quả.
router.get('/products/search', searchController.products);
router.get('/customers/search', searchController.customers);

module.exports = router;
