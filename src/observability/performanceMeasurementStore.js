'use strict';

const crypto = require('crypto');
const os = require('os');

const SCHEMA_VERSION = 3;
const MAX_RECORDS = Math.max(100, Math.min(Number(process.env.PERF_MEASUREMENT_MAX_RECORDS || 5000), 50000));
const PROCESS_STARTED_AT = new Date().toISOString();
const INSTANCE_ID = String(process.env.RENDER_INSTANCE_ID || process.env.INSTANCE_ID || `${os.hostname()}-${process.pid}`).trim();
const WINDOW_STATES = Object.freeze({ IDLE: 'IDLE', OPEN: 'OPEN', CLOSING: 'CLOSING', CLOSED: 'CLOSED' });
const records = [];
const windows = new Map();
let activeWindow = null;

const FLAG_NAMES = Object.freeze([
  'PERF_BULK_BATCH_CONTEXT_V1','PERF_BULK_CONCURRENCY','PERF_BULK_TRANSIENT_RETRY_LIMIT',
  'PERF_DELIVERY_CANONICAL_FILTER_V1','PERF_SUGGESTIONS_SEARCH_V1','PERF_DASHBOARD_CACHE_V2',
  'PERF_DASHBOARD_READ_MODEL_V2','PERF_REPORT_DB_PAGINATION_V1','PERF_REPORT_CENTER_SNAPSHOT_V1'
]);

