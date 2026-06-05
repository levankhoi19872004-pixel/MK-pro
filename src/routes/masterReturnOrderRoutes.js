'use strict';

const express = require('express');
const masterReturnOrderController = require('../controllers/masterReturnOrderController');

const router = express.Router();

router.get('/unmerged-return-orders', masterReturnOrderController.listUnmerged);
router.get('/', masterReturnOrderController.list);
router.post('/', masterReturnOrderController.create);
router.get('/:id', masterReturnOrderController.get);
router.put('/:id', masterReturnOrderController.update);
router.patch('/:id', masterReturnOrderController.update);
router.post('/:id/receive', masterReturnOrderController.receive);
router.post('/:id/cancel', masterReturnOrderController.cancel);

module.exports = router;
