'use strict';

const express = require('express');
const systemController = require('../controllers/systemController');

const router = express.Router();

// Legacy-compatible system endpoints mounted before legacy fallback.
router.get('/health', systemController.health);
router.get('/data', systemController.data);
router.get('/system/data-source', systemController.dataSource);

// Phase 2.9.3 clean system endpoints.
router.get('/system/status', systemController.status);
router.get('/system/health', systemController.health);
router.get('/system/health/db', systemController.dbHealth);
router.get('/system/settings', systemController.listSettings);
router.get('/system/settings/:key', systemController.getSetting);
router.put('/system/settings/:key', systemController.saveSetting);
router.post('/system/backup', systemController.backup);
router.post('/system/reset', systemController.reset);

module.exports = router;
