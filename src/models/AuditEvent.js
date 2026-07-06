'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('AuditEvent', 'auditEvents', {
  id: String,
  idempotencyKey: String,
  eventType: String,
  module: String,
  entityType: String,
  entityId: String,
  entityCode: String,
  severity: String,
  actorUserId: String,
  actorCode: String,
  actorName: String,
  actorRole: String,
  before: Object,
  after: Object,
  diff: Object,
  metadata: Object,
  source: Object,
  occurredAt: Date,
  createdAt: Date
});
