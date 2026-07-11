'use strict';

const LEVELS = Object.freeze({
  unknown: 0,
  healthy: 1,
  insufficient_data: 1,
  watch: 2,
  critical: 3
});

const DEFAULTS = Object.freeze({
  memoryLimitMb: 0,
  heapWarnRatio: 0.85,
  eventLoopWarnMs: 75,
  eventLoopCriticalMs: 250,
  p95WarnMs: 1500,
  errorRateWarn: 0.05,
  activeRequestWarn: 25,
  minApiSamples: 20,
  minErrorSamples: 20
});

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function normalizeConfig(config = {}) {
  return {
    memoryLimitMb: Number(config.memoryLimitMb || 0),
    heapWarnRatio: Number(config.heapWarnRatio || DEFAULTS.heapWarnRatio),
    eventLoopWarnMs: Number(config.eventLoopWarnMs || DEFAULTS.eventLoopWarnMs),
    eventLoopCriticalMs: Number(config.eventLoopCriticalMs || DEFAULTS.eventLoopCriticalMs),
    p95WarnMs: Number(config.p95WarnMs || DEFAULTS.p95WarnMs),
    errorRateWarn: Number(config.errorRateWarn || DEFAULTS.errorRateWarn),
    activeRequestWarn: Number(config.activeRequestWarn || DEFAULTS.activeRequestWarn),
    minApiSamples: Number(config.minApiSamples || DEFAULTS.minApiSamples),
    minErrorSamples: Number(config.minErrorSamples || DEFAULTS.minErrorSamples)
  };
}

function worstStatus(dimensions = {}) {
  return Object.values(dimensions).reduce((winner, value) => (
    (LEVELS[value] || 0) > (LEVELS[winner] || 0) ? value : winner
  ), 'healthy');
}

function apiP95(api = {}) {
  const values = [
    Number(api.overallP95Ms || 0),
    Number(api.worstRouteP95Ms || 0),
    Number(api.topRouteP95Ms || 0)
  ].filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}

function evaluateCapacity(input = {}) {
  const config = normalizeConfig(input.config || {});
  const runtime = input.runtime || {};
  const requests = input.requests || {};
  const api = input.api || {};
  const eventLoop = runtime.eventLoop || input.eventLoop || {};
  const processInfo = runtime.process || input.process || {};
  const windowInfo = requests.window || input.window || {};
  const dimensions = {
    memory: 'unknown',
    eventLoop: 'unknown',
    requests: 'healthy',
    apiLatency: 'insufficient_data',
    errors: 'insufficient_data'
  };
  const reasons = [];

  if (config.memoryLimitMb > 0 && Number(processInfo.rssBytes || 0) > 0) {
    const rssRatio = processInfo.rssBytes / (config.memoryLimitMb * 1024 * 1024);
    dimensions.memory = rssRatio >= 0.95 ? 'critical' : (rssRatio >= 0.85 ? 'watch' : 'healthy');
    if (dimensions.memory !== 'healthy') {
      reasons.push({ dimension: 'memory', metric: 'rssRatio', value: round(rssRatio), threshold: dimensions.memory === 'critical' ? 0.95 : 0.85 });
    }
  } else {
    reasons.push({ dimension: 'memory', metric: 'memoryLimit', value: 'unknown', threshold: 'PERF_MEMORY_LIMIT_MB not configured' });
  }

  if (Number(processInfo.heapUtilizationRatio || 0) >= 0.95) {
    dimensions.memory = 'critical';
    reasons.push({ dimension: 'memory', metric: 'heapUtilizationRatio', value: processInfo.heapUtilizationRatio, threshold: 0.95 });
  } else if (Number(processInfo.heapUtilizationRatio || 0) >= config.heapWarnRatio && dimensions.memory !== 'critical') {
    dimensions.memory = 'watch';
    reasons.push({ dimension: 'memory', metric: 'heapUtilizationRatio', value: processInfo.heapUtilizationRatio, threshold: config.heapWarnRatio });
  }

  if (eventLoop && eventLoop.available !== false) {
    dimensions.eventLoop = 'healthy';
    if (Number(eventLoop.p99Ms || 0) >= config.eventLoopCriticalMs) {
      dimensions.eventLoop = 'critical';
      reasons.push({ dimension: 'eventLoop', metric: 'eventLoopP99Ms', value: eventLoop.p99Ms, threshold: config.eventLoopCriticalMs });
    } else if (Number(eventLoop.p95Ms || 0) >= config.eventLoopWarnMs) {
      dimensions.eventLoop = 'watch';
      reasons.push({ dimension: 'eventLoop', metric: 'eventLoopP95Ms', value: eventLoop.p95Ms, threshold: config.eventLoopWarnMs });
    }
  }

  if (Number(requests.activeRequests || 0) >= config.activeRequestWarn) {
    dimensions.requests = 'watch';
    reasons.push({ dimension: 'requests', metric: 'activeRequests', value: requests.activeRequests, threshold: config.activeRequestWarn });
  }

  const apiSampleCount = Number(api.sampleCount || api.totalCalls || 0);
  const p95 = apiP95(api);
  if (apiSampleCount >= config.minApiSamples) {
    dimensions.apiLatency = p95 >= config.p95WarnMs ? 'watch' : 'healthy';
    if (dimensions.apiLatency === 'watch') {
      reasons.push({ dimension: 'apiLatency', metric: 'apiP95Ms', value: p95, threshold: config.p95WarnMs, sampleCount: apiSampleCount });
    }
  } else {
    reasons.push({ dimension: 'apiLatency', metric: 'sampleCount', value: apiSampleCount, threshold: config.minApiSamples });
  }

  const errorSampleCount = Number(windowInfo.requestsLast5Minutes || api.totalCalls || 0);
  const errorRate = Number(windowInfo.errorRate5Minutes ?? api.errorRate ?? 0);
  if (errorSampleCount >= config.minErrorSamples) {
    dimensions.errors = errorRate >= config.errorRateWarn ? 'watch' : 'healthy';
    if (dimensions.errors === 'watch') {
      reasons.push({ dimension: 'errors', metric: 'errorRate5Minutes', value: round(errorRate), threshold: config.errorRateWarn, sampleCount: errorSampleCount });
    }
  } else {
    reasons.push({ dimension: 'errors', metric: 'sampleCount', value: errorSampleCount, threshold: config.minErrorSamples });
  }

  return {
    status: worstStatus(dimensions),
    dimensions,
    reasons,
    thresholds: {
      memoryLimitMb: config.memoryLimitMb,
      heapWarnRatio: config.heapWarnRatio,
      eventLoopWarnMs: config.eventLoopWarnMs,
      eventLoopCriticalMs: config.eventLoopCriticalMs,
      p95WarnMs: config.p95WarnMs,
      errorRateWarn: config.errorRateWarn,
      activeRequestWarn: config.activeRequestWarn,
      minApiSamples: config.minApiSamples,
      minErrorSamples: config.minErrorSamples
    }
  };
}

module.exports = {
  DEFAULTS,
  evaluateCapacity
};
