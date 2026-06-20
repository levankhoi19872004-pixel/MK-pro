'use strict';

const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

function normalizeRequestId(value) {
  const text = String(value || '').trim();
  return REQUEST_ID_PATTERN.test(text) ? text : '';
}

function generateRequestId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex');
}

function requestContextMiddleware(req, res, next) {
  const requestId = normalizeRequestId(req.get?.('X-Request-Id') || req.headers?.['x-request-id']) || generateRequestId();
  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const context = {
    requestId,
    method: req.method,
    route: String(req.originalUrl || req.url || '').split('?')[0],
    startedAt: Date.now()
  };
  storage.run(context, next);
}

function getRequestContext() {
  return storage.getStore() || null;
}

function runWithRequestContext(context, callback) {
  const safe = {
    ...context,
    requestId: normalizeRequestId(context?.requestId) || generateRequestId()
  };
  return storage.run(safe, callback);
}

module.exports = {
  REQUEST_ID_PATTERN,
  normalizeRequestId,
  generateRequestId,
  requestContextMiddleware,
  getRequestContext,
  runWithRequestContext
};
