'use strict';

const express = require('express');
const controller = require('../controllers/purchaseController');
const { requireRole } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../middlewares/featureFlag.middleware');
const { FLAGS } = require('../config/featureFlags');

const router = express.Router();
router.use(requireFeature(FLAGS.purchasing, 'mua hàng'));
const view = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const manage = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const accounting = requireRole(['admin', 'accountant']);

router.get('/orders', view, controller.list);
router.get('/orders/:id', view, controller.get);
router.post('/orders', manage, controller.create);
router.post('/orders/:id/approve', requireRole(['admin', 'manager', 'accountant']), controller.approve);
router.post('/orders/:id/receive', manage, controller.receive);
router.get('/receipts', view, controller.receipts);
router.get('/returns', view, controller.returns);
router.get('/payables', view, controller.payables);
router.post('/payments', accounting, controller.pay);
router.post('/returns', manage, controller.createReturn);

module.exports = router;
