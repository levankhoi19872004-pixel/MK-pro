'use strict';

const service = require('../../services/mobile/MobileSyncService');

function createMobileSyncController() {
  return {
    async batch(req, res) {
      try {
        const result = await service.syncBatch(req.body || {}, {
          tenantId: req.tenantId,
          actor: req.mobileUser || req.user || {},
          deviceId: req.body?.deviceId || req.headers['x-device-id']
        });
        return res.json({ ok: true, success: true, ...result });
      } catch (error) {
        return res.status(error.status || 400).json({
          ok: false,
          success: false,
          code: error.code,
          message: error.message || 'Không đồng bộ được dữ liệu offline'
        });
      }
    }
  };
}

module.exports = { createMobileSyncController };
