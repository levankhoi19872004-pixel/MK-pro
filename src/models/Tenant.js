'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('Tenant', 'tenants', {
  id: { type: String, required: true },
  code: { type: String, required: true },
  name: { type: String, required: true },
  status: { type: String, enum: ['active', 'suspended', 'closed'], default: 'active' },
  settings: { type: Object, default: {} },
  branding: { type: Object, default: {} },
  createdAt: { type: String, required: true },
  createdBy: { type: String, default: '' },
  updatedAt: { type: String, required: true }
});
