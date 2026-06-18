'use strict';

const service = require('../services/EnterpriseStatusService');
const outboxJob = require('../jobs/outboxJob');
const integrationJob = require('../jobs/integrationJob');

async function status(req, res) {
  try {
    return res.json({ ok: true, success: true, ...(await service.status({ tenantId: req.tenantId })) });
  } catch (error) {
    return res.status(500).json({ ok: false, success: false, message: error.message || 'Không đọc được trạng thái hệ thống' });
  }
}

async function readiness(req, res) {
  try {
    const result = await service.readiness({ tenantId: req.tenantId });
    return res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    return res.status(503).json({ ok: false, message: error.message || 'Hệ thống chưa sẵn sàng' });
  }
}

async function drainOutbox(req, res) {
  try {
    return res.json({ ok: true, success: true, result: await outboxJob.drain({ limit: req.body?.limit || 100 }) });
  } catch (error) {
    return res.status(500).json({ ok: false, success: false, message: error.message || 'Không xử lý được outbox' });
  }
}

async function drainIntegrations(req, res) {
  try {
    return res.json({ ok: true, success: true, result: await integrationJob.drain(req.body?.limit || 20) });
  } catch (error) {
    return res.status(500).json({ ok: false, success: false, message: error.message || 'Không xử lý được integration queue' });
  }
}

module.exports = { status, readiness, drainOutbox, drainIntegrations };
