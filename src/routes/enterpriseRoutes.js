'use strict';

const express = require('express');
const controller = require('../controllers/enterpriseController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();
router.get('/status', requireRole(['admin', 'manager']), controller.status);
router.get('/readiness', requireRole(['admin', 'manager']), controller.readiness);
router.post('/outbox/drain', requireRole(['admin']), controller.drainOutbox);
router.post('/integrations/drain', requireRole(['admin']), controller.drainIntegrations);

module.exports = router;
