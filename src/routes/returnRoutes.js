'use strict';

const express = require('express');
const returnOrderController = require('../controllers/returnOrderController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', returnOrderController.list);
router.post('/', returnOrderController.create);
router.get('/by-sales-order/:salesOrderId', returnOrderController.getBySalesOrder);
router.put('/by-sales-order/:salesOrderId/items', returnOrderController.updateItemsBySalesOrder);
router.put('/:id/items', returnOrderController.updateItems);
router.post('/:id/confirm-accounting', requireRole(['admin', 'accountant']), returnOrderController.confirmAccounting);
router.post('/:id/cancel', returnOrderController.cancel);

module.exports = router;
