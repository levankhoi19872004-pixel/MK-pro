'use strict';

const express = require('express');
const systemController = require('../controllers/systemController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// Legacy-compatible system endpoints mounted before legacy fallback.
router.get('/health', systemController.health);
router.get('/data', systemController.data);
router.get('/system/data-source', systemController.dataSource);

// Phase 2.9.3 clean system endpoints.
router.get('/system/status', systemController.status);
router.get('/system/api-monitor', requireRole(['admin', 'manager']), systemController.apiMonitor);
router.post('/system/api-monitor/reset', requireRole(['admin']), systemController.resetApiMonitor);
router.get('/system/health', systemController.health);
router.get('/system/health/db', systemController.dbHealth);
router.get('/system/settings', requireRole(['admin', 'manager']), systemController.listSettings);
router.get('/system/settings/:key', requireRole(['admin', 'manager']), systemController.getSetting);
router.put('/system/settings/:key', requireRole(['admin']), systemController.saveSetting);
router.post('/system/backup', requireRole(['admin']), systemController.backup);
router.post('/system/reset', requireRole(['admin']), systemController.reset);

module.exports = router;
