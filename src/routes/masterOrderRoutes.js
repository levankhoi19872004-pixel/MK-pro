'use strict';

const express = require('express');
const masterOrderController = require('../controllers/masterOrderController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
const manageMasterOrders = requireRole(['admin', 'manager', 'accountant']);
const viewMasterOrders = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

router.get('/unmerged-child-orders', viewMasterOrders, masterOrderController.listUnmergedChildOrders);
router.get('/delivery-today-summary', viewMasterOrders, masterOrderController.listDeliveryTodaySummary);
router.get('/delivery-today-summary/:deliveryStaffCode', viewMasterOrders, masterOrderController.listDeliveryTodaySalesSummary);
router.get('/delivery-today-orders', viewMasterOrders, masterOrderController.listDeliveryTodayOrdersCompact);
router.get('/delivery-today', viewMasterOrders, masterOrderController.listDeliveryToday);
router.post('/delivery-today/confirm-accounting', requireRole(['admin', 'accountant']), masterOrderController.confirmDeliveryAccounting);
router.post('/delivery-today/:id/admin-unlock', requireRole(['admin']), masterOrderController.adminUnlockDeliveryAccounting);
router.patch('/delivery-today/:id', manageMasterOrders, masterOrderController.updateDeliveryTodayOrder);
router.post('/print-aggregate', viewMasterOrders, masterOrderController.printAggregate);
router.get('/', viewMasterOrders, masterOrderController.list);
router.post('/', manageMasterOrders, masterOrderController.create);
router.get('/:id', viewMasterOrders, masterOrderController.get);
router.put('/:id', manageMasterOrders, masterOrderController.update);
router.patch('/:id', manageMasterOrders, masterOrderController.update);
router.post('/:id/cancel', manageMasterOrders, masterOrderController.cancel);
router.delete('/:id', manageMasterOrders, masterOrderController.remove);

module.exports = router;
