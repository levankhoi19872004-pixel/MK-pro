'use strict';

const OutboxService = require('../services/outbox/OutboxService');

const handlers = new Map();
let timer = null;
let running = false;

function registerOutboxHandler(eventType, handler) {
  if (!eventType || typeof handler !== 'function') throw new Error('Outbox handler không hợp lệ');
  handlers.set(String(eventType), handler);
}

async function processOne(options = {}) {
  const event = await OutboxService.claimNext(options);
  if (!event) return { processed: false };

  const handler = handlers.get(event.eventType) || handlers.get('*');
  if (!handler) {
    await OutboxService.markFailed(event, new Error(`Không có handler cho ${event.eventType}`));
    return { processed: false, eventId: event.id, missingHandler: true };
  }

  try {
    const result = await handler(event);
    await OutboxService.markProcessed(event.id, result || {});
    return { processed: true, eventId: event.id };
  } catch (error) {
    await OutboxService.markFailed(event, error);
    return { processed: false, eventId: event.id, error };
  }
}

async function drain(options = {}) {
  if (running) return { skipped: true, reason: 'ALREADY_RUNNING' };
  running = true;
  let count = 0;
  try {
    const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
    while (count < limit) {
      const result = await processOne(options);
      if (!result.eventId) break;
      count += 1;
    }
    return { processedCount: count };
  } finally {
    running = false;
  }
}

function startOutboxJob() {
  if (process.env.ENABLE_OUTBOX_WORKER !== 'true' || timer) return { started: false };
  const intervalMs = Math.max(5000, Number(process.env.OUTBOX_POLL_INTERVAL_MS || 15000));
  timer = setInterval(() => {
    drain().catch((error) => console.error('Outbox worker failed:', error));
  }, intervalMs);
  timer.unref?.();
  return { started: true, intervalMs };
}

function stopOutboxJob() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  registerOutboxHandler,
  processOne,
  drain,
  startOutboxJob,
  stopOutboxJob
};
