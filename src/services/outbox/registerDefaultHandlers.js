'use strict';

const { registerOutboxHandler } = require('../../jobs/outboxJob');
const IntegrationService = require('../integrations/IntegrationService');
const { FLAGS } = require('../../config/featureFlags');

let registered = false;

function registerDefaultOutboxHandlers() {
  if (registered) return;
  registered = true;

  registerOutboxHandler('*', async (event) => {
    const endpoint = String(process.env.OUTBOX_WEBHOOK_ENDPOINT || '').trim();
    if (!endpoint || !FLAGS.integrations()) {
      return { delivered: false, reason: 'NO_INTEGRATION_TARGET' };
    }
    const job = await IntegrationService.enqueue({
      provider: process.env.OUTBOX_WEBHOOK_PROVIDER || 'webhook',
      endpoint,
      eventType: event.eventType,
      payload: {
        eventId: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        occurredAt: event.createdAt,
        data: event.payload
      },
      headers: {
        'x-signature': String(process.env.OUTBOX_WEBHOOK_SIGNATURE || '')
      },
      externalReference: event.id
    }, { tenantId: event.tenantId });
    return { delivered: false, queuedIntegrationJobId: job.id };
  });
}

module.exports = { registerDefaultOutboxHandlers };
