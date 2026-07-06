'use strict';

const auditEventService = require('./auditEventService');
const notificationService = require('./notificationService');

async function emitDomainEvent(event = {}, options = {}) {
  const auditEvent = await auditEventService.record(event, options);
  const notifications = await notificationService.createForAuditEvent(auditEvent, options);
  return { auditEvent, notifications };
}

async function emitDomainEventSafe(event = {}, options = {}) {
  try {
    return await emitDomainEvent(event, options);
  } catch (err) {
    console.error('[DOMAIN_EVENT_EMIT_ERROR]', {
      eventType: event?.eventType,
      entityType: event?.entityType,
      entityId: event?.entityId,
      entityCode: event?.entityCode,
      error: err && (err.stack || err.message || err)
    });
    return { auditEvent: null, notifications: [], error: err };
  }
}

function eventContextFromRequest(req = {}) {
  return {
    actor: auditEventService.normalizeActor(req.user || {}),
    source: auditEventService.sourceFromRequest(req)
  };
}

module.exports = {
  emitDomainEvent,
  emitDomainEventSafe,
  eventContextFromRequest
};