function parseBoolean(value, fallback = true) {
  if (value == null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}
function telemetryEnabled(env = process.env) { return parseBoolean(env.PERF_TELEMETRY_ENABLED, true); }
function stableReleaseMetadata(env = process.env) {
  return Object.freeze({
    releaseId: String(env.RELEASE_ID || env.RENDER_GIT_COMMIT || env.RELEASE_SHA || 'unknown').trim(),
    releaseSha: String(env.RELEASE_SHA || env.RENDER_GIT_COMMIT || 'unknown').trim(),
    sourceSha: String(env.SOURCE_SHA || env.RELEASE_SHA || env.RENDER_GIT_COMMIT || 'unknown').trim()
  });
}
function releaseMetadataValid(metadata = {}) {
  return ['releaseId', 'releaseSha', 'sourceSha'].every((key) => {
    const value = String(metadata[key] || '').trim().toLowerCase();
    return value && value !== 'unknown' && value !== 'undefined' && value !== 'null';
  });
}
function snapshotFlags(env = process.env) {
  const out = {};
  for (const name of FLAG_NAMES) out[name] = String(env[name] ?? (name === 'PERF_BULK_CONCURRENCY' || name === 'PERF_BULK_TRANSIENT_RETRY_LIMIT' ? '1' : '0'));
  return Object.freeze(out);
}
function hashScope(value) {
  const text = String(value || '').trim();
  return text ? crypto.createHash('sha256').update(text).digest('hex').slice(0, 16) : '';
}
function windowView(window) { return window ? { ...window, release: { ...window.release }, featureFlags: { ...window.featureFlags } } : { state: WINDOW_STATES.IDLE }; }
function startWindow(label = 'manual', options = {}) {
  if (activeWindow && [WINDOW_STATES.OPEN, WINDOW_STATES.CLOSING].includes(activeWindow.state) && options.force !== true) {
    const error = new Error('Đã có sample window đang hoạt động'); error.code = 'PERF_SAMPLE_WINDOW_ALREADY_ACTIVE'; throw error;
  }
  const release = stableReleaseMetadata(options.env || process.env);
  const productionMode = options.productionMode ?? String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (productionMode && !releaseMetadataValid(release) && options.allowUnknown !== true) {
    const error = new Error('Không thể mở production telemetry window khi release metadata chưa hợp lệ');
    error.code = 'PERF_RELEASE_METADATA_REQUIRED'; throw error;
  }
  const openedAt = new Date().toISOString();
  activeWindow = {
    id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`, label: String(label || 'manual'),
    state: WINDOW_STATES.OPEN, openedAt, startedAt: openedAt, closingAt: null, closedAt: null,
    inFlight: 0, inFlightAtClose: 0, release, featureFlags: snapshotFlags(options.env || process.env)
  };
  windows.set(activeWindow.id, activeWindow);
  return windowView(activeWindow);
}
function closeWindow() {
  if (!activeWindow) return { state: WINDOW_STATES.IDLE };
  if (activeWindow.state === WINDOW_STATES.CLOSED) return windowView(activeWindow);
  activeWindow.state = WINDOW_STATES.CLOSING;
  activeWindow.closingAt = new Date().toISOString();
  activeWindow.inFlightAtClose = activeWindow.inFlight;
  const closing = activeWindow;
  activeWindow = null; // atomically stop admitting new requests
  if (closing.inFlight === 0) { closing.state = WINDOW_STATES.CLOSED; closing.closedAt = new Date().toISOString(); }
  return windowView(closing);
}
function getWindow() { return windowView(activeWindow); }
function finalizeWindowIfDrained(window) {
  if (window && window.state === WINDOW_STATES.CLOSING && window.inFlight === 0) {
    window.state = WINDOW_STATES.CLOSED; window.closedAt = new Date().toISOString();
  }
}
function beginMeasurement(input = {}) {
  if (!telemetryEnabled()) return null;
  const window = activeWindow && activeWindow.state === WINDOW_STATES.OPEN ? activeWindow : null;
  if (!window) return null;
  window.inFlight += 1;
  return Object.freeze({
    schemaVersion: SCHEMA_VERSION, ...window.release, instanceId: INSTANCE_ID, processId: process.pid,
    sampleWindowId: window.id, sampleWindowLabel: window.label, sampleWindowOpenedAt: window.openedAt,
    startedAt: new Date().toISOString(), endpoint: String(input.endpoint || ''), httpMethod: String(input.httpMethod || ''),
    operationName: String(input.operationName || ''), operationMode: String(input.operationMode || 'unknown'),
    featureFlags: Object.freeze({ ...window.featureFlags }), inputSize: Number(input.inputSize || 0), orderCount: Number(input.orderCount || 0),
    cacheSource: String(input.cacheSource || 'unknown'), readModelSource: String(input.readModelSource || 'unknown'),
    reportMode: String(input.reportMode || 'unknown'), scopeHash: hashScope(input.scopeIdentity)
  });
}
function completeMeasurement(start, output = {}) {
  if (!start || !telemetryEnabled()) return null;
  const window = windows.get(start.sampleWindowId);
  if (!window) return null;
  const completedAt = new Date().toISOString();
  const durationMs = Number(output.durationMs ?? (Date.parse(completedAt) - Date.parse(start.startedAt)));
  const record = Object.freeze({ ...start, completedAt, durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    mongoDurationMs: Number(output.mongoDurationMs || 0), jsDurationMs: Number(output.jsDurationMs || 0), queryCount: Number(output.queryCount || 0),
    slowestQueryFingerprint: String(output.slowestQueryFingerprint || ''), rowsReturned: Number(output.rowsReturned || 0), statusCode: Number(output.statusCode || 0),
    errorCategory: String(output.errorCategory || ''), correctnessCheck: String(output.correctnessCheck || 'not_applicable'),
    debtDeviation: output.debtDeviation == null ? null : Number(output.debtDeviation), duplicateLedgerDetected: output.duplicateLedgerDetected == null ? null : Boolean(output.duplicateLedgerDetected),
    cacheSource: String(output.cacheSource || start.cacheSource || 'unknown'), readModelSource: String(output.readModelSource || start.readModelSource || 'unknown'),
    reportMode: String(output.reportMode || start.reportMode || 'unknown') });
  records.push(record); if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  window.inFlight = Math.max(0, window.inFlight - 1); finalizeWindowIfDrained(window); return record;
}
function percentile(values, p) { if (!values.length) return 0; const s=[...values].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.max(0, Math.ceil(s.length*p)-1))]; }
function groupKey(r) { return JSON.stringify([r.releaseSha,r.sampleWindowId,r.endpoint,r.httpMethod,r.operationMode,r.cacheSource,r.readModelSource,r.reportMode,r.featureFlags]); }
function exportWindow(windowId = activeWindow?.id) {
  if (!telemetryEnabled()) return { schemaVersion: SCHEMA_VERSION, telemetryEnabled: false, sampleCount: 0, groups: [], records: [] };
  const selected = records.filter((r) => r.sampleWindowId === windowId); const groups = new Map();
  for (const r of selected) { const key=groupKey(r); if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(r); }
  const window = windows.get(windowId);
  return { schemaVersion: SCHEMA_VERSION, telemetryEnabled: true, generatedAt: new Date().toISOString(), release: window?.release || stableReleaseMetadata(), instanceId: INSTANCE_ID,
    window: windowView(window), sampleCount: selected.length, groups: [...groups.values()].map((rows) => { const durations=rows.map(r=>r.durationMs); const first=rows[0]; return {
      releaseSha:first.releaseSha, sampleWindowId:first.sampleWindowId, endpoint:first.endpoint, httpMethod:first.httpMethod, operationMode:first.operationMode,
      cacheSource:first.cacheSource, readModelSource:first.readModelSource, reportMode:first.reportMode, featureFlags:first.featureFlags,
      sampleCount:rows.length, p50Ms:percentile(durations,.5), p95Ms:percentile(durations,.95), p99Ms:percentile(durations,.99), maxMs:Math.max(...durations),
      errorRate:rows.filter(r=>r.statusCode>=500||r.errorCategory).length/rows.length, queryCountAvg:rows.reduce((s,r)=>s+r.queryCount,0)/rows.length }; }), records:selected };
}
function resetForTest() { records.splice(0, records.length); windows.clear(); activeWindow=null; }

module.exports = { SCHEMA_VERSION, FLAG_NAMES, INSTANCE_ID, WINDOW_STATES, parseBoolean, telemetryEnabled, stableReleaseMetadata, releaseMetadataValid,
  snapshotFlags, startWindow, closeWindow, getWindow, beginMeasurement, completeMeasurement, exportWindow, hashScope,
  _testing:{records,windows,resetForTest,get activeWindow(){return activeWindow;}} };
