'use strict';

const crypto = require('crypto');
const performanceTelemetry = require('./performanceTelemetry');
const { evaluateCapacity } = require('./capacityEvaluator');

const MAX_COMPLETED = 5;
const MAX_SAMPLES = 960;
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;

let getApiMonitorReport = null;
let getReleaseSummary = null;
let activeSession = null;
const completedSessions = [];

function nowIso() {
  return new Date().toISOString();
}

function safeLabel(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'bearer [redacted]')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b\d{8,}\b/g, '[number]')
    .trim()
    .slice(0, 120);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function setProviders(providers = {}) {
  getApiMonitorReport = providers.getApiMonitorReport || getApiMonitorReport;
  getReleaseSummary = providers.getReleaseSummary || getReleaseSummary;
}

function releaseSummary() {
  return typeof getReleaseSummary === 'function'
    ? getReleaseSummary()
    : { releaseId: 'unavailable', environment: process.env.NODE_ENV || 'development' };
}

function routeSnapshot() {
  if (typeof getApiMonitorReport !== 'function') return { summary: {}, data: [] };
  const report = getApiMonitorReport({ limit: 500 });
  return {
    summary: clone(report.summary || {}),
    data: clone(report.data || []),
    topSlowestApis: clone(report.topSlowestApis || []),
    topCalledApis: clone(report.topCalledApis || []),
    topRowsApis: clone(report.topRowsApis || []),
    topQueryTraceApis: clone(report.topQueryTraceApis || [])
  };
}

