'use strict';

const os = require('os');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');

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
  maxRequestEvents: 10000
});

let histogram = null;
let sampleTimer = null;
let logTimer = null;
let runtimeLogger = null;
let started = false;
let lastCpuUsage = process.cpuUsage();
let lastSampleAt = performance.now();
let lastMemory = null;
let lastSample = null;

const samples = [];
const requestEvents = [];
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
    maxRequestEvents: clamp(toNumber(process.env.PERF_MAX_REQUEST_EVENTS, DEFAULTS.maxRequestEvents), 100, 200000)
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
  return {
    userCpuMs: round(userCpuMs),
    systemCpuMs: round(systemCpuMs),
    totalCpuMs: round(totalCpuMs),
    sampleDurationMs: round(elapsedMs),
    cpuUtilizationRatio: round(totalCpuMs / (elapsedMs * cpuCount), 4),
    cpuCount,
    approximation: 'process_cpu_delta_over_wall_time_and_cpu_count'
  };
}

function eventLoopSnapshot() {
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
  histogram.reset();
  return row;
}

function pruneRequestEvents(now = Date.now()) {
  const cutoff = now - 5 * 60 * 1000;
  while (requestEvents.length && requestEvents[0].at < cutoff) requestEvents.shift();
  const config = readConfig();
  if (requestEvents.length > config.maxRequestEvents) {
    requestEvents.splice(0, requestEvents.length - config.maxRequestEvents);
  }
}

