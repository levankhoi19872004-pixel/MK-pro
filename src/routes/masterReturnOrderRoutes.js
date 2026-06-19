'use strict';

const express = require('express');
const masterReturnOrderController = require('../controllers/masterReturnOrderController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const manageMasterReturns = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const viewMasterReturns = manageMasterReturns;

router.get('/unmerged-return-orders', viewMasterReturns, masterReturnOrderController.listUnmerged);
router.get('/', viewMasterReturns, masterReturnOrderController.list);
router.post('/', manageMasterReturns, masterReturnOrderController.create);
router.get('/:id', viewMasterReturns, masterReturnOrderController.get);
router.put('/:id', manageMasterReturns, masterReturnOrderController.update);
router.patch('/:id', manageMasterReturns, masterReturnOrderController.update);
router.post('/:id/receive', manageMasterReturns, masterReturnOrderController.receive);
router.post('/:id/cancel', manageMasterReturns, masterReturnOrderController.cancel);

module.exports = router;
