'use strict';

const Tenant = require('../../models/Tenant');
const TenantSubscription = require('../../models/TenantSubscription');
const dateUtil = require('../../utils/date.util');
const { makeId } = require('../../utils/common.util');
const { normalizeTenantId } = require('../../utils/tenant.util');

function text(value) {
  return String(value || '').trim();
}

async function createTenant(input = {}, actor = {}) {
  const code = normalizeTenantId(input.code || input.id);
  if (!code || !text(input.name)) throw Object.assign(new Error('Thiếu mã hoặc tên doanh nghiệp'), { status: 400 });
  const existed = await Tenant.findOne({ $or: [{ id: code }, { code }] }).lean();
  if (existed) throw Object.assign(new Error('Mã doanh nghiệp đã tồn tại'), { status: 409 });
  const now = dateUtil.nowIso();
  const tenant = {
    id: code,
    code,
    name: text(input.name),
    status: 'active',
    settings: input.settings || {},
    branding: input.branding || {},
    createdAt: now,
    createdBy: text(actor.username || actor.name || 'admin'),
    updatedAt: now
  };
  const created = await Tenant.create([tenant]);
  const subscription = {
    id: makeId('SUB'),
    tenantId: code,
    planCode: text(input.planCode || 'trial'),
    status: 'trial',
    userLimit: Math.max(1, Number(input.userLimit || 20)),
    storageLimitMb: Math.max(100, Number(input.storageLimitMb || 10240)),
    featureLimits: input.featureLimits || {},
    startsAt: now,
    expiresAt: input.expiresAt || new Date(Date.now() + 30 * 86400000).toISOString(),
    createdAt: now,
    updatedAt: now
  };
  await TenantSubscription.create([subscription]);
  return { tenant: created[0].toObject(), subscription };
}

async function listTenants() {
  return Tenant.find({}).sort({ createdAt: -1 }).lean();
}

async function updateSubscription(tenantId, input = {}) {
  const now = dateUtil.nowIso();
  return TenantSubscription.findOneAndUpdate({ tenantId: normalizeTenantId(tenantId) }, {
    $set: {
      planCode: text(input.planCode || 'standard'),
      status: text(input.status || 'active'),
      userLimit: Math.max(1, Number(input.userLimit || 20)),
      storageLimitMb: Math.max(100, Number(input.storageLimitMb || 10240)),
      featureLimits: input.featureLimits || {},
      expiresAt: input.expiresAt || '',
      updatedAt: now
    },
    $setOnInsert: {
      id: makeId('SUB'),
      tenantId: normalizeTenantId(tenantId),
      startsAt: now,
      createdAt: now
    }
  }, { upsert: true, new: true }).lean();
}

module.exports = { createTenant, listTenants, updateSubscription };
