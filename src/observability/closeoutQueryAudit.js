'use strict';

const crypto = require('crypto');
const { getRequestContext, runWithRequestContext } = require('./requestContext');
const { internalReleaseSummary } = require('../operations/releaseMetadata');

const CLOSEOUT_ROUTE = '/api/new/delivery-today/closeout';
const DEFAULT_HISTORY_LIMIT = 20;
const DEFAULT_MAX_EVENTS = 300;
const SENSITIVE_FIELD_PATTERN = /(token|authorization|cookie|password|secret|otp|session|jwt|bearer|email|phone|name|address|note|reason|uri|mongo)/i;

const history = [];

const WRITER_SAFETY_MAP = Object.freeze({
  route: 'POST /api/new/delivery-today/closeout',
  auditOnly: true,
  sSoT: Object.freeze({
    inventory: 'inventories',
    ar: 'arLedgers',
    fund: 'fundLedgers',
    returns: 'returnOrders',
    closeoutOrder: 'salesOrders.deliveryCloseout'
  }),
  writers: Object.freeze([
    Object.freeze({ model: 'salesOrders', operation: 'updateOne', owner: 'orderRepository.patchAccountingCloseoutById', safety: 'writer', transactionScoped: true }),
    Object.freeze({ model: 'orderPaymentAllocations', operation: 'findOneAndUpdate', owner: 'OrderPaymentAllocationService.upsertAllocation', safety: 'writer', transactionScoped: true }),
    Object.freeze({ model: 'arLedgers', operation: 'findOneAndUpdate', owner: 'arPostingService.postArLedgerEntry', safety: 'writer', transactionScoped: true }),
    Object.freeze({ model: 'fundLedgers', operation: 'upsert', owner: 'fundService.postFundLedger', safety: 'writer', transactionScoped: true }),
    Object.freeze({ model: 'auditLogs', operation: 'create/log', owner: 'auditService.log', safety: 'post-write-audit', transactionScoped: false }),
    Object.freeze({ model: 'readModelSyncJobs', operation: 'updateOne', owner: 'CloseoutPostCommitHandler.enqueueReadModelSync', safety: 'post-commit-queue', transactionScoped: false })
  ]),
  freshReads: Object.freeze([
    Object.freeze({ model: 'salesOrders', owner: 'CloseoutCriticalReader.loadCriticalOrdersAndReturns', reason: 'fresh order read inside Mongo transaction before posting closeout writers' }),
    Object.freeze({ model: 'returnOrders', owner: 'findReturnOrdersForDeliveryChildren', reason: 'fresh return lifecycle/inventory guard inside Mongo transaction' }),
    Object.freeze({ model: 'arLedgers', owner: 'OrderPaymentDebtReconcileService.getCurrentOrderArBalanceDetails', reason: 'debt reconcile reads before and after posting in same session' }),
    Object.freeze({ model: 'arLedgers', owner: 'findActiveDebtAdjustmentByKey', reason: 'idempotency guard immediately before debt adjustment post' }),
    Object.freeze({ model: 'fundLedgers', owner: 'fundService.postFundLedger', reason: 'idempotency guard before fund ledger upsert' })
  ])
});

