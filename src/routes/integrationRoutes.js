'use strict';

const express = require('express');
const controller = require('../controllers/integrationController');
const { requireRole } = require('../middlewares/auth.middleware');
const { requireFeature } = require('../middlewares/featureFlag.middleware');
const { FLAGS } = require('../config/featureFlags');

const router = express.Router();
router.use(requireFeature(FLAGS.integrations, 'tích hợp hệ thống ngoài'));
router.get('/jobs', requireRole(['admin', 'manager']), controller.list);
router.post('/jobs', requireRole(['admin']), controller.enqueue);
router.post('/jobs/:id/retry', requireRole(['admin']), controller.retry);

module.exports = router;
