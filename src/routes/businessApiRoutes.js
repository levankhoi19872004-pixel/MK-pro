const router = require('express').Router();
const ctrl = require('../controllers/businessApiController');
const { auth, requirePermission } = require('../middleware/auth');

// API chuẩn mới: Web quản lý / App bán hàng / App giao hàng gọi các endpoint này.
router.get('/orders', auth, requirePermission('order:view'), ctrl.listOrders);
router.get('/orders/:id', auth, requirePermission('order:view'), ctrl.getOrder);
router.post('/orders', auth, requirePermission('order:create'), ctrl.createOrder);
router.post('/orders/:id/cancel', auth, requirePermission('order:delete'), ctrl.cancelOrder);

router.get('/inventory', auth, requirePermission('stock:view'), ctrl.listInventory);
router.get('/inventory/:sku', auth, requirePermission('stock:view'), ctrl.getInventoryItem);
router.post('/inventory/receive', auth, requirePermission('receive:create'), ctrl.receiveInventory);

router.get('/debts', auth, requirePermission('debt:view'), ctrl.listDebts);
router.get('/debts/:customerCode', auth, requirePermission('debt:view'), ctrl.getCustomerDebt);
router.post('/debts/collect', auth, requirePermission('debt:collect'), ctrl.collectDebt);

router.post('/delivery/complete', auth, requirePermission('delivery:complete'), ctrl.completeDelivery);

module.exports = router;
