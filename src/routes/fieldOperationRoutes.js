'use strict';

const express = require('express');
const controller = require('../controllers/fieldOperationController');
const { requireRole } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../middlewares/featureFlag.middleware');
const { FLAGS } = require('../config/featureFlags');

const router = express.Router();
router.use(requireFeature(FLAGS.fieldOperations, 'quản lý tuyến bán hàng'));
router.get('/plans', requireRole(['admin', 'manager', 'sales']), controller.list);
router.post('/plans', requireRole(['admin', 'manager']), controller.create);
router.post('/plans/:planId/stops/:stopId/check-in', requireRole(['admin', 'sales']), controller.checkIn);
router.post('/executions/:executionId/complete', requireRole(['admin', 'sales']), controller.complete);

module.exports = router;
