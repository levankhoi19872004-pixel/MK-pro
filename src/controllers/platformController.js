'use strict';

const service = require('../services/platform/PlatformService');

function fail(res, error, fallback) {
  return res.status(error.status || 400).json({ ok: false, success: false, code: error.code, message: error.message || fallback });
}

async function listTenants(req, res) {
  try {
    return res.json({ ok: true, success: true, items: await service.listTenants() });
  } catch (error) {
    return fail(res, error, 'Không tải được danh sách doanh nghiệp');
  }
}

async function createTenant(req, res) {
  try {
    return res.status(201).json({ ok: true, success: true, ...(await service.createTenant(req.body, req.user || {})) });
  } catch (error) {
    return fail(res, error, 'Không tạo được doanh nghiệp');
  }
}

async function updateSubscription(req, res) {
  try {
    const subscription = await service.updateSubscription(req.params.tenantId, req.body);
    return res.json({ ok: true, success: true, subscription });
  } catch (error) {
    return fail(res, error, 'Không cập nhật được gói sử dụng');
  }
}

module.exports = { listTenants, createTenant, updateSubscription };
