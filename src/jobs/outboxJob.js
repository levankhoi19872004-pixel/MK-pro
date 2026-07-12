'use strict';

const OutboxService = require('../services/outbox/OutboxService');
const { getRuntimeConfig } = require('../config/app.config');

const handlers = new Map();
let timer = null;
let running = false;
const state = {
  enabled: false,
  started: false,
  running: false,
  intervalMs: 0,
  lastStartedAt: null,
  lastStoppedAt: null,
  lastRunAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastError: ''
};

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
  state.running = true;
  state.lastRunAt = new Date().toISOString();
  let count = 0;
  try {
    const limit = Math.max(1, Math.min(Number(options.limit || 50), 500));
    while (count < limit) {
      const result = await processOne(options);
      if (!result.eventId) break;
      count += 1;
    }
    state.lastSuccessAt = new Date().toISOString();
    state.lastError = '';
    return { processedCount: count };
  } catch (error) {
    state.lastFailureAt = new Date().toISOString();
    state.lastError = String(error?.message || error).slice(0, 500);
    throw error;
  } finally {
    running = false;
    state.running = false;
  }
}

function normalizeConfig(options) {
  if (options && typeof options === 'object') {
    return {
      enabled: Boolean(options.enabled),
      intervalMs: Math.max(5000, Number(options.intervalMs || 15000))
    };
  }
  const config = getRuntimeConfig().scheduler.outbox;
  return { enabled: config.enabled, intervalMs: config.intervalMs };
}

function startOutboxJob(options) {
  const config = normalizeConfig(options);
  state.enabled = config.enabled;
  state.intervalMs = config.intervalMs;
  if (!config.enabled) return { started: false, reason: 'JOB_DISABLED', intervalMs: config.intervalMs };
  if (timer) return { started: true, reason: 'ALREADY_STARTED', intervalMs: state.intervalMs };
  timer = setInterval(() => {
    drain().catch((error) => console.error('Outbox worker failed:', error));
  }, config.intervalMs);
  timer.unref?.();
  state.started = true;
  state.lastStartedAt = new Date().toISOString();
  state.lastStoppedAt = null;
  return { started: true, reason: 'STARTED', intervalMs: config.intervalMs };
}

function stopOutboxJob() {
  if (timer) clearInterval(timer);
  timer = null;
  state.enabled = false;
  state.started = false;
  state.running = false;
  state.lastStoppedAt = new Date().toISOString();
  return { stopped: true };
}

function getOutboxJobState() {
  return { ...state, handlerCount: handlers.size };
}

module.exports = {
  registerOutboxHandler,
  processOne,
  drain,
  startOutboxJob,
  stopOutboxJob,
  getOutboxJobState,
  _private: { normalizeConfig, handlers }
};