function clean(value = '') {
  return String(value ?? '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function strictBoolean(env = process.env, key = 'CLOSEOUT_QUERY_AUDIT_ENABLED') {
  const value = clean(env[key]).toLowerCase();
  if (!value) return false;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return false;
}

function isEnabled(env = process.env) {
  return strictBoolean(env, 'CLOSEOUT_QUERY_AUDIT_ENABLED');
}

function readBoundedInteger(env, key, fallback, min, max) {
  const parsed = Number(env[key] || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function historyLimit(env = process.env) {
  return readBoundedInteger(env, 'CLOSEOUT_QUERY_AUDIT_HISTORY_LIMIT', DEFAULT_HISTORY_LIMIT, 1, 100);
}

function maxRawEvents(env = process.env) {
  return readBoundedInteger(env, 'CLOSEOUT_QUERY_AUDIT_MAX_EVENTS', DEFAULT_MAX_EVENTS, 0, 2000);
}

function boundedPush(row, env = process.env) {
  history.unshift(row);
  const limit = historyLimit(env);
  while (history.length > limit) history.pop();
}

function sortedKeys(value) {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.map((_, index) => `[${index}]`);
  return Object.keys(value).sort();
}

function sanitizeFieldName(field = '') {
  const key = clean(field);
  if (!key) return '';
  if (SENSITIVE_FIELD_PATTERN.test(key)) return '[redacted-field]';
  return key.replace(/[^\w.$[\]-]/g, '_').slice(0, 80);
}

function sanitizeLabel(value = '') {
  return clean(value)
    .replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, 'mongodb://[redacted]')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'bearer [redacted]')
    .replace(/authorization[:=]\s*[^\s,}]+/gi, 'authorization=[redacted]')
    .replace(/cookie[:=]\s*[^\s,}]+/gi, 'cookie=[redacted]')
    .replace(/\b(?:B|SO|HU)\d{4,}\b/gi, '[redacted-order]')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[redacted-email]')
    .replace(/\b\d{8,}\b/g, '[redacted-number]')
    .slice(0, 240);
}

function fieldShape(value, prefix = '') {
  if (!value || typeof value !== 'object') return [];
  return sortedKeys(value)
    .map((key) => sanitizeFieldName(prefix ? `${prefix}.${key}` : key))
    .filter(Boolean);
}

function pipelineShape(stages = []) {
  if (!Array.isArray(stages)) return [];
  return stages.map((stage) => {
    const op = sortedKeys(stage)[0] || 'unknown';
    return sanitizeFieldName(op);
  });
}

function queryFingerprint(query = {}) {
  const operation = sanitizeFieldName(query.operation || query.op || 'unknown');
  const model = sanitizeFieldName(query.model || query.collection || 'unknown');
  return {
    model,
    operation,
    filterFields: fieldShape(query.filter || query.query || query.conditions || {}),
    projectionFields: fieldShape(query.projection || query.select || {}),
    sortFields: fieldShape(query.sort || {}),
    updateFields: fieldShape(query.update || {}),
    pipelineStages: pipelineShape(query.pipeline || query.stages || []),
    limit: Number.isFinite(Number(query.limit)) ? Number(query.limit) : undefined,
    hasSession: Boolean(query.session),
    fingerprintVersion: 1
  };
}

function recordQuery(query = {}, env = process.env) {
  if (!isEnabled(env)) return null;
  const row = {
    type: 'query',
    at: nowIso(),
    fingerprint: queryFingerprint(query)
  };
  boundedPush(row, env);
  return row;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || null));
}

function makeAuditId(requestId = '') {
  const seed = clean(requestId) || crypto.randomBytes(8).toString('hex');
  return `closeout_${Date.now().toString(36)}_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 10)}`;
}

function releaseSummary() {
  try {
    return internalReleaseSummary();
  } catch (_) {
    return { releaseId: 'unknown', environment: process.env.NODE_ENV || 'development' };
  }
}

function normalizeRoute(req = {}) {
  return clean(req.originalUrl || req.url || req.path).split('?')[0];
}

function isCloseoutRoute(req = {}) {
  return clean(req.method).toUpperCase() === 'POST' && normalizeRoute(req) === CLOSEOUT_ROUTE;
}

function emptyCounters() {
  return {
    selectedOrderCount: 0,
    alreadyConfirmedOrderCount: 0,
    pendingOrderCount: 0,
    criticalOrderCount: 0,
    returnOrderCount: 0,
    generatedArRowCount: 0,
    fundPathCount: 0,
    debtReconcileCount: 0,
    orders: []
  };
}

