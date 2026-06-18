'use strict';

const express = require('express');
const controller = require('../controllers/analyticsController');
const { requireRole } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../middlewares/featureFlag.middleware');
const { FLAGS } = require('../config/featureFlags');

const router = express.Router();
router.use(requireFeature(FLAGS.analyticsProjections, 'projection báo cáo'));
router.get('/projections', requireRole(['admin', 'manager', 'accountant']), controller.list);
router.post('/projections/rebuild', requireRole(['admin', 'manager']), controller.rebuild);

module.exports = router;
