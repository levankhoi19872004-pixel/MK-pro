'use strict';

const express = require('express');
const controller = require('../controllers/warehouseController');
const { requireRole } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../middlewares/featureFlag.middleware');
const { FLAGS } = require('../config/featureFlags');

const router = express.Router();
router.use(requireFeature(FLAGS.warehouseAdvanced, 'kho nâng cao'));
const view = requireRole(['admin', 'manager', 'accountant', 'warehouse']);
const manage = requireRole(['admin', 'manager', 'warehouse']);

router.get('/reservations', view, controller.reservations);
router.post('/reservations', manage, controller.reserve);
router.post('/reservations/:id/release', manage, controller.release);
router.get('/stock-counts', view, controller.stockCounts);
router.post('/stock-counts', manage, controller.postStockCount);

module.exports = router;
