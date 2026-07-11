'use strict';

const os = require('os');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { evaluateCapacity } = require('./capacityEvaluator');

const DEFAULTS = Object.freeze({
  enabled: true,
  sampleIntervalMs: 30000,
  logIntervalMs: 60000,
  memoryLimitMb: 0,
  heapWarnRatio: 0.85,
  eventLoopWarnMs: 75,
  eventLoopCriticalMs: 250,
  p95WarnMs: 1500,
  errorRateWarn: 0.05,
  activeRequestWarn: 25,
  maxSamples: 120,
  rollingBucketMs: 5000,
  rollingBucketCount: 60,
  minApiSamples: 20,
  minErrorSamples: 20
});

let histogram = null;
let sampleTimer = null;
let runtimeLogger = null;
let started = false;
let lastCpuUsage = process.cpuUsage();
let lastSampleAt = performance.now();
let lastMemory = null;
let lastSample = null;
let sampleSequence = 0;
let nextLogAtMs = 0;

const sampleListeners = new Set();

const samples = [];
const requestBuckets = Array.from({ length: DEFAULTS.rollingBucketCount }, () => ({
  bucketStart: 0,
  requests: 0,
  errors: 0,
  aborted: 0,
  status2xx: 0,
  status3xx: 0,
  status4xx: 0,
  status5xx: 0,
  responseBytes: 0
}));
const counters = {
  activeRequests: 0,
  maxActiveRequests: 0,
  completedRequests: 0,
  failedRequests: 0,
  abortedRequests: 0,
  status2xx: 0,
  status3xx: 0,
  status4xx: 0,
  status5xx: 0,
  responseBytesKnown: 0,
  responseBytesTotal: 0,
  maxResponseBytes: 0
};

