'use strict';

/**
 * Read-only production audit for client-side mobile latency/error batches.
 * Set MOBILE_TELEMETRY_AUDIT_DB=1 and MONGO_URI to read mobile_logs.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const MobileLog = require('../src/models/MobileLog');

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function percentile(values = [], ratio = 0.5) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] || 0);
}

function summarizeEvents(events = []) {
  const groups = new Map();
  for (const row of events) {
    const path = String(row.path || '').split('?')[0];
    if (!path.startsWith('/api/')) continue;
    const group = groups.get(path) || { path, clientMs: [], serverMs: [], total: 0, errors: 0, timeouts: 0, aborted: 0 };
    group.total += 1;
    group.clientMs.push(number(row.clientMs));
    group.serverMs.push(number(row.serverMs));
    if (number(row.status) >= 400 || row.errorCode) group.errors += 1;
    if (row.errorCode === 'REQUEST_TIMEOUT') group.timeouts += 1;
    if (row.errorCode === 'REQUEST_ABORTED') group.aborted += 1;
    groups.set(path, group);
  }

  return Array.from(groups.values()).map((group) => ({
    path: group.path,
    count: group.total,
    p50ClientMs: percentile(group.clientMs, 0.5),
    p95ClientMs: percentile(group.clientMs, 0.95),
    p99ClientMs: percentile(group.clientMs, 0.99),
    p50ServerMs: percentile(group.serverMs, 0.5),
    p95ServerMs: percentile(group.serverMs, 0.95),
    maxClientMs: Math.max(0, ...group.clientMs),
    errorRate: Number((group.errors / Math.max(1, group.total)).toFixed(4)),
    timeouts: group.timeouts,
    aborted: group.aborted
  })).sort((a, b) => b.p95ClientMs - a.p95ClientMs);
}

function evaluateThresholds(rows = [], env = process.env) {
  const p95Limit = Math.max(100, number(env.MOBILE_TELEMETRY_MAX_P95_MS, 3000));
  const errorRateLimit = Math.min(1, Math.max(0, number(env.MOBILE_TELEMETRY_MAX_ERROR_RATE, 0.01)));
  const minSamples = Math.max(1, number(env.MOBILE_TELEMETRY_MIN_SAMPLES, 20));
  const violations = [];
  for (const row of rows) {
    if (row.count < minSamples) continue;
    if (row.p95ClientMs > p95Limit) violations.push({ path: row.path, code: 'P95_CLIENT_MS', value: row.p95ClientMs, limit: p95Limit });
    if (row.errorRate > errorRateLimit) violations.push({ path: row.path, code: 'ERROR_RATE', value: row.errorRate, limit: errorRateLimit });
  }
  return { p95Limit, errorRateLimit, minSamples, violations };
}

async function main() {
  if (process.env.MOBILE_TELEMETRY_AUDIT_DB !== '1') {
    console.log(JSON.stringify({
      mode: 'read-only',
      connected: false,
      message: 'Set MOBILE_TELEMETRY_AUDIT_DB=1 and MONGO_URI to analyze mobile_client_perf_batch logs.'
    }, null, 2));
    return;
  }
  if (!process.env.MONGO_URI) throw new Error('Thiếu MONGO_URI cho MOBILE_TELEMETRY_AUDIT_DB=1');

  const hours = Math.max(1, Math.min(number(process.env.MOBILE_TELEMETRY_AUDIT_HOURS, 24), 24 * 30));
  const limit = Math.max(1, Math.min(number(process.env.MOBILE_TELEMETRY_AUDIT_LIMIT, 5000), 20000));
  const from = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  await connectDB();
  const logs = await MobileLog.find({
    action: 'mobile_client_perf_batch',
    createdAt: { $gte: from }
  }).select('detail createdAt').sort({ createdAt: -1 }).limit(limit).lean();

  const events = logs.flatMap((row) => Array.isArray(row.detail?.events) ? row.detail.events : []);
  const rows = summarizeEvents(events);
  const audit = evaluateThresholds(rows);
  const output = {
    mode: 'mongo-read-only',
    from,
    hours,
    batches: logs.length,
    events: events.length,
    rows,
    audit
  };
  console.log(JSON.stringify(output, null, 2));
  if (process.env.MOBILE_TELEMETRY_AUDIT_ENFORCE === '1' && audit.violations.length) {
    throw new Error(`Mobile telemetry audit có ${audit.violations.length} vi phạm`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[mobile-client-telemetry-audit]', error.message);
    process.exitCode = 1;
  }).finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
}

module.exports = { percentile, summarizeEvents, evaluateThresholds };
