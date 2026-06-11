'use strict';

const express = require('express');
const masterOrderController = require('../controllers/masterOrderController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/unmerged-child-orders', masterOrderController.listUnmergedChildOrders);
router.get('/delivery-today-summary', masterOrderController.listDeliveryTodaySummary);
router.get('/delivery-today-summary/:deliveryStaffCode', masterOrderController.listDeliveryTodaySalesSummary);
router.get('/delivery-today-orders', masterOrderController.listDeliveryTodayOrdersCompact);
router.get('/delivery-today', masterOrderController.listDeliveryToday);
router.post('/delivery-today/confirm-accounting', requireRole(['admin', 'accountant']), masterOrderController.confirmDeliveryAccounting);
router.post('/delivery-today/:id/admin-unlock', requireRole(['admin']), masterOrderController.adminUnlockDeliveryAccounting);
router.patch('/delivery-today/:id', masterOrderController.updateDeliveryTodayOrder);
router.post('/print-aggregate', masterOrderController.printAggregate);
router.get('/', masterOrderController.list);
router.post('/', masterOrderController.create);
router.get('/:id', masterOrderController.get);
router.put('/:id', masterOrderController.update);
router.patch('/:id', masterOrderController.update);
router.post('/:id/cancel', masterOrderController.cancel);
router.delete('/:id', masterOrderController.remove);

module.exports = router;
