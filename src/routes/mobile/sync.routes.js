'use strict';

const express = require('express');
const { createMobileSyncController } = require('../../controllers/mobile/sync.controller');
const { requireFeature } = require('../../middlewares/featureFlag.middleware');
const { FLAGS } = require('../../config/featureFlags');

function createMobileSyncRouter(ctx) {
  const router = express.Router();
  const controller = createMobileSyncController();
  router.use(requireFeature(FLAGS.mobileOfflineSync, 'đồng bộ mobile offline'));
  router.post('/batch', ctx.requireMobileLogin, ctx.requireMobileRole(['sales', 'delivery']), controller.batch);
  return router;
}

module.exports = { createMobileSyncRouter };
