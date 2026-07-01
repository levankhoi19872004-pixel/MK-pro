'use strict';

const express = require('express');
const masterOrderController = require('../controllers/masterOrderController');
const { requireRole } = require('../middlewares/auth.middleware');
const { retiredRoute } = require('../middlewares/retiredRoute.middleware');

const router = express.Router();
const manageMasterOrders = requireRole(['admin', 'manager', 'accountant']);
const viewMasterOrders = requireRole(['admin', 'manager', 'accountant', 'warehouse']);

router.get('/unmerged-child-orders', viewMasterOrders, masterOrderController.listUnmergedChildOrders);
const legacyDeliveryTodayRetired = retiredRoute('legacy-master-order-delivery-today', {
  replacement: '/api/new/delivery-today/orders',
  message: 'Module Đơn giao hôm nay cũ đã được thay thế bằng Đơn giao hôm nay (New).'
});
router.all('/delivery-today-summary', legacyDeliveryTodayRetired);
router.all('/delivery-today-summary/:deliveryStaffCode', legacyDeliveryTodayRetired);
router.all('/delivery-today-orders', legacyDeliveryTodayRetired);
router.all('/delivery-today/confirm-accounting', legacyDeliveryTodayRetired);
router.all('/delivery-today/:id/admin-unlock', legacyDeliveryTodayRetired);
router.all('/delivery-today/:id', legacyDeliveryTodayRetired);
router.all('/delivery-today', legacyDeliveryTodayRetired);
router.post('/print-aggregate', viewMasterOrders, masterOrderController.printAggregate);
router.get('/', viewMasterOrders, masterOrderController.list);
router.post('/', manageMasterOrders, masterOrderController.create);
router.get('/:id', viewMasterOrders, masterOrderController.get);
router.put('/:id', manageMasterOrders, masterOrderController.update);
router.patch('/:id', manageMasterOrders, masterOrderController.update);
router.post('/:id/cancel', manageMasterOrders, masterOrderController.cancel);
router.delete('/:id', manageMasterOrders, masterOrderController.remove);

module.exports = router;
