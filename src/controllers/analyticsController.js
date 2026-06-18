'use strict';

const service = require('../services/analytics/ProjectionService');

async function rebuild(req, res) {
  try {
    const result = await service.rebuildDaily(req.body?.date || req.query?.date, {
      tenantId: req.tenantId,
      actor: req.user || {}
    });
    return res.json({ ok: true, success: true, result });
  } catch (error) {
    return res.status(error.status || 500).json({ ok: false, success: false, message: error.message || 'Không tạo được projection báo cáo' });
  }
}

async function list(req, res) {
  try {
    const items = await service.querySnapshots(req.query, { tenantId: req.tenantId });
    return res.json({ ok: true, success: true, items });
  } catch (error) {
    return res.status(500).json({ ok: false, success: false, message: error.message || 'Không tải được projection báo cáo' });
  }
}

module.exports = { rebuild, list };
