'use strict';

const express = require('express');
const searchController = require('../controllers/searchController');

const router = express.Router();

router.get('/products', searchController.products);
router.get('/customers', searchController.customers);
router.get('/staffs', searchController.staffs);
router.get('/users', searchController.staffs);
router.get('/:type', searchController.byType);

module.exports = router;
