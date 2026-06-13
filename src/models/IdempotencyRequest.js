'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('IdempotencyRequest', 'idempotency_requests', {
  key: String,
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