function makeId() {
  return `obs_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function compactSample(sample = {}) {
  return {
    sampleSequence: sample.sampleSequence || 0,
    generatedAt: sample.generatedAt || null,
    rssBytes: sample.process?.rssBytes || 0,
    heapUsedBytes: sample.process?.heapUsedBytes || 0,
    heapUtilizationRatio: sample.process?.heapUtilizationRatio || 0,
    eventLoopP50Ms: sample.eventLoop?.p50Ms || 0,
    eventLoopP95Ms: sample.eventLoop?.p95Ms || 0,
    eventLoopP99Ms: sample.eventLoop?.p99Ms || 0,
    eventLoopMaxMs: sample.eventLoop?.maxMs || 0,
    activeRequests: sample.requests?.activeRequests || 0,
    maxActiveRequests: sample.requests?.maxActiveRequests || 0,
    completedRequests: sample.requests?.completedRequests || 0,
    failedRequests: sample.requests?.failedRequests || 0,
    capacityStatus: sample.capacity?.status || 'unknown'
  };
}

function maybeRecordSample(sample) {
  if (!activeSession || activeSession.status !== 'running') return;
  const started = Date.parse(activeSession.startedAt || '');
  const now = Date.now();
  if (Number.isFinite(started) && now - started > MAX_DURATION_MS) {
    stopObservation({ reason: 'max_duration_reached' });
    return;
  }
  activeSession.samples.push(compactSample(sample));
  if (activeSession.samples.length > MAX_SAMPLES) {
    activeSession.samples.splice(0, activeSession.samples.length - MAX_SAMPLES);
  }
  activeSession.sampleCount = activeSession.samples.length;
  activeSession.durationMs = Number.isFinite(started) ? Math.max(0, now - started) : 0;
}

performanceTelemetry.addSampleListener(maybeRecordSample);

function computeDeltas(start = {}, end = {}) {
  return {
    requests: Number(end.requests?.completedRequests || 0) - Number(start.requests?.completedRequests || 0),
    failedRequests: Number(end.requests?.failedRequests || 0) - Number(start.requests?.failedRequests || 0),
    rssBytes: Number(end.process?.rssBytes || 0) - Number(start.process?.rssBytes || 0),
    heapUsedBytes: Number(end.process?.heapUsedBytes || 0) - Number(start.process?.heapUsedBytes || 0),
    maxActiveRequests: end.requests?.maxActiveRequests || 0,
    peakRssBytes: end.highWater?.rssBytes?.value || 0,
    peakHeapUsedBytes: end.highWater?.heapUsedBytes?.value || 0
  };
}

function routeDeltas(before = {}, after = {}) {
  const beforeMap = new Map((before.data || []).map((row) => [row.route, row]));
  return (after.data || []).map((row) => {
    const old = beforeMap.get(row.route) || {};
    const countDelta = Math.max(0, Number(row.count || 0) - Number(old.count || 0));
    return {
      route: row.route,
      method: row.method,
      path: row.path,
      module: row.module,
      countDelta,
      p95Ms: row.p95Ms || 0,
      p99Ms: row.p99Ms || 0,
      avgMs: row.avgMs || 0,
      avgMongoMs: row.avgMongoMs || 0,
      avgJsMs: row.avgJsMs || 0,
      avgDbQueries: row.avgDbQueries || 0,
      avgRows: row.avgRows || 0,
      maxRows: row.maxRows || 0,
      avgResponseBytes: row.avgResponseBytes || 0,
      maxConcurrentObserved: row.maxConcurrentObserved || 0,
      errorRate: row.errorRate || 0
    };
  }).filter((row) => row.countDelta > 0);
}

function riskClass(row = {}) {
  const path = String(row.path || row.route || '').toLowerCase();
  if (/account|ledger|debt|closeout|payment|fund/.test(path)) return 'ACCOUNTING_CRITICAL';
  if (/post|put|delete|confirm|reset|create|update/.test(String(row.method || '').toLowerCase() + path)) return 'WRITER_SENSITIVE';
  if (/export|report|print/.test(path)) return 'READ_ONLY_REPORT_EXPORT';
  if (/mobile/.test(path)) return 'MOBILE_HOTPATH';
  if (!path) return 'UNKNOWN';
  return 'READ_ONLY_LOW_RISK';
}

function scoreCandidate(row = {}) {
  const mongoRatio = Number(row.avgMongoMs || 0) / Math.max(1, Number(row.avgMs || 0));
  const jsRatio = Number(row.avgJsMs || 0) / Math.max(1, Number(row.avgMs || 0));
  return Math.round(
    Math.min(Number(row.countDelta || 0), 500)
    + Math.min(Number(row.p95Ms || 0) / 10, 300)
    + Math.min(Number(row.p99Ms || 0) / 20, 200)
    + Math.min(mongoRatio * 80, 80)
    + Math.min(jsRatio * 50, 50)
    + Math.min(Number(row.avgDbQueries || 0) * 8, 120)
    + Math.min(Number(row.avgResponseBytes || 0) / 1024, 80)
  );
}

function buildCandidates(session = activeSession) {
  if (!session || !session.routeResult) {
    return { status: 'BLOCKED_NO_PRODUCTION_EVIDENCE', candidates: [], limitations: ['No completed observation or benchmark route evidence.'] };
  }
  const environment = String(session.environment || '').toLowerCase();
  const evidenceStatus = environment === 'production' || environment === 'staging'
    ? 'MEASURED'
    : 'LOCAL_FIXTURE_ONLY';
  const rows = routeDeltas(session.routeBaseline || {}, session.routeResult || {})
    .map((row) => ({
      ...row,
      riskClass: riskClass(row),
      performanceImpactScore: scoreCandidate(row),
      recommendation: 'Phase242 candidate only; no optimization performed in Phase241.'
    }))
    .filter((row) => row.riskClass !== 'WRITER_SENSITIVE' && row.riskClass !== 'ACCOUNTING_CRITICAL')
    .sort((a, b) => b.performanceImpactScore - a.performanceImpactScore)
    .slice(0, 20);
  return {
    status: rows.length ? evidenceStatus : (evidenceStatus === 'MEASURED' ? 'INSUFFICIENT_DATA' : 'BLOCKED_NO_PRODUCTION_EVIDENCE'),
    environment,
    candidates: rows,
    limitations: rows.length ? [] : ['No route had enough measured delta to rank safely.']
  };
}

function startObservation(options = {}) {
  if (activeSession && activeSession.status === 'running') {
    const error = new Error('Performance observation is already running');
    error.status = 409;
    throw error;
  }
  const release = releaseSummary();
  const environment = String(options.environment || release.environment || process.env.NODE_ENV || 'development').toLowerCase();
  activeSession = {
    id: makeId(),
    status: 'running',
    label: safeLabel(options.label || 'performance observation'),
    environment,
    releaseId: release.releaseId || release.version || 'unknown',
    release,
    nodeVersion: process.version,
    startedAt: nowIso(),
    stoppedAt: null,
    durationMs: 0,
    startSnapshot: performanceTelemetry.snapshot(),
    endSnapshot: null,
    sampleCount: 0,
    samples: [],
    routeBaseline: routeSnapshot(),
    routeResult: null,
    deltas: {},
    evidenceQuality: {
      status: environment === 'production' || environment === 'staging' ? 'MEASURED' : 'LOCAL_FIXTURE_ONLY',
      limitations: ['Observation is in-memory and is lost on process restart.']
    }
  };
  return getObservation();
}

function stopObservation(options = {}) {
  if (!activeSession || activeSession.status !== 'running') {
    const error = new Error('No active performance observation');
    error.status = 404;
    throw error;
  }
  const stoppedAt = nowIso();
  activeSession.status = options.reason === 'max_duration_reached' ? 'interrupted' : 'stopped';
  activeSession.stoppedAt = stoppedAt;
  activeSession.endSnapshot = performanceTelemetry.snapshot();
  activeSession.routeResult = routeSnapshot();
  activeSession.durationMs = Math.max(0, Date.parse(stoppedAt) - Date.parse(activeSession.startedAt));
  activeSession.deltas = computeDeltas(activeSession.startSnapshot, activeSession.endSnapshot);
  activeSession.capacity = evaluateCapacity({
    runtime: { process: activeSession.endSnapshot.process || {}, eventLoop: activeSession.endSnapshot.eventLoop || {} },
    requests: activeSession.endSnapshot.requests || {},
    api: activeSession.routeResult.summary || {},
    config: performanceTelemetry.readConfig()
  });
  completedSessions.unshift(activeSession);
  if (completedSessions.length > MAX_COMPLETED) completedSessions.splice(MAX_COMPLETED);
  activeSession = null;
  return getObservation();
}

function summarizeSession(session) {
  if (!session) return null;
  const end = session.endSnapshot || performanceTelemetry.snapshot();
  const route = session.routeResult || routeSnapshot();
  const deltas = session.deltas && Object.keys(session.deltas).length ? session.deltas : computeDeltas(session.startSnapshot, end);
  return {
    id: session.id,
    status: session.status,
    label: session.label,
    environment: session.environment,
    releaseId: session.releaseId,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    durationMs: session.stoppedAt ? session.durationMs : Math.max(0, Date.now() - Date.parse(session.startedAt || nowIso())),
    sampleCount: session.samples.length,
    requestCount: deltas.requests || 0,
    errorRate: (deltas.failedRequests || 0) / Math.max(1, deltas.requests || 0),
    peakActiveRequest: end.highWater?.activeRequests?.value || end.requests?.maxActiveRequests || 0,
    peakRssBytes: end.highWater?.rssBytes?.value || 0,
    peakHeapBytes: end.highWater?.heapUsedBytes?.value || 0,
    eventLoop: end.eventLoop || {},
    api: route.summary || {},
    capacity: session.capacity || end.capacity || {},
    evidenceQuality: session.evidenceQuality
  };
}

function getObservation() {
  return {
    ok: true,
    generatedAt: nowIso(),
    active: summarizeSession(activeSession),
    completed: completedSessions.map(summarizeSession)
  };
}

function exportObservation() {
  const session = activeSession || completedSessions[0] || null;
  if (!session) {
    return {
      ok: true,
      status: 'BLOCKED_NO_RUNTIME_WORKLOAD',
      markdown: '# Phase241 Observation\n\nNo observation session has been recorded.\n',
      data: null
    };
  }
  const summary = summarizeSession(session);
  const candidates = buildCandidates(session);
  const data = {
    ok: true,
    version: 'performance-observation-v1',
    generatedAt: nowIso(),
    summary,
    session: clone(session),
    candidates,
    limitations: ['In-memory observation is lost on process restart.', 'No JWT/cookie/header/body/query values are exported.']
  };
  const markdown = [
    '# Phase241 Performance Observation',
    '',
    `- Status: ${summary.status}`,
    `- Environment: ${summary.environment}`,
    `- Release: ${summary.releaseId}`,
    `- Started: ${summary.startedAt}`,
    `- Stopped: ${summary.stoppedAt || ''}`,
    `- Duration ms: ${summary.durationMs}`,
    `- Samples: ${summary.sampleCount}`,
    `- Requests: ${summary.requestCount}`,
    `- Error rate: ${summary.errorRate}`,
    `- Peak active requests: ${summary.peakActiveRequest}`,
    `- Peak RSS bytes: ${summary.peakRssBytes}`,
    `- Event loop p95 ms: ${summary.eventLoop.p95Ms || 0}`,
    `- API p95 ms: ${summary.api.overallP95Ms || 0}`,
    `- Capacity: ${summary.capacity.status || 'unknown'}`,
    '',
    '## Candidate Ranking',
    '',
    `Status: ${candidates.status}`,
    '',
    '| Route | Module | Calls | p95 ms | Mongo ms | JS ms | Score | Risk |',
    '|---|---|---:|---:|---:|---:|---:|---|',
    ...(candidates.candidates || []).map((row) => `|${row.route}|${row.module || ''}|${row.countDelta}|${row.p95Ms}|${row.avgMongoMs}|${row.avgJsMs}|${row.performanceImpactScore}|${row.riskClass}|`),
    '',
    'Limitations: in-memory only; production capacity is not inferred without production/staging evidence.'
  ].join('\n');
  return { ok: true, status: candidates.status, data, markdown: `${markdown}\n` };
}

module.exports = {
  setProviders,
  startObservation,
  stopObservation,
  getObservation,
  exportObservation,
  buildCandidates,
  _private: {
    safeLabel,
    routeDeltas,
    riskClass,
    scoreCandidate,
    completedSessions,
    get activeSession() { return activeSession; }
  }
};
