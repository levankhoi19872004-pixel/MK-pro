const router = require('express').Router();
const ctrl = require('../controllers/coreController');
const { auth, requirePermission } = require('../middleware/auth');

router.post('/core/orders', auth, requirePermission('order:create'), ctrl.createOrder);
router.post('/core/orders/:id/cancel', auth, requirePermission('order:delete'), ctrl.cancelOrder);
router.post('/core/delivery/complete', auth, requirePermission('delivery:complete'), ctrl.completeDelivery);
router.post('/core/payments', auth, requirePermission('debt:collect'), ctrl.recordPayment);
router.post('/core/cash-fund', auth, requirePermission('fund:create'), ctrl.addCashFund);
router.post('/core/import', auth, requirePermission('import:create'), ctrl.importRows);
router.post('/core/rebuild-ledger', auth, requirePermission('debt:edit'), ctrl.rebuildLedger);
router.get('/core/debts', auth, requirePermission('debt:view'), ctrl.debtSummary);

module.exports = router;
