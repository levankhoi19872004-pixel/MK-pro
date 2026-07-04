'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('ReadModelSyncJob', 'readModelSyncJobs', {
  id: String,
  type: String,
  source: String,
  sourceIds: Array,
  customerCode: String,
  status: String,
  attempts: Number,
  lastError: Object,
  idempotencyKey: String,
  createdAt: String,
  updatedAt: String,
  nextRunAt: String,
  processedAt: String,
  lockedAt: String,
  lockedBy: String,
  actor: String,
  reason: String,
  metadata: Object
});