function createSession({ req = {}, route = CLOSEOUT_ROUTE, env = process.env } = {}) {
  const requestContext = getRequestContext() || {};
  const release = releaseSummary();
  return {
    auditId: makeAuditId(requestContext.requestId || req.requestId),
    requestId: clean(requestContext.requestId || req.requestId),
    enabled: true,
    route,
    method: 'POST',
    startedAt: nowIso(),
    startedMs: nowMs(),
    finishedAt: null,
    finished: false,
    status: 'RUNNING',
    httpStatus: 0,
    releaseId: clean(release.releaseId || release.version || 'unknown'),
    environment: clean(release.environment || process.env.NODE_ENV || 'development'),
    stage: 'request',
    stagePath: ['request'],
    stageStack: ['request'],
    orderSequence: null,
    orderCount: 0,
    transactionAttempt: 0,
    transactionAttemptCount: 0,
    transactionRetryCount: 0,
    rawEvents: [],
    rawEventsTruncated: false,
    aggregates: new Map(),
    stageWall: new Map(),
    counters: emptyCounters(),
    apiMonitorDbQueries: null,
    apiMonitorMongoMs: null,
    lastStage: 'request',
    errorClass: '',
    envSnapshot: {
      historyLimit: historyLimit(env),
      maxRawEvents: maxRawEvents(env)
    }
  };
}

function activeSession() {
  const context = getRequestContext();
  return context && context.closeoutQueryAudit && context.closeoutQueryAudit.enabled
    ? context.closeoutQueryAudit
    : null;
}

function attachSession(session) {
  const context = getRequestContext();
  if (!context || !session) return false;
  context.closeoutQueryAudit = session;
  return true;
}

function currentStage(session) {
  return clean(session?.stage) || 'unattributed';
}

function aggregateKey(row = {}) {
  return [
    clean(row.stage) || 'unattributed',
    clean(row.model) || 'Mongo',
    clean(row.operation) || 'query',
    row.hasSession ? 'session' : 'no-session',
    String(Number(row.transactionAttempt || 0))
  ].join('|');
}

function ensureAggregate(session, row) {
  const key = aggregateKey(row);
  if (!session.aggregates.has(key)) {
    session.aggregates.set(key, {
      stage: clean(row.stage) || 'unattributed',
      model: clean(row.model) || 'Mongo',
      collection: clean(row.collection),
      operation: clean(row.operation) || 'query',
      hasSession: Boolean(row.hasSession),
      transactionAttempt: Number(row.transactionAttempt || 0),
      count: 0,
      totalMongoMs: 0,
      maxMongoMs: 0,
      rows: 0,
      errorCount: 0,
      queryShapeSamples: []
    });
  }
  return session.aggregates.get(key);
}

function pushRawEvent(session, event) {
  const maxEvents = maxRawEvents(process.env);
  if (maxEvents <= 0) {
    session.rawEventsTruncated = true;
    return;
  }
  if (session.rawEvents.length >= maxEvents) {
    session.rawEventsTruncated = true;
    return;
  }
  session.rawEvents.push(event);
}

function observeMongoQueryEvent(event = {}) {
  const session = activeSession();
  if (!session || !session.enabled) return;
  const row = {
    timestamp: event.timestamp || nowIso(),
    stage: currentStage(session),
    stagePath: Array.isArray(session.stagePath) ? session.stagePath.join(' > ') : currentStage(session),
    orderSequence: Number(session.orderSequence || 0) || null,
    orderCount: Number(session.orderCount || 0),
    transactionAttempt: Number(session.transactionAttempt || 0),
    model: sanitizeFieldName(event.model || event.collection || 'Mongo'),
    collection: sanitizeFieldName(event.collection || ''),
    operation: sanitizeFieldName(event.operation || 'query'),
    durationMs: Math.max(0, Math.round(Number(event.durationMs || event.ms || 0))),
    rows: Math.max(0, Math.round(Number(event.rows || 0))),
    hasSession: Boolean(event.hasSession),
    queryShape: sanitizeLabel(event.queryShape || event.label || ''),
    error: event.error ? 'QUERY_ERROR' : ''
  };
  const aggregate = ensureAggregate(session, row);
  aggregate.count += 1;
  aggregate.totalMongoMs += row.durationMs;
  aggregate.maxMongoMs = Math.max(aggregate.maxMongoMs, row.durationMs);
  aggregate.rows += row.rows;
  if (row.error) aggregate.errorCount += 1;
  if (row.queryShape && !aggregate.queryShapeSamples.includes(row.queryShape) && aggregate.queryShapeSamples.length < 5) {
    aggregate.queryShapeSamples.push(row.queryShape);
  }
  pushRawEvent(session, row);
}

