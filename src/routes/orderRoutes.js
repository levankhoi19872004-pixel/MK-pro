'use strict';

const express = require('express');
const orderController = require('../controllers/orderController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/search', orderController.search);
router.get('/', orderController.list);
router.post('/', orderController.create);
router.get('/:id', orderController.get);
router.put('/:id', orderController.update);
router.patch('/:id/vat-invoice-setting', requireRole(['admin', 'accountant']), orderController.updateVatInvoiceSetting);
router.patch('/:id', orderController.update);
router.post('/:id/cancel', orderController.cancel);
router.delete('/:id', orderController.remove);

module.exports = router;