const highWater = {
  rssBytes: { value: 0, at: null },
  heapUsedBytes: { value: 0, at: null },
  heapTotalBytes: { value: 0, at: null },
  externalBytes: { value: 0, at: null },
  arrayBuffersBytes: { value: 0, at: null },
  activeRequests: { value: 0, at: null },
  eventLoopP99Ms: { value: 0, at: null }
};

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readBoolean(name, fallback) {
  const value = String(process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return !['0', 'false', 'no', 'off'].includes(value);
}

function readConfig() {
  return {
    enabled: readBoolean('PERF_TELEMETRY_ENABLED', DEFAULTS.enabled),
    sampleIntervalMs: clamp(toNumber(process.env.PERF_SAMPLE_INTERVAL_MS, DEFAULTS.sampleIntervalMs), 5000, 300000),
    logIntervalMs: clamp(toNumber(process.env.PERF_LOG_INTERVAL_MS, DEFAULTS.logIntervalMs), 30000, 1800000),
    memoryLimitMb: clamp(toNumber(process.env.PERF_MEMORY_LIMIT_MB, DEFAULTS.memoryLimitMb), 0, 1048576),
    heapWarnRatio: clamp(toNumber(process.env.PERF_HEAP_WARN_RATIO, DEFAULTS.heapWarnRatio), 0.1, 0.99),
    eventLoopWarnMs: clamp(toNumber(process.env.PERF_EVENT_LOOP_WARN_MS, DEFAULTS.eventLoopWarnMs), 10, 10000),
    eventLoopCriticalMs: clamp(toNumber(process.env.PERF_EVENT_LOOP_CRITICAL_MS, DEFAULTS.eventLoopCriticalMs), 20, 30000),
    p95WarnMs: clamp(toNumber(process.env.PERF_P95_WARN_MS, DEFAULTS.p95WarnMs), 50, 120000),
    errorRateWarn: clamp(toNumber(process.env.PERF_ERROR_RATE_WARN, DEFAULTS.errorRateWarn), 0, 1),
    activeRequestWarn: clamp(toNumber(process.env.PERF_ACTIVE_REQUEST_WARN, DEFAULTS.activeRequestWarn), 1, 10000),
    maxSamples: clamp(toNumber(process.env.PERF_MAX_SAMPLES, DEFAULTS.maxSamples), 10, 2000),
    rollingBucketMs: clamp(toNumber(process.env.PERF_ROLLING_BUCKET_MS, DEFAULTS.rollingBucketMs), 1000, 60000),
    rollingBucketCount: clamp(toNumber(process.env.PERF_ROLLING_BUCKET_COUNT, DEFAULTS.rollingBucketCount), 12, 360),
    minApiSamples: clamp(toNumber(process.env.PERF_MIN_API_SAMPLES, DEFAULTS.minApiSamples), 1, 10000),
    minErrorSamples: clamp(toNumber(process.env.PERF_MIN_ERROR_SAMPLES, DEFAULTS.minErrorSamples), 1, 10000)
  };
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function nowIso() {
  return new Date().toISOString();
}

function msFromNs(value) {
  return round(Number(value || 0) / 1e6);
}

function updateHighWater(name, value, at = nowIso()) {
  const current = highWater[name];
  if (!current || Number(value || 0) <= Number(current.value || 0)) return;
  current.value = Number(value || 0);
  current.at = at;
}

function memorySnapshot() {
  const current = process.memoryUsage();
  const at = nowIso();
  const heapUtilizationRatio = current.heapTotal > 0 ? current.heapUsed / current.heapTotal : 0;
  const previous = lastMemory;
  const snapshot = {
    rssBytes: current.rss,
    heapUsedBytes: current.heapUsed,
    heapTotalBytes: current.heapTotal,
    heapUtilizationRatio: round(heapUtilizationRatio, 4),
    externalBytes: current.external,
    arrayBuffersBytes: current.arrayBuffers || 0,
    uptimeSeconds: round(process.uptime()),
    delta: previous ? {
      rssBytes: current.rss - previous.rssBytes,
      heapUsedBytes: current.heapUsed - previous.heapUsedBytes,
      heapTotalBytes: current.heapTotal - previous.heapTotalBytes,
      externalBytes: current.external - previous.externalBytes,
      arrayBuffersBytes: (current.arrayBuffers || 0) - previous.arrayBuffersBytes
    } : {
      rssBytes: 0,
      heapUsedBytes: 0,
      heapTotalBytes: 0,
      externalBytes: 0,
      arrayBuffersBytes: 0
    }
  };
  updateHighWater('rssBytes', snapshot.rssBytes, at);
  updateHighWater('heapUsedBytes', snapshot.heapUsedBytes, at);
  updateHighWater('heapTotalBytes', snapshot.heapTotalBytes, at);
  updateHighWater('externalBytes', snapshot.externalBytes, at);
  updateHighWater('arrayBuffersBytes', snapshot.arrayBuffersBytes, at);
  lastMemory = snapshot;
  return snapshot;
}

function cpuSnapshot(sampleAt = performance.now()) {
  const elapsedMs = Math.max(1, sampleAt - lastSampleAt);
  const delta = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastSampleAt = sampleAt;
  const userCpuMs = delta.user / 1000;
  const systemCpuMs = delta.system / 1000;
  const totalCpuMs = userCpuMs + systemCpuMs;
  const cpuCount = Math.max(1, os.cpus().length);
  const processCpuCoreRatio = totalCpuMs / elapsedMs;
  const hostCpuCapacityRatio = processCpuCoreRatio / cpuCount;
  return {
    userCpuMs: round(userCpuMs),
    systemCpuMs: round(systemCpuMs),
    totalCpuMs: round(totalCpuMs),
    sampleDurationMs: round(elapsedMs),
    processCpuCoreRatio: round(processCpuCoreRatio, 4),
    hostCpuCapacityRatio: round(hostCpuCapacityRatio, 4),
    cpuUtilizationRatio: round(hostCpuCapacityRatio, 4),
    cpuCount,
    approximation: 'cpuUtilizationRatio is deprecated alias for hostCpuCapacityRatio'
  };
}

function eventLoopSnapshot(options = {}) {
  if (!histogram) return { available: false, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  const row = {
    available: true,
    meanMs: Number.isFinite(histogram.mean) ? msFromNs(histogram.mean) : 0,
    p50Ms: msFromNs(histogram.percentile(50)),
    p95Ms: msFromNs(histogram.percentile(95)),
    p99Ms: msFromNs(histogram.percentile(99)),
    maxMs: msFromNs(histogram.max)
  };
  updateHighWater('eventLoopP99Ms', row.p99Ms);
  if (options.reset !== false) histogram.reset();
  return row;
}

function emptyBucket(bucketStart = 0) {
  return {
    bucketStart,
    requests: 0,
    errors: 0,
    aborted: 0,
    status2xx: 0,
    status3xx: 0,
    status4xx: 0,
    status5xx: 0,
    responseBytes: 0
  };
}

function bucketStartFor(now = Date.now(), bucketMs = DEFAULTS.rollingBucketMs) {
  const safeNow = Number.isFinite(now) && now > 0 ? now : Date.now();
  return Math.floor(safeNow / bucketMs) * bucketMs;
}

function bucketFor(now = Date.now()) {
  const config = readConfig();
  const start = bucketStartFor(now, config.rollingBucketMs);
  const index = Math.abs(Math.floor(start / config.rollingBucketMs)) % requestBuckets.length;
  if (requestBuckets[index].bucketStart !== start) {
    requestBuckets[index] = emptyBucket(start);
  }
  return requestBuckets[index];
}

function resetBuckets() {
  for (let index = 0; index < requestBuckets.length; index += 1) {
    requestBuckets[index] = emptyBucket(0);
  }
}

function recordRequestBucket(details = {}, now = Date.now()) {
  const bucket = bucketFor(now);
  const statusCode = Number(details.statusCode || 0);
  bucket.requests += 1;
  if (details.aborted) bucket.aborted += 1;
  if (statusCode >= 500 || details.aborted) bucket.errors += 1;
  if (statusCode >= 200 && statusCode < 300) bucket.status2xx += 1;
  else if (statusCode >= 300 && statusCode < 400) bucket.status3xx += 1;
  else if (statusCode >= 400 && statusCode < 500) bucket.status4xx += 1;
  else if (statusCode >= 500) bucket.status5xx += 1;
  const responseBytes = parseResponseBytes(details.responseBytes);
  if (responseBytes != null) bucket.responseBytes += responseBytes;
}

function summarizeBuckets(now = Date.now(), windowMs = 5 * 60 * 1000) {
  const config = readConfig();
  const safeNow = Number.isFinite(now) && now > 0 ? now : Date.now();
  const cutoff = safeNow - windowMs;
  return requestBuckets.reduce((sum, row) => {
    if (!row.bucketStart || row.bucketStart < cutoff - config.rollingBucketMs || row.bucketStart > safeNow + config.rollingBucketMs) return sum;
    sum.requests += row.requests || 0;
    sum.errors += row.errors || 0;
    sum.aborted += row.aborted || 0;
    sum.status2xx += row.status2xx || 0;
    sum.status3xx += row.status3xx || 0;
    sum.status4xx += row.status4xx || 0;
    sum.status5xx += row.status5xx || 0;
    sum.responseBytes += row.responseBytes || 0;
    return sum;
  }, emptyBucket(0));
}

function windowSummary(now = Date.now()) {
  const last1m = summarizeBuckets(now, 60 * 1000);
  const last5m = summarizeBuckets(now, 5 * 60 * 1000);
  return {
    requestsLast1Minute: last1m.requests,
    requestsLast5Minutes: last5m.requests,
    requestsPerSecond1Minute: round(last1m.requests / 60),
    requestsPerSecond5Minutes: round(last5m.requests / 300),
    errorsLast1Minute: last1m.errors,
    errorsLast5Minutes: last5m.errors,
    errorRate1Minute: round(last1m.errors / Math.max(1, last1m.requests), 4),
    errorRate5Minutes: round(last5m.errors / Math.max(1, last5m.requests), 4),
    retainedBuckets: requestBuckets.length,
    bucketMs: readConfig().rollingBucketMs
  };
}

function requestsSnapshot() {
  return {
    activeRequests: counters.activeRequests,
    maxActiveRequests: counters.maxActiveRequests,
    completedRequests: counters.completedRequests,
    failedRequests: counters.failedRequests,
    abortedRequests: counters.abortedRequests,
    status2xx: counters.status2xx,
    status3xx: counters.status3xx,
    status4xx: counters.status4xx,
    status5xx: counters.status5xx,
    responseBytesKnown: counters.responseBytesKnown,
    responseBytesTotal: counters.responseBytesTotal,
    maxResponseBytes: counters.maxResponseBytes,
    averageResponseBytes: counters.responseBytesKnown
      ? Math.round(counters.responseBytesTotal / counters.responseBytesKnown)
      : null,
    window: windowSummary()
  };
}

function capacitySnapshot(snapshot = lastSample, apiSummary = null) {
  const config = readConfig();
  if (!snapshot) {
    return {
      status: 'unknown',
      dimensions: { memory: 'unknown', eventLoop: 'unknown', requests: 'unknown', apiLatency: 'insufficient_data', errors: 'insufficient_data' },
      reasons: [{ metric: 'sample', value: 'missing', threshold: 'sample required' }]
    };
  }
  return evaluateCapacity({
    runtime: {
      process: snapshot.process || {},
      eventLoop: snapshot.eventLoop || {}
    },
    requests: snapshot.requests || requestsSnapshot(),
    api: apiSummary || {},
    config
  });
}

function sampleNow() {
  const at = nowIso();
  sampleSequence += 1;
  const sample = {
    sampleSequence,
    generatedAt: at,
    uptimeSeconds: round(process.uptime()),
    process: memorySnapshot(),
    cpu: cpuSnapshot(),
    eventLoop: eventLoopSnapshot({ reset: true }),
    requests: requestsSnapshot()
  };
  sample.capacity = capacitySnapshot(sample);
  lastSample = sample;
  samples.push(sample);
  const config = readConfig();
  if (samples.length > config.maxSamples) samples.splice(0, samples.length - config.maxSamples);
  for (const listener of sampleListeners) {
    try {
      listener(sample);
    } catch (_) {
      // Observation listeners must never affect request/runtime telemetry.
    }
  }
  return sample;
}

function maybeLogSample(sample) {
  const config = readConfig();
  const now = Date.now();
  if (!runtimeLogger?.info || now < nextLogAtMs) return;
  nextLogAtMs = now + config.logIntervalMs;
  const payload = {
    event: 'performance_snapshot',
    generatedAt: nowIso(),
    sampleGeneratedAt: sample.generatedAt,
    sampleAgeMs: Math.max(0, Date.now() - Date.parse(sample.generatedAt || nowIso())),
    sampleSequence: sample.sampleSequence,
    uptimeSeconds: sample.uptimeSeconds,
    process: sample.process,
    cpu: sample.cpu,
    eventLoop: sample.eventLoop,
    requests: sample.requests,
    capacity: sample.capacity
  };
  runtimeLogger.info(payload, '[PERF_SNAPSHOT]');
}

function runSampleCycle() {
  const sample = sampleNow();
  maybeLogSample(sample);
  return sample;
}

function start(options = {}) {
  const config = readConfig();
  runtimeLogger = options.logger || runtimeLogger;
  if (!config.enabled || started) return { started, enabled: config.enabled };
  started = true;
  histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  lastCpuUsage = process.cpuUsage();
  lastSampleAt = performance.now();
  nextLogAtMs = Date.now() + config.logIntervalMs;
  runSampleCycle();
  sampleTimer = setInterval(() => runSampleCycle(), config.sampleIntervalMs);
  sampleTimer.unref?.();
  return { started: true, enabled: true, sampleIntervalMs: config.sampleIntervalMs, logIntervalMs: config.logIntervalMs };
}

function stop() {
  if (sampleTimer) clearInterval(sampleTimer);
  sampleTimer = null;
  if (histogram) histogram.disable();
  histogram = null;
  started = false;
}

function reset() {
  const active = counters.activeRequests;
  Object.keys(counters).forEach((key) => { counters[key] = 0; });
  counters.activeRequests = Math.max(0, active);
  counters.maxActiveRequests = counters.activeRequests;
  resetBuckets();
  samples.splice(0, samples.length);
  Object.values(highWater).forEach((row) => {
    row.value = 0;
    row.at = null;
  });
  lastMemory = null;
  lastSample = null;
  sampleSequence = 0;
  return sampleNow();
}

function parseResponseBytes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function recordRequestStart() {
  counters.activeRequests += 1;
  if (counters.activeRequests > counters.maxActiveRequests) {
    counters.maxActiveRequests = counters.activeRequests;
    updateHighWater('activeRequests', counters.activeRequests);
  }
  let finished = false;
  const activeAtStart = counters.activeRequests;
  return function recordRequestDone(details = {}) {
    if (finished) return { activeAtStart };
    finished = true;
    counters.activeRequests = Math.max(0, counters.activeRequests - 1);
    counters.completedRequests += 1;
    const statusCode = Number(details.statusCode || 0);
    if (details.aborted) counters.abortedRequests += 1;
    if (statusCode >= 500 || details.aborted) counters.failedRequests += 1;
    if (statusCode >= 200 && statusCode < 300) counters.status2xx += 1;
    else if (statusCode >= 300 && statusCode < 400) counters.status3xx += 1;
    else if (statusCode >= 400 && statusCode < 500) counters.status4xx += 1;
    else if (statusCode >= 500) counters.status5xx += 1;
    const responseBytes = parseResponseBytes(details.responseBytes);
    if (responseBytes != null) {
      counters.responseBytesKnown += 1;
      counters.responseBytesTotal += responseBytes;
      counters.maxResponseBytes = Math.max(counters.maxResponseBytes, responseBytes);
    }
    recordRequestBucket({ statusCode, aborted: Boolean(details.aborted), responseBytes });
    return { activeAtStart };
  };
}

function requestLifecycleMiddleware(req, res, next) {
  const done = recordRequestStart();
  let closedBeforeFinish = false;
  res.once('finish', () => {
    done({
      statusCode: res.statusCode,
      responseBytes: res.getHeader('content-length'),
      aborted: false
    });
  });
  res.once('close', () => {
    if (!res.writableEnded) closedBeforeFinish = true;
    done({
      statusCode: res.statusCode,
      responseBytes: res.getHeader('content-length'),
      aborted: closedBeforeFinish || req.aborted
    });
  });
  return next();
}

function snapshot(options = {}) {
  const current = lastSample;
  const generatedAt = nowIso();
  const sampleAgeMs = current?.generatedAt ? Math.max(0, Date.now() - Date.parse(current.generatedAt)) : null;
  return {
    ok: true,
    generatedAt,
    version: 'performance-summary-v1',
    enabled: readConfig().enabled,
    sampleGeneratedAt: current?.generatedAt || null,
    sampleAgeMs,
    sampleSequence: current?.sampleSequence || 0,
    process: current?.process || null,
    cpu: current?.cpu || null,
    eventLoop: current?.eventLoop || { available: false, meanMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
    requests: requestsSnapshot(),
    capacity: capacitySnapshot(current, options.apiSummary || null),
    highWater: JSON.parse(JSON.stringify(highWater)),
    window: windowSummary(),
    samples: {
      retained: samples.length,
      max: readConfig().maxSamples
    },
    limitations: [
      'In-memory telemetry resets on process restart.',
      'CPU utilization is process-level approximation.',
      'Mongo pool diagnostics are not available unless the driver exposes pool events through the existing connection.'
    ]
  };
}

function addSampleListener(listener) {
  if (typeof listener !== 'function') return () => {};
  sampleListeners.add(listener);
  return () => sampleListeners.delete(listener);
}

function isStarted() {
  return started;
}

module.exports = {
  DEFAULTS,
  readConfig,
  start,
  stop,
  reset,
  sampleNow,
  addSampleListener,
  snapshot,
  capacitySnapshot,
  requestLifecycleMiddleware,
  recordRequestStart,
  isStarted,
  _private: {
    counters,
    samples,
    requestBuckets,
    highWater,
    bucketFor,
    recordRequestBucket,
    resetBuckets,
    memorySnapshot,
    cpuSnapshot,
    eventLoopSnapshot,
    windowSummary,
    runSampleCycle,
    sampleListeners
  }
};
