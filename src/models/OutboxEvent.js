'use strict';

const strictModel = require('./_strictModel');

module.exports = strictModel('OutboxEvent', 'outbox_events', {
  id: { type: String, required: true },
  tenantId: { type: String, required: true },
  aggregateType: { type: String, required: true },
  aggregateId: { type: String, required: true },
  eventType: { type: String, required: true },
  payload: { type: Object, default: {} },
  headers: { type: Object, default: {} },
  status: { type: String, enum: ['pending', 'processing', 'processed', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 10 },
  availableAt: { type: String, required: true },
  lockedAt: { type: String, default: '' },
  lockedBy: { type: String, default: '' },
  processedAt: { type: String, default: '' },
  lastError: { type: String, default: '' },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true }
});
