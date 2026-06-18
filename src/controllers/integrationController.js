'use strict';

const service = require('../services/integrations/IntegrationService');

function context(req) {
  return { tenantId: req.tenantId, actor: req.user || {} };
}

function fail(res, error, fallback) {
  return res.status(error.status || 400).json({ ok: false, success: false, code: error.code, message: error.message || fallback });
}

async function list(req, res) {
  try {
    return res.json({ ok: true, success: true, items: await service.list(req.query, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không tải được hàng đợi tích hợp');
  }
}

async function enqueue(req, res) {
  try {
    return res.status(201).json({ ok: true, success: true, item: await service.enqueue(req.body, context(req)) });
  } catch (error) {
    return fail(res, error, 'Không tạo được tác vụ tích hợp');
  }
}

async function retry(req, res) {
  try {
    const item = await service.retry(req.params.id, context(req));
    if (!item) return res.status(404).json({ ok: false, success: false, message: 'Không tìm thấy tác vụ tích hợp' });
    return res.json({ ok: true, success: true, item });
  } catch (error) {
    return fail(res, error, 'Không retry được tác vụ tích hợp');
  }
}

module.exports = { list, enqueue, retry };
