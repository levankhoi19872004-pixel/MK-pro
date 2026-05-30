'use strict';

const express = require('express');
const masterOrderController = require('../controllers/masterOrderController');

const router = express.Router();

router.get('/unmerged-child-orders', masterOrderController.listUnmergedChildOrders);
router.get('/delivery-today', masterOrderController.listDeliveryToday);
router.get('/', masterOrderController.list);
router.post('/', masterOrderController.create);
router.get('/:id', masterOrderController.get);
router.put('/:id', masterOrderController.update);
router.patch('/:id', masterOrderController.update);
router.post('/:id/cancel', masterOrderController.cancel);
router.delete('/:id', masterOrderController.remove);

module.exports = router;
