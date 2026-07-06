'use strict';

const flexModel = require('./_flexModel');

module.exports = flexModel('Notification', 'notifications', {
  id: String,
  auditEventId: String,
  idempotencyKey: String,
  title: String,
  message: String,
  eventType: String,
  module: String,
  severity: String,
  entityType: String,
  entityId: String,
  entityCode: String,
  recipientUserId: String,
  recipientRole: String,
  readAt: Date,
  dismissedAt: Date,
  actionUrl: String,
  actionLabel: String,
  actorName: String,
  actorCode: String,
  metadata: Object,
  createdAt: Date
});
