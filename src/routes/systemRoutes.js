'use strict';

const express = require('express');
const systemController = require('../controllers/systemController');
const { requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// Legacy-compatible system endpoints mounted before legacy fallback.
router.get('/health', systemController.health);
router.get('/data', requireRole(['admin']), systemController.data);
router.get('/system/data-source', requireRole(['admin', 'manager']), systemController.dataSource);

// Phase 2.9.3 clean system endpoints.
router.get('/system/status', systemController.status);
router.get('/system/api-monitor', requireRole(['admin', 'manager']), systemController.apiMonitor);
router.get('/system/operations', requireRole(['admin', 'manager']), systemController.operations);
router.get('/system/performance-baseline', requireRole(['admin', 'manager']), systemController.performanceBaseline);
router.get('/system/release', requireRole(['admin', 'manager']), systemController.release);
router.post('/system/api-monitor/reset', requireRole(['admin']), systemController.resetApiMonitor);
router.post('/system/performance-baseline/reset', requireRole(['admin']), systemController.resetPerformanceBaseline);
router.get('/system/reconciliation-reports', requireRole(['admin', 'manager']), systemController.listReconciliationReports);
router.post('/system/reconciliation/run', requireRole(['admin']), systemController.runReconciliation);
router.get('/system/health', systemController.health);
router.get('/system/health/db', systemController.dbHealth);
router.get('/system/settings', requireRole(['admin', 'manager']), systemController.listSettings);
router.get('/system/settings/:key', requireRole(['admin', 'manager']), systemController.getSetting);
router.put('/system/settings/:key', requireRole(['admin']), systemController.saveSetting);
router.post('/system/backup', requireRole(['admin']), systemController.backup);
router.get('/system/backups', requireRole(['admin']), systemController.listBackups);
router.post('/system/backups/:fileName/verify', requireRole(['admin']), systemController.verifyBackup);
router.post('/system/reset', requireRole(['admin']), systemController.reset);

module.exports = router;
