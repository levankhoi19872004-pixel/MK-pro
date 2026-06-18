'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('MobileSyncOperation', 'mobile_sync_operations', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  deviceId: { type: String, required: true },
  operationId: { type: String, required: true },
  operationType: { type: String, required: true },
  actorCode: { type: String, default: '' },
  clientCreatedAt: { type: String, default: '' },
  payloadHash: { type: String, required: true },
  status: { type: String, enum: ['processing', 'completed', 'failed', 'conflict'], default: 'processing' },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 8 },
  response: { type: Object, default: {} },
  error: { type: String, default: '' },
  createdAt: { type: String, required: true },
  completedAt: { type: String, default: '' },
  updatedAt: { type: String, required: true }
});
