'use strict';

const express = require('express');
const controller = require('../controllers/deliveryPlanningController');
const { requireRole } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../middlewares/featureFlag.middleware');
const { FLAGS } = require('../config/featureFlags');

const router = express.Router();
router.use(requireFeature(FLAGS.deliveryPlanning, 'điều hành tuyến giao hàng'));
router.get('/plans', requireRole(['admin', 'manager', 'warehouse', 'delivery']), controller.list);
router.post('/plans', requireRole(['admin', 'manager', 'warehouse']), controller.create);
router.patch('/plans/:planId/stops/:stopId', requireRole(['admin', 'manager', 'delivery']), controller.updateStop);

module.exports = router;
