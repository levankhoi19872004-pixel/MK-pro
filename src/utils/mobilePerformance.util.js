'use strict';

const DEFAULT_TTL_MS = Number(process.env.MOBILE_IDEMPOTENCY_TTL_MS || 10 * 60 * 1000);
const MAX_KEYS = Number(process.env.MOBILE_IDEMPOTENCY_MAX_KEYS || 5000);
const idempotencyStore = new Map();

function now() { return Date.now(); }

function normalizeIdempotencyKey(value) {
  return String(value || '').trim().slice(0, 160);
}

function getIdempotencyKey(body = {}, fallbackParts = []) {
  const explicit = normalizeIdempotencyKey(body.idempotencyKey || body.requestId || body.clientRequestId);
  if (explicit) return explicit;
  return fallbackParts.map((part) => String(part || '').trim()).filter(Boolean).join(':').slice(0, 160);
}

function cleanupIdempotencyStore(ts = now()) {
  for (const [key, row] of idempotencyStore.entries()) {
    if (!row || row.expiresAt <= ts) idempotencyStore.delete(key);
  }
  if (idempotencyStore.size <= MAX_KEYS) return;
  const overflow = idempotencyStore.size - MAX_KEYS;
  let removed = 0;
  for (const key of idempotencyStore.keys()) {
    idempotencyStore.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function readIdempotentResult(key) {
  const safeKey = normalizeIdempotencyKey(key);
  if (!safeKey) return null;
  cleanupIdempotencyStore();
  const row = idempotencyStore.get(safeKey);
  if (!row) return null;
  return row.result || null;
}

function rememberIdempotentResult(key, result, ttlMs = DEFAULT_TTL_MS) {
  const safeKey = normalizeIdempotencyKey(key);
  if (!safeKey || !result) return result;
  cleanupIdempotencyStore();
  idempotencyStore.set(safeKey, { result, expiresAt: now() + ttlMs });
  return result;
}

function createStepTimer(scope, logger = console) {
  const startedAt = now();
  let lastAt = startedAt;
  const enabled = process.env.MOBILE_PERF_LOG !== '0';
  return function mark(step, extra = {}) {
    if (!enabled) return;
    const current = now();
    const payload = {
      scope,
      step,
      stepMs: current - lastAt,
      totalMs: current - startedAt,
      ...extra
    };
    lastAt = current;
    const message = `[MOBILE_PERF] ${scope}.${step} step=${payload.stepMs}ms total=${payload.totalMs}ms`;
    if (logger && typeof logger.info === 'function') logger.info(payload, message);
    else console.log(message, payload);
  };
}

module.exports = {
  getIdempotencyKey,
  readIdempotentResult,
  rememberIdempotentResult,
  createStepTimer
};