function recordApiMonitorSnapshot(metric = {}) {
  const session = activeSession();
  if (!session || !session.enabled) return;
  session.apiMonitorDbQueries = Math.max(0, Math.round(Number(metric.dbQueries || 0)));
  session.apiMonitorMongoMs = Math.max(0, Math.round(Number(metric.mongoMs || 0)));
}

function stageSummaryFromSession(session) {
  const byStage = new Map();
  for (const row of session.aggregates.values()) {
    const current = byStage.get(row.stage) || {
      stage: row.stage,
      queries: 0,
      mongoCumulativeMs: 0,
      maxMongoMs: 0,
      rows: 0,
      stageWallMs: 0
    };
    current.queries += row.count;
    current.mongoCumulativeMs += row.totalMongoMs;
    current.maxMongoMs = Math.max(current.maxMongoMs, row.maxMongoMs);
    current.rows += row.rows;
    byStage.set(row.stage, current);
  }
  for (const [stage, row] of session.stageWall.entries()) {
    const current = byStage.get(stage) || { stage, queries: 0, mongoCumulativeMs: 0, maxMongoMs: 0, rows: 0, stageWallMs: 0 };
    current.stageWallMs += Math.round(row.wallMs || 0);
    byStage.set(stage, current);
  }
  return Array.from(byStage.values()).sort((a, b) => b.queries - a.queries || b.mongoCumulativeMs - a.mongoCumulativeMs);
}

function modelSummaryFromSession(session) {
  const byModel = new Map();
  for (const row of session.aggregates.values()) {
    const current = byModel.get(row.model) || { model: row.model, queries: 0, mongoCumulativeMs: 0, maxMongoMs: 0, rows: 0 };
    current.queries += row.count;
    current.mongoCumulativeMs += row.totalMongoMs;
    current.maxMongoMs = Math.max(current.maxMongoMs, row.maxMongoMs);
    current.rows += row.rows;
    byModel.set(row.model, current);
  }
  return Array.from(byModel.values()).sort((a, b) => b.queries - a.queries || b.mongoCumulativeMs - a.mongoCumulativeMs);
}

function operationSummaryFromSession(session) {
  return Array.from(session.aggregates.values())
    .map((row) => ({
      stage: row.stage,
      model: row.model,
      operation: row.operation,
      hasSession: row.hasSession,
      transactionAttempt: row.transactionAttempt,
      queries: row.count,
      mongoCumulativeMs: row.totalMongoMs,
      maxMongoMs: row.maxMongoMs,
      rows: row.rows,
      queryShapeSamples: row.queryShapeSamples
    }))
    .sort((a, b) => b.queries - a.queries || b.mongoCumulativeMs - a.mongoCumulativeMs);
}

function safeDivide(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  if (!bottom) return null;
  return Number((top / bottom).toFixed(4));
}

function multiplierSummary(session, totalQueries) {
  const counters = session.counters || {};
  return {
    queriesPerSelectedOrder: safeDivide(totalQueries, counters.selectedOrderCount),
    queriesPerPendingOrder: safeDivide(totalQueries, counters.pendingOrderCount),
    queriesPerCriticalOrder: safeDivide(totalQueries, counters.criticalOrderCount),
    queriesPerArRow: safeDivide(totalQueries, counters.generatedArRowCount),
    queriesPerFundPath: safeDivide(totalQueries, counters.fundPathCount),
    queriesPerDebtReconcile: safeDivide(totalQueries, counters.debtReconcileCount)
  };
}

function classifyStatus(session, totalQueries) {
  if (session.errorClass) return 'FAILED_REQUEST';
  if (session.rawEventsTruncated) return 'TRUNCATED_DETAIL';
  if (Number.isFinite(session.apiMonitorDbQueries) && session.apiMonitorDbQueries !== null && session.apiMonitorDbQueries !== totalQueries) return 'PARTIAL_ATTRIBUTION';
  const env = clean(session.environment).toLowerCase();
  return env === 'production' || env === 'staging' ? 'MEASURED_PRODUCTION_RUNTIME' : 'MEASURED_LOCAL';
}

