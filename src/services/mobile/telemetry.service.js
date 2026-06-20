'use strict';

const { getMobileRuntimeConfig } = require('./runtimeConfig.service');

const ALLOWED_ERROR_CODES = new Set([
  '', 'REQUEST_TIMEOUT', 'REQUEST_ABORTED', 'TypeError', 'AbortError', 'ERROR'
]);

function text(value, max = 160) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function finiteNumber(value, fallback = 0, min = 0, max = 600000) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sanitizePath(value) {
  const raw = text(value, 300).split('?')[0].split('#')[0];
  if (!raw.startsWith('/api/')) return '';
  return raw.replace(/\/[0-9a-f]{20,}|\/(SO|HU|MO|RO)[0-9][A-Za-z0-9_-]*/gi, '/:id');
}

function sanitizeTelemetryEvent(row = {}) {
  const path = sanitizePath(row.path);
  if (!path) return null;
  const status = Math.round(finiteNumber(row.status, 0, 0, 599));
  const rawErrorCode = text(row.errorCode, 80);
  const errorCode = ALLOWED_ERROR_CODES.has(rawErrorCode) ? rawErrorCode : (rawErrorCode ? 'ERROR' : '');
  return {
    at: text(row.at, 40),
    path,
    clientMs: Math.round(finiteNumber(row.clientMs)),
    serverMs: Math.round(finiteNumber(row.serverMs)),
    status,
    errorCode,
    requestId: text(row.requestId, 120)
  };
}

function summarizeEvents(events = []) {
  return {
    total: events.length,
    errors: events.filter((row) => row.status >= 400 || row.errorCode).length,
    timeouts: events.filter((row) => row.errorCode === 'REQUEST_TIMEOUT').length,
    aborted: events.filter((row) => row.errorCode === 'REQUEST_ABORTED').length,
    maxClientMs: events.reduce((max, row) => Math.max(max, row.clientMs || 0), 0),
    maxServerMs: events.reduce((max, row) => Math.max(max, row.serverMs || 0), 0)
  };
}

async function recordClientTelemetry(input = {}, context = {}) {
  const config = getMobileRuntimeConfig();
  if (!config.clientTelemetryEnabled) {
    return { accepted: 0, disabled: true };
  }

  const events = (Array.isArray(input.events) ? input.events : [])
    .slice(0, 50)
    .map(sanitizeTelemetryEvent)
    .filter(Boolean);
  if (!events.length) return { accepted: 0, ignored: true };

  const detail = {
    schemaVersion: 1,
    appVersion: text(input.appVersion, 80),
    deviceId: text(input.deviceId, 120),
    networkType: text(input.networkType, 40),
    effectiveType: text(input.effectiveType, 40),
    events,
    summary: summarizeEvents(events)
  };

  if (typeof context.writeMobileLogDirect === 'function') {
    await context.writeMobileLogDirect(
      context.actor || {},
      'mobile_client_perf_batch',
      { detail },
      {}
    );
  }

  return { accepted: events.length, summary: detail.summary };
}

module.exports = {
  sanitizePath,
  sanitizeTelemetryEvent,
  summarizeEvents,
  recordClientTelemetry
};
