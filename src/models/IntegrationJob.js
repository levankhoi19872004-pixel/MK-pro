'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('IntegrationJob', 'integration_jobs', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  provider: { type: String, required: true },
  eventType: { type: String, required: true },
  endpoint: { type: String, required: true },
  method: { type: String, enum: ['POST', 'PUT', 'PATCH'], default: 'POST' },
  headers: { type: Object, default: {} },
  payload: { type: Object, default: {} },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  attemptCount: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 8 },
  nextRetryAt: { type: String, required: true },
  responseStatus: { type: Number, default: 0 },
  responseBody: { type: String, default: '' },
  lastError: { type: String, default: '' },
  externalReference: { type: String, default: '' },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
  completedAt: { type: String, default: '' },
  workerId: { type: String, default: '' }
});