function windowSummary(now = Date.now()) {
  pruneRequestEvents(now);
  const oneMinute = now - 60 * 1000;
  const fiveMinutes = now - 5 * 60 * 1000;
  const last1m = requestEvents.filter((row) => row.at >= oneMinute);
  const last5m = requestEvents.filter((row) => row.at >= fiveMinutes);
  const errors1m = last1m.filter((row) => row.statusCode >= 500 || row.aborted).length;
  const errors5m = last5m.filter((row) => row.statusCode >= 500 || row.aborted).length;
  return {
    requestsLast1Minute: last1m.length,
    requestsLast5Minutes: last5m.length,
    requestsPerSecond1Minute: round(last1m.length / 60),
    requestsPerSecond5Minutes: round(last5m.length / 300),
    errorsLast1Minute: errors1m,
    errorsLast5Minutes: errors5m,
    errorRate1Minute: round(errors1m / Math.max(1, last1m.length), 4),
    errorRate5Minutes: round(errors5m / Math.max(1, last5m.length), 4),
    retainedEvents: requestEvents.length
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

function capacitySnapshot(snapshot = lastSample) {
  const config = readConfig();
  if (!snapshot) return { status: 'unknown', reasons: [{ metric: 'sample', value: 'missing', threshold: 'sample required' }] };
  const reasons = [];
  const memory = snapshot.process || {};
  const eventLoop = snapshot.eventLoop || {};
  const requests = snapshot.requests || requestsSnapshot();
  const window = requests.window || windowSummary();
  let status = 'healthy';

  const push = (level, metric, value, threshold) => {
    reasons.push({ metric, value, threshold });
    if (level === 'critical') status = 'critical';
    else if (status !== 'critical') status = 'watch';
  };

  if (config.memoryLimitMb > 0) {
    const memoryLimitBytes = config.memoryLimitMb * 1024 * 1024;
    const rssRatio = memory.rssBytes / memoryLimitBytes;
    if (rssRatio >= 0.95) push('critical', 'rssRatio', round(rssRatio, 4), 0.95);
    else if (rssRatio >= 0.85) push('watch', 'rssRatio', round(rssRatio, 4), 0.85);
  } else {
    reasons.push({ metric: 'memoryLimit', value: 'unknown', threshold: 'PERF_MEMORY_LIMIT_MB not configured' });
  }

  if (memory.heapUtilizationRatio >= 0.95) push('critical', 'heapUtilizationRatio', memory.heapUtilizationRatio, 0.95);
  else if (memory.heapUtilizationRatio >= config.heapWarnRatio) push('watch', 'heapUtilizationRatio', memory.heapUtilizationRatio, config.heapWarnRatio);

  if (eventLoop.p99Ms >= config.eventLoopCriticalMs) push('critical', 'eventLoopP99Ms', eventLoop.p99Ms, config.eventLoopCriticalMs);
  else if (eventLoop.p95Ms >= config.eventLoopWarnMs) push('watch', 'eventLoopP95Ms', eventLoop.p95Ms, config.eventLoopWarnMs);

  if (window.errorRate5Minutes >= config.errorRateWarn && window.requestsLast5Minutes >= 10) {
    push('watch', 'errorRate5Minutes', window.errorRate5Minutes, config.errorRateWarn);
  }
  if (requests.activeRequests >= config.activeRequestWarn) {
    push('watch', 'activeRequests', requests.activeRequests, config.activeRequestWarn);
  }

  return { status, reasons };
}

function sampleNow() {
  const at = nowIso();
  const sample = {
    generatedAt: at,
    uptimeSeconds: round(process.uptime()),
    process: memorySnapshot(),
    cpu: cpuSnapshot(),
    eventLoop: eventLoopSnapshot(),
    requests: requestsSnapshot()
  };
  sample.capacity = capacitySnapshot(sample);
  lastSample = sample;
  samples.push(sample);
  const config = readConfig();
  if (samples.length > config.maxSamples) samples.splice(0, samples.length - config.maxSamples);
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
  sampleNow();
  sampleTimer = setInterval(() => sampleNow(), config.sampleIntervalMs);
  sampleTimer.unref?.();
  logTimer = setInterval(() => {
    const snapshot = sampleNow();
    const payload = {
      event: 'performance_snapshot',
      generatedAt: snapshot.generatedAt,
      uptimeSeconds: snapshot.uptimeSeconds,
      process: snapshot.process,
      eventLoop: snapshot.eventLoop,
      requests: snapshot.requests,
      capacity: snapshot.capacity
    };
    if (runtimeLogger?.info) runtimeLogger.info(payload, '[PERF_SNAPSHOT]');
  }, config.logIntervalMs);
  logTimer.unref?.();
  return { started: true, enabled: true, sampleIntervalMs: config.sampleIntervalMs, logIntervalMs: config.logIntervalMs };
}

function stop() {
  if (sampleTimer) clearInterval(sampleTimer);
  if (logTimer) clearInterval(logTimer);
  sampleTimer = null;
  logTimer = null;
  if (histogram) histogram.disable();
  histogram = null;
  started = false;
}

function reset() {
  const active = counters.activeRequests;
  Object.keys(counters).forEach((key) => { counters[key] = 0; });
  counters.activeRequests = Math.max(0, active);
  counters.maxActiveRequests = counters.activeRequests;
  requestEvents.splice(0, requestEvents.length);
  samples.splice(0, samples.length);
  Object.values(highWater).forEach((row) => {
    row.value = 0;
    row.at = null;
  });
  lastMemory = null;
  lastSample = null;
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
    requestEvents.push({ at: Date.now(), statusCode, aborted: Boolean(details.aborted) });
    pruneRequestEvents();
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

function snapshot() {
  const current = lastSample || sampleNow();
  return {
    ok: true,
    generatedAt: nowIso(),
    version: 'performance-summary-v1',
    enabled: readConfig().enabled,
    process: current.process,
    cpu: current.cpu,
    eventLoop: current.eventLoop,
    requests: requestsSnapshot(),
    capacity: capacitySnapshot(current),
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
  snapshot,
  capacitySnapshot,
  requestLifecycleMiddleware,
  recordRequestStart,
  isStarted,
  _private: {
    counters,
    samples,
    requestEvents,
    highWater,
    pruneRequestEvents,
    memorySnapshot,
    cpuSnapshot,
    eventLoopSnapshot,
    windowSummary
  }
};