function buildSummary(session) {
  const totalMongoQueries = Array.from(session.aggregates.values()).reduce((sum, row) => sum + row.count, 0);
  const mongoCumulativeMs = Array.from(session.aggregates.values()).reduce((sum, row) => sum + row.totalMongoMs, 0);
  const requestWallMs = Math.max(0, Math.round((session.finishedMs || nowMs()) - session.startedMs));
  const apiQueries = Number.isFinite(session.apiMonitorDbQueries) ? session.apiMonitorDbQueries : null;
  const unattributedQueries = apiQueries == null ? null : Math.max(0, apiQueries - totalMongoQueries);
  const attributionCoverage = apiQueries == null ? null : Number((totalMongoQueries / Math.max(1, apiQueries)).toFixed(4));
  const status = classifyStatus(session, totalMongoQueries);
  return {
    phase: '242B',
    status,
    auditId: session.auditId,
    requestId: session.requestId,
    route: session.route,
    method: session.method,
    releaseId: session.releaseId,
    environment: session.environment,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    httpStatus: session.httpStatus,
    requestWallMs,
    transaction: {
      transactionAttemptCount: session.transactionAttemptCount,
      transactionRetryCount: Math.max(0, session.transactionAttemptCount - 1)
    },
    workload: clone(session.counters),
    queryTotals: {
      totalMongoQueries,
      mongoCumulativeMs,
      apiMonitorDbQueries: apiQueries,
      apiMonitorMongoMs: session.apiMonitorMongoMs,
      attributionCoverage,
      unattributedQueries,
      rawEventsRetained: session.rawEvents.length,
      rawEventsTruncated: session.rawEventsTruncated
    },
    stageSummary: stageSummaryFromSession(session),
    modelSummary: modelSummaryFromSession(session),
    operationSummary: operationSummaryFromSession(session),
    multipliers: multiplierSummary(session, totalMongoQueries),
    rawEvents: clone(session.rawEvents),
    errorClass: session.errorClass || '',
    limitations: [
      'In-memory closeout audit history resets on process restart.',
      'No raw request body, token, cookie, Mongo URI, order code, or customer data is stored.',
      'This is attribution evidence only; it is not an optimization recommendation.'
    ]
  };
}

function finalizeSession(session, options = {}) {
  if (!session || session.finished) return session ? buildSummary(session) : null;
  session.finished = true;
  session.finishedAt = nowIso();
  session.finishedMs = nowMs();
  session.httpStatus = Number(options.httpStatus || session.httpStatus || 0);
  if (options.errorClass) session.errorClass = clean(options.errorClass);
  const summary = buildSummary(session);
  session.status = summary.status;
  boundedPush(summary);
  return summary;
}

function errorClass(err = {}) {
  const code = clean(err.code || err.name);
  if (/VALIDATION|REQUIRED|NOT_FOUND|MISMATCH|INVALID/i.test(code)) return 'VALIDATION_ERROR';
  if (/TRANSACTION|SESSION|WRITE_CONFLICT|TRANSIENT/i.test(code)) return 'TRANSACTION_ERROR';
  if (/BLOCKED|GUARD|INVENTORY|IDEMPOTENCY/i.test(code)) return 'BUSINESS_GUARD_ERROR';
  return 'UNKNOWN_ERROR';
}

function withCloseoutAuditRequest(req, res, fn, env = process.env) {
  if (typeof fn !== 'function') throw new TypeError('fn is required');
  if (!isEnabled(env) || !isCloseoutRoute(req)) return fn();
  const context = getRequestContext();
  const session = createSession({ req, route: CLOSEOUT_ROUTE, env });
  const run = async () => {
    attachSession(session);
    try {
      const result = await fn();
      finalizeSession(session, { httpStatus: res && res.statusCode });
      return result;
    } catch (err) {
      finalizeSession(session, { httpStatus: res && res.statusCode, errorClass: errorClass(err) });
      throw err;
    }
  };
  if (context) return run();
  return runWithRequestContext({
    requestId: clean(req.requestId || req.id || ''),
    method: req.method,
    route: normalizeRoute(req),
    startedAt: Date.now()
  }, run);
}

