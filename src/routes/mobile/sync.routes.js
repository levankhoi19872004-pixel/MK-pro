'use strict';

const express = require('express');
const { createMobileSyncController } = require('../../controllers/mobile/sync.controller');
const { isLegacyDrainAvailable } = require('../../services/mobile/runtimeConfig.service');

function requireLegacyDrain(req, res, next) {
  if (isLegacyDrainAvailable()) return next();
  return res.status(404).json({
    ok: false,
    success: false,
    code: 'MOBILE_LEGACY_SYNC_DRAIN_DISABLED',
    message: 'Kênh đồng bộ dữ liệu offline tồn đọng đã được đóng'
  });
}

function createMobileSyncRouter(ctx) {
  const router = express.Router();
  const controller = createMobileSyncController(ctx);
  router.use(requireLegacyDrain);
  router.post('/batch', ctx.requireMobileLogin, ctx.requireMobileRole(['sales', 'delivery']), controller.batch);
  return router;
}

module.exports = { createMobileSyncRouter, requireLegacyDrain };
