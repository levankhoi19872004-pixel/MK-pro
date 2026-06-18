'use strict';

const express = require('express');
const controller = require('../controllers/platformController');
const { requireRole } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../middlewares/featureFlag.middleware');
const { FLAGS } = require('../config/featureFlags');

const router = express.Router();
router.use(requireFeature(FLAGS.multiTenant, 'nền tảng nhiều doanh nghiệp'));
router.use(requireRole(['admin']));
router.get('/tenants', controller.listTenants);
router.post('/tenants', controller.createTenant);
router.put('/tenants/:tenantId/subscription', controller.updateSubscription);

module.exports = router;