function parseStageArgs(arg3 = {}, arg4 = process.env) {
  const looksLikeEnv = Object.prototype.hasOwnProperty.call(arg3 || {}, 'CLOSEOUT_QUERY_AUDIT_ENABLED')
    || Object.prototype.hasOwnProperty.call(arg3 || {}, 'NODE_ENV');
  return looksLikeEnv
    ? { metadata: {}, env: arg3 || process.env }
    : { metadata: arg3 && typeof arg3 === 'object' ? arg3 : {}, env: arg4 || process.env };
}

function withCloseoutAuditStage(stageName, fn, arg3 = {}, arg4 = process.env) {
  if (typeof fn !== 'function') throw new TypeError('fn is required');
  const { metadata, env } = parseStageArgs(arg3, arg4);
  if (!isEnabled(env)) return fn();
  const session = activeSession();
  if (!session) {
    const startedAt = Date.now();
    try {
      const result = fn();
      if (result && typeof result.then === 'function') {
        return result.then((value) => {
          boundedPush({ type: 'stage', stage: clean(stageName), ok: true, durationMs: Date.now() - startedAt }, env);
          return value;
        }, (err) => {
          boundedPush({ type: 'stage', stage: clean(stageName), ok: false, durationMs: Date.now() - startedAt, errorCode: clean(err && err.code) }, env);
          throw err;
        });
      }
      boundedPush({ type: 'stage', stage: clean(stageName), ok: true, durationMs: Date.now() - startedAt }, env);
      return result;
    } catch (err) {
      boundedPush({ type: 'stage', stage: clean(stageName), ok: false, durationMs: Date.now() - startedAt, errorCode: clean(err && err.code) }, env);
      throw err;
    }
  }
  const parentStage = session.stage;
  const parentPath = Array.isArray(session.stagePath) ? session.stagePath.slice() : [];
  const stage = sanitizeFieldName(stageName || 'stage');
  const startedAt = nowMs();
  session.stage = stage;
  session.stagePath = [...parentPath, stage];
  session.lastStage = stage;
  if (metadata && typeof metadata === 'object') updateCardinality(metadata);
  const complete = (ok, err = null) => {
    const current = session.stageWall.get(stage) || { stage, wallMs: 0, count: 0, errorCount: 0 };
    current.wallMs += Math.max(0, nowMs() - startedAt);
    current.count += 1;
    if (!ok) current.errorCount += 1;
    session.stageWall.set(stage, current);
    session.stage = parentStage;
    session.stagePath = parentPath;
    if (err) session.errorClass = session.errorClass || errorClass(err);
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then((value) => {
        complete(true);
        return value;
      }, (err) => {
        complete(false, err);
        throw err;
      });
    }
    complete(true);
    return result;
  } catch (err) {
    complete(false, err);
    throw err;
  }
}

function withCloseoutOrder(orderSequence, orderCount, fn) {
  if (typeof fn !== 'function') throw new TypeError('fn is required');
  const session = activeSession();
  if (!session || !isEnabled()) return fn();
  const previous = { orderSequence: session.orderSequence, orderCount: session.orderCount };
  session.orderSequence = Number(orderSequence || 0) || null;
  session.orderCount = Number(orderCount || 0) || 0;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        session.orderSequence = previous.orderSequence;
        session.orderCount = previous.orderCount;
      });
    }
    session.orderSequence = previous.orderSequence;
    session.orderCount = previous.orderCount;
    return result;
  } catch (err) {
    session.orderSequence = previous.orderSequence;
    session.orderCount = previous.orderCount;
    throw err;
  }
}

function withTransactionAttempt(fn) {
  if (typeof fn !== 'function') throw new TypeError('fn is required');
  const session = activeSession();
  if (!session || !isEnabled()) return fn();
  const previous = session.transactionAttempt;
  session.transactionAttemptCount += 1;
  session.transactionAttempt = session.transactionAttemptCount;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        session.transactionAttempt = previous;
      });
    }
    session.transactionAttempt = previous;
    return result;
  } catch (err) {
    session.transactionAttempt = previous;
    throw err;
  }
}

function normalizeDebtOutcome(value = '') {
  const text = clean(value).toUpperCase();
  if (['NO_DEBT_DELTA', 'IDEMPOTENT_SKIP', 'MANUAL_REVIEW', 'ADJUSTMENT_POSTED'].includes(text)) return text;
  return 'UNKNOWN';
}

