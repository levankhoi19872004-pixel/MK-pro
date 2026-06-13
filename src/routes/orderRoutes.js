'use strict';

const express = require('express');
const orderController = require('../controllers/orderController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const writeOrders = requireRole(['admin', 'manager', 'accountant', 'sales']);
const viewOrders = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

router.get('/search', viewOrders, orderController.search);
router.get('/', viewOrders, orderController.list);
router.post('/', writeOrders, orderController.create);
router.get('/:id', viewOrders, orderController.get);
router.put('/:id', writeOrders, orderController.update);
router.patch('/:id/vat-invoice-setting', requireRole(['admin', 'accountant']), orderController.updateVatInvoiceSetting);
router.patch('/:id', writeOrders, orderController.update);
router.post('/:id/cancel', writeOrders, orderController.cancel);
router.delete('/:id', writeOrders, orderController.remove);

module.exports = router;
