'use strict';

const { getMobileRuntimeConfig } = require('../../services/mobile/runtimeConfig.service');
const { recordClientTelemetry } = require('../../services/mobile/telemetry.service');

function createMobileRuntimeController(ctx) {
  return {
    config(req, res) {
      return res.json({ ok: true, success: true, config: getMobileRuntimeConfig() });
    },

    async telemetry(req, res) {
      try {
        const result = await recordClientTelemetry(req.body || {}, {
          actor: req.mobileUser || req.user || {},
          writeMobileLogDirect: ctx.writeMobileLogDirect
        });
        return res.status(202).json({ ok: true, success: true, ...result });
      } catch (error) {
        return res.status(error.status || 400).json({
          ok: false,
          success: false,
          code: error.code || 'MOBILE_TELEMETRY_REJECTED',
          message: error.message || 'Không ghi nhận được telemetry mobile'
        });
      }
    }
  };
}

module.exports = { createMobileRuntimeController };