function updateCardinality(payload = {}) {
  const session = activeSession();
  if (!session || !payload || typeof payload !== 'object') return;
  const counters = session.counters;
  const numberFields = [
    'selectedOrderCount',
    'alreadyConfirmedOrderCount',
    'pendingOrderCount',
    'criticalOrderCount',
    'returnOrderCount',
    'generatedArRowCount',
    'fundPathCount',
    'debtReconcileCount'
  ];
  for (const field of numberFields) {
    if (payload[field] === undefined) continue;
    counters[field] = Math.max(0, Math.round(Number(payload[field] || 0)));
  }
  if (payload.addGeneratedArRows !== undefined) counters.generatedArRowCount += Math.max(0, Math.round(Number(payload.addGeneratedArRows || 0)));
  if (payload.addFundPath !== undefined) counters.fundPathCount += Math.max(0, Math.round(Number(payload.addFundPath || 0)));
  if (payload.addDebtReconcile !== undefined) counters.debtReconcileCount += Math.max(0, Math.round(Number(payload.addDebtReconcile || 0)));
  if (payload.orderMetric && typeof payload.orderMetric === 'object') {
    const metric = payload.orderMetric;
    counters.orders.push({
      orderSequence: Number(metric.orderSequence || session.orderSequence || 0) || null,
      generatedArRowCount: Math.max(0, Math.round(Number(metric.generatedArRowCount || 0))),
      cashFundPathUsed: Boolean(metric.cashFundPathUsed),
      bankFundPathUsed: Boolean(metric.bankFundPathUsed),
      rewardOffsetUsed: Boolean(metric.rewardOffsetUsed),
      returnAmountUsed: Boolean(metric.returnAmountUsed),
      debtReconcileOutcome: normalizeDebtOutcome(metric.debtReconcileOutcome)
    });
    if (counters.orders.length > 200) counters.orders.splice(0, counters.orders.length - 200);
  }
}

function getCurrentAuditSummary() {
  const session = activeSession();
  return session ? buildSummary(session) : null;
}

function listAudits() {
  return {
    ok: true,
    enabled: isEnabled(),
    generatedAt: nowIso(),
    retained: history.length,
    historyLimit: historyLimit(),
    data: history.map((row) => ({
      auditId: row.auditId,
      status: row.status,
      route: row.route,
      releaseId: row.releaseId,
      environment: row.environment,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      httpStatus: row.httpStatus,
      selectedOrderCount: row.workload?.selectedOrderCount || 0,
      pendingOrderCount: row.workload?.pendingOrderCount || 0,
      totalMongoQueries: row.queryTotals?.totalMongoQueries || 0,
      mongoCumulativeMs: row.queryTotals?.mongoCumulativeMs || 0,
      requestWallMs: row.requestWallMs || 0,
      attributionCoverage: row.queryTotals?.attributionCoverage
    }))
  };
}

function getAudit(auditId = '') {
  const target = clean(auditId);
  for (const row of history) {
    if (clean(row.auditId) === target) return clone(row);
  }
  return null;
}

