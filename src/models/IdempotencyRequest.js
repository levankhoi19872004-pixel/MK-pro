'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('IdempotencyRequest', 'idempotency_requests', {
  tenantId: String,
  key: String,
  commandName: String,
  scope: String,
  actorCode: String,
  requestKey: String,
  status: String,
  response: Object,
  createdAt: Date,
  updatedAt: Date,
  completedAt: Date,
  expiresAt: Date
});
