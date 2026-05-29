'use strict';

const express = require('express');
const masterOrderController = require('../controllers/masterOrderController');

const router = express.Router();

router.get('/unmerged-child-orders', masterOrderController.listUnmergedChildOrders);
router.get('/', masterOrderController.list);
router.post('/', masterOrderController.create);
router.post('/:id/cancel', masterOrderController.cancel);

module.exports = router;
