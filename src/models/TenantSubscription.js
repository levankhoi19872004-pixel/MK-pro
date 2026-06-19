'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('TenantSubscription', 'tenant_subscriptions', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  planCode: { type: String, required: true },
  status: { type: String, enum: ['trial', 'active', 'past_due', 'suspended', 'cancelled'], default: 'trial' },
  userLimit: { type: Number, default: 20 },
  storageLimitMb: { type: Number, default: 10240 },
  featureLimits: { type: Object, default: {} },
  startsAt: { type: String, required: true },
  expiresAt: { type: String, default: '' },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true }
});
