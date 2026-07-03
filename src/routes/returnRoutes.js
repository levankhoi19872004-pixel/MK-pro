'use strict';

const express = require('express');
const returnOrderController = require('../controllers/returnOrderController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const manageReturns = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const viewReturns = manageReturns;

router.get('/', viewReturns, returnOrderController.list);
router.post('/', manageReturns, returnOrderController.create);
router.get('/by-sales-order/:salesOrderId', viewReturns, returnOrderController.getBySalesOrder);
router.put('/by-sales-order/:salesOrderId/items', manageReturns, returnOrderController.updateItemsBySalesOrder);
router.put('/:id/items', manageReturns, returnOrderController.updateItems);
router.post('/:id/stock-in', requireRole(['admin', 'accountant']), returnOrderController.stockIn);
router.post('/:id/confirm-accounting', requireRole(['admin', 'accountant']), returnOrderController.confirmAccounting);
router.post('/:id/cancel', manageReturns, returnOrderController.cancel);

module.exports = router;
