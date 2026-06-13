'use strict';

const express = require('express');
const productController = require('../controllers/productController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const manageProducts = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const viewProducts = requireRole(['admin', 'manager', 'accountant', 'warehouse', 'sales', 'delivery']);

router.get('/search', viewProducts, productController.search);
router.get('/', viewProducts, productController.list);
router.post('/', manageProducts, productController.create);
router.put('/:id', manageProducts, productController.update);
router.patch('/:id/status', manageProducts, productController.setStatus);

module.exports = router;