function exportMarkdown(data = null) {
  const row = data || history[0] || null;
  if (!row) return '# Phase242B Closeout Query Audit\n\nNo closeout audit evidence has been captured.\n';
  const lines = [
    '# Phase242B Closeout Query Audit Evidence',
    '',
    `- Status: ${row.status}`,
    `- Audit ID: ${row.auditId}`,
    `- Route: ${row.method || 'POST'} ${row.route}`,
    `- Release: ${row.releaseId}`,
    `- Environment: ${row.environment}`,
    `- Started: ${row.startedAt}`,
    `- Finished: ${row.finishedAt}`,
    `- Request wall ms: ${row.requestWallMs}`,
    `- Total Mongo queries: ${row.queryTotals.totalMongoQueries}`,
    `- API Monitor DB queries: ${row.queryTotals.apiMonitorDbQueries ?? ''}`,
    `- Attribution coverage: ${row.queryTotals.attributionCoverage ?? ''}`,
    '',
    '## Request workload',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| selectedOrderCount | ${row.workload.selectedOrderCount || 0} |`,
    `| alreadyConfirmedOrderCount | ${row.workload.alreadyConfirmedOrderCount || 0} |`,
    `| pendingOrderCount | ${row.workload.pendingOrderCount || 0} |`,
    `| criticalOrderCount | ${row.workload.criticalOrderCount || 0} |`,
    `| returnOrderCount | ${row.workload.returnOrderCount || 0} |`,
    `| generatedArRowCount | ${row.workload.generatedArRowCount || 0} |`,
    `| fundPathCount | ${row.workload.fundPathCount || 0} |`,
    `| debtReconcileCount | ${row.workload.debtReconcileCount || 0} |`,
    '',
    '## Query by model',
    '',
    '| Model | Queries | Mongo cumulative ms | Max ms |',
    '|---|---:|---:|---:|',
    ...(row.modelSummary || []).map((item) => `| ${item.model} | ${item.queries} | ${item.mongoCumulativeMs} | ${item.maxMongoMs} |`),
    '',
    '## Query by stage',
    '',
    '| Stage | Queries | Mongo cumulative ms | Stage wall ms |',
    '|---|---:|---:|---:|',
    ...(row.stageSummary || []).map((item) => `| ${item.stage} | ${item.queries} | ${item.mongoCumulativeMs} | ${item.stageWallMs || 0} |`),
    '',
    '## Query by operation',
    '',
    '| Model | Operation | Stage | Queries | Mongo ms |',
    '|---|---|---|---:|---:|',
    ...(row.operationSummary || []).slice(0, 100).map((item) => `| ${item.model} | ${item.operation} | ${item.stage} | ${item.queries} | ${item.mongoCumulativeMs} |`),
    '',
    '## Transaction attempts',
    '',
    `- Attempts: ${row.transaction.transactionAttemptCount}`,
    `- Retries: ${row.transaction.transactionRetryCount}`,
    '',
    '## Multipliers',
    '',
    '| Metric | Value |',
    '|---|---:|',
    ...Object.entries(row.multipliers || {}).map(([key, value]) => `| ${key} | ${value == null ? '' : value} |`),
    '',
    '## Top query groups',
    '',
    '| Stage | Model | Operation | Queries | Mongo ms |',
    '|---|---|---|---:|---:|',
    ...(row.operationSummary || []).slice(0, 20).map((item) => `| ${item.stage} | ${item.model} | ${item.operation} | ${item.queries} | ${item.mongoCumulativeMs} |`),
    '',
    'Limitations: no raw order code, customer data, token, cookie, Mongo URI, request body, or raw query values are exported.'
  ];
  return `${lines.join('\n')}\n`;
}

function exportAudit(auditId = '') {
  const row = auditId ? getAudit(auditId) : clone(history[0]);
  if (!row) {
    return {
      ok: true,
      status: 'STATIC_ONLY',
      data: null,
      markdown: exportMarkdown(null)
    };
  }
  return {
    ok: true,
    status: row.status,
    data: row,
    markdown: exportMarkdown(row)
  };
}

function clearHistory() {
  history.splice(0, history.length);
  return { ok: true, success: true, clearedAt: nowIso(), message: 'Closeout query audit history cleared' };
}

function writerSafetyMap() {
  return clone(WRITER_SAFETY_MAP);
}

function snapshot() {
  return clone(history);
}

function resetForTests() {
  history.length = 0;
}

module.exports = {
  CLOSEOUT_ROUTE,
  isEnabled,
  queryFingerprint,
  recordQuery,
  observeMongoQueryEvent,
  recordApiMonitorSnapshot,
  withCloseoutAuditRequest,
  withCloseoutAuditStage,
  withCloseoutOrder,
  withTransactionAttempt,
  updateCardinality,
  getCurrentAuditSummary,
  listAudits,
  getAudit,
  exportAudit,
  exportMarkdown,
  clearHistory,
  writerSafetyMap,
  snapshot,
  resetForTests,
  _internal: {
    historyLimit,
    maxRawEvents,
    fieldShape,
    pipelineShape,
    createSession,
    attachSession,
    buildSummary,
    sanitizeLabel,
    safeDivide
  }
};
