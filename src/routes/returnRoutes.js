'use strict';

const express = require('express');
const returnOrderController = require('../controllers/returnOrderController');

const router = express.Router();

router.get('/', returnOrderController.list);
router.post('/', returnOrderController.create);
router.get('/by-sales-order/:salesOrderId', returnOrderController.getBySalesOrder);
router.put('/by-sales-order/:salesOrderId/items', returnOrderController.updateItemsBySalesOrder);
router.put('/:id/items', returnOrderController.updateItems);

module.exports = router;
