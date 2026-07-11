'use strict';

const { AsyncLocalStorage } = require('async_hooks');
const performanceTelemetry = require('../observability/performanceTelemetry');
let mongoose = null;
try {
  mongoose = require('mongoose');
} catch (err) {
  mongoose = null;
}

const apiMonitorStore = new AsyncLocalStorage();
let mongooseApiMonitorPatched = false;

const DEFAULT_SLOW_MS = Number(process.env.API_MONITOR_SLOW_MS || 1000);
const MAX_RECENT_SLOW = Number(process.env.API_MONITOR_MAX_SLOW || 200);
const MAX_ROUTE_STATS = Number(process.env.API_MONITOR_MAX_ROUTES || 500);
const MAX_QUERY_TRACES_PER_API = Number(process.env.API_MONITOR_MAX_QUERY_TRACES_PER_API || 50);
const MAX_QUERY_TRACE_LABEL = Number(process.env.API_MONITOR_MAX_QUERY_TRACE_LABEL || 240);
const MAX_LATENCY_SAMPLES = Math.max(20, Math.min(Number(process.env.API_MONITOR_SAMPLE_SIZE || 200), 2000));

const apiStats = new Map();
const recentSlowApis = [];

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}


function percentile(values = [], ratio = 0.5) {
  if (!Array.isArray(values) || !values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return Math.round(sorted[index] || 0);
}

function compactJson(value, maxLength = MAX_QUERY_TRACE_LABEL) {
  try {
    const text = JSON.stringify(value || {});
    if (!text) return '';
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch (err) {
    return '';
  }
}

function maskTraceValue(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (text.length <= 4) return `${text.slice(0, 1)}***(${text.length})`;
  return `${text.slice(0, 2)}***${text.slice(-2)}(${text.length})`;
}

const ORDER_KEY_FIELDS = new Set([
  'salesOrderId',
  'salesOrderCode',
  'orderId',
  'orderCode',
  'sourceOrderId',
  'sourceOrderCode',
  'refId',
  'refCode',
  'erpDeliveryReturnKey'
]);

function isDirtyOrderInputKey(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return false;
  // Khóa nghiệp vụ hợp lệ trong V45 chỉ nên là SO... hoặc HU...
  // Các chuỗi nhị phân/rác kiểu "j �b�d-?oP..." sẽ bị đánh dấu đỏ.
  return !/^(SO|HU)\d+$/i.test(text);
}

function pushOrderInputValue(result, value) {
  if (value == null) return;
  if (Array.isArray(value)) {
    value.forEach((item) => pushOrderInputValue(result, item));
    return;
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.$in)) {
      value.$in.forEach((item) => pushOrderInputValue(result, item));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(value, '$eq')) {
      pushOrderInputValue(result, value.$eq);
      return;
    }
    return;
  }
  const text = String(value).trim();
  if (!text) return;
  const masked = maskTraceValue(text);
  if (masked && !result.inputKeys.includes(masked)) result.inputKeys.push(masked);
  if (isDirtyOrderInputKey(text) && masked && !result.dirtyInputKeys.includes(masked)) {
    result.dirtyInputKeys.push(masked);
  }
}

function collectOrderInputKeys(query, result = { inputKeys: [], dirtyInputKeys: [] }) {
  if (!query || typeof query !== 'object') return result;
  if (Array.isArray(query)) {
    query.forEach((item) => collectOrderInputKeys(item, result));
    return result;
  }

  Object.entries(query).forEach(([key, value]) => {
    if (ORDER_KEY_FIELDS.has(key)) {
      pushOrderInputValue(result, value);
      return;
    }
    if (key === '$or' || key === '$and' || key === '$nor') {
      collectOrderInputKeys(value, result);
      return;
    }
    if (value && typeof value === 'object') {
      collectOrderInputKeys(value, result);
    }
  });

  result.inputKeys = result.inputKeys.slice(0, 50);
  result.dirtyInputKeys = result.dirtyInputKeys.slice(0, 50);
  return result;
}

function resultRows(result) {
  if (Array.isArray(result)) return result.length;
  if (result && Array.isArray(result.docs)) return result.docs.length;
  if (result && Array.isArray(result.data)) return result.data.length;
  if (result && typeof result === 'object' && typeof result.modifiedCount === 'number') return result.modifiedCount;
  if (result && typeof result === 'object' && typeof result.matchedCount === 'number') return result.matchedCount;
  if (typeof result === 'number') return result;
  return 0;
}

function collectFieldNames(value, result = new Set(), depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return result;
  if (Array.isArray(value)) {
    value.slice(0, 8).forEach((item) => collectFieldNames(item, result, depth + 1));
    return result;
  }
  Object.entries(value).forEach(([key, child]) => {
    if (!key.startsWith('$')) result.add(key);
    if (child && typeof child === 'object') collectFieldNames(child, result, depth + 1);
  });
  return result;
}

function describeQueryShape(ctx, model, op) {
  if (typeof ctx?.getQuery === 'function') {
    const query = ctx.getQuery();
    const fields = Array.from(collectFieldNames(query)).sort().slice(0, 12);
    const flags = [];
    const options = typeof ctx.getOptions === 'function' ? ctx.getOptions() : {};
    if (options && Object.prototype.hasOwnProperty.call(options, 'limit')) flags.push('limit');
    if (ctx._fields && Object.keys(ctx._fields).length) flags.push('projection');
    return {
      label: `${model}.${op} fields=[${fields.join(',') || '-'}]${flags.length ? ` flags=[${flags.join(',')}]` : ''}`,
      input: collectOrderInputKeys(query)
    };
  }
  if (Array.isArray(ctx?._pipeline)) {
    const stages = ctx._pipeline.slice(0, 12).map((stage) => Object.keys(stage || {})[0] || 'stage');
    return {
      label: `${model}.${op} stages=[${stages.join(',') || '-'}]`,
      input: collectOrderInputKeys(ctx._pipeline)
    };
  }
  return {
    label: `${model}.${op}`,
    input: { inputKeys: [], dirtyInputKeys: [] }
  };
}

function describeMongooseExec(ctx) {
  try {
    const collection = ctx?.mongooseCollection?.name || ctx?.model?.collection?.name || ctx?._model?.collection?.name || ctx?.collection?.name || '';
    const model = ctx?.model?.modelName || ctx?._model?.modelName || collection || 'Mongo';
    const op = ctx?.op || (ctx?._pipeline ? 'aggregate' : 'query');
    const shape = describeQueryShape(ctx, model, op);
    const label = shape.label;
    const inputKeys = shape.input.inputKeys || [];
    const dirtyInputKeys = shape.input.dirtyInputKeys || [];
    return {
      label: label.length > MAX_QUERY_TRACE_LABEL ? `${label.slice(0, MAX_QUERY_TRACE_LABEL)}...` : label,
      inputKeys,
      dirtyInputKeys,
      hasDirtyInputKeys: dirtyInputKeys.length > 0,
      collection,
      operation: op
    };
  } catch (err) {
    return { label: 'Mongo.query', inputKeys: [], dirtyInputKeys: [], hasDirtyInputKeys: false };
  }
}

function pushQueryTrace(store, trace) {
  if (!store || !trace) return;
  store.queryTraces = Array.isArray(store.queryTraces) ? store.queryTraces : [];
  store.queryTraces.push(trace);
  if (store.queryTraces.length > MAX_QUERY_TRACES_PER_API) {
    store.queryTraces.splice(0, store.queryTraces.length - MAX_QUERY_TRACES_PER_API);
  }
}


function getActiveMetric() {
  return apiMonitorStore.getStore() || null;
}

function addMongoMetric(ms, trace = null) {
  const store = getActiveMetric();
  if (!store) return;
  store.dbQueries += 1;
  store.mongoMs += ms;
  if (trace) pushQueryTrace(store, trace);
}

function patchMongooseApiMonitor() {
  if (!mongoose || mongooseApiMonitorPatched) return;
  mongooseApiMonitorPatched = true;

  const patchExec = (proto) => {
    if (!proto || typeof proto.exec !== 'function' || proto.exec.__apiMonitorPatched) return;
    const originalExec = proto.exec;
    function monitoredExec(...args) {
      const started = nowMs();
      const queryInfo = describeMongooseExec(this);
      const finalizeTrace = (result, err = null) => {
        const ms = Math.round(nowMs() - started);
        addMongoMetric(ms, {
          label: queryInfo.label,
          inputKeys: queryInfo.inputKeys || [],
          dirtyInputKeys: queryInfo.dirtyInputKeys || [],
          hasDirtyInputKeys: !!queryInfo.hasDirtyInputKeys,
          ms,
          rows: resultRows(result),
          error: err ? (err.message || String(err)) : undefined
        });
      };
      try {
        const result = originalExec.apply(this, args);
        if (result && typeof result.then === 'function') {
          return result.then((value) => {
            finalizeTrace(value);
            return value;
          }, (err) => {
            finalizeTrace(null, err);
            throw err;
          });
        }
        finalizeTrace(result);
        return result;
      } catch (err) {
        finalizeTrace(null, err);
        throw err;
      }
    }
    monitoredExec.__apiMonitorPatched = true;
    proto.exec = monitoredExec;
  };

  patchExec(mongoose.Query && mongoose.Query.prototype);
  patchExec(mongoose.Aggregate && mongoose.Aggregate.prototype);
}

patchMongooseApiMonitor();

function normalizePath(req) {
  const base = req.baseUrl || '';
  const routePath = req.route && req.route.path ? String(req.route.path) : '';
  if (base && routePath && routePath !== '/') return `${base}${routePath}`.replace(/\/+/g, '/');
  return (req.path || req.originalUrl || req.url || '').split('?')[0];
}

function moduleName(pathname = '') {
  const p = String(pathname || '').toLowerCase();
  if (p.includes('/mobile/delivery')) return 'App giao hàng';
  if (p.includes('/mobile/sales')) return 'App bán hàng';
  if (p.includes('/mobile')) return 'Mobile';
  if (p.includes('/sales-orders') || p.includes('/orders')) return 'Bán hàng';
  if (p.includes('/master-orders') || p.includes('/delivery-today')) return 'Đơn tổng / giao hàng';
  if (p.includes('/return') || p.includes('/returns')) return 'Trả hàng';
  if (p.includes('/receipts') || p.includes('/debt') || p.includes('/ar-ledger') || p.includes('/ar')) return 'Công nợ';
  if (p.includes('/cashbook') || p.includes('/bankbook') || p.includes('/fund')) return 'Quỹ tiền';
  if (p.includes('/products') || p.includes('/catalog/products')) return 'Sản phẩm';
  if (p.includes('/customers') || p.includes('/catalog/customers')) return 'Khách hàng';
  if (p.includes('/users') || p.includes('/staff')) return 'Tài khoản / nhân viên';
  if (p.includes('/promotions')) return 'Khuyến mại';
  if (p.includes('/import') || p.includes('/export')) return 'Import / Export';
  if (p.includes('/reports')) return 'Báo cáo';
  if (p.includes('/print')) return 'In phiếu';
  if (p.includes('/search')) return 'Tìm kiếm';
  if (p.includes('/system')) return 'Hệ thống';
  return 'Khác';
}

function countRows(data) {
  if (!data || typeof data !== 'object') return Array.isArray(data) ? data.length : 0;
  if (Array.isArray(data)) return data.length;
  const keys = ['data', 'items', 'rows', 'orders', 'customers', 'products', 'receipts', 'ledgers', 'results'];
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key].length;
  }
  if (data.data && typeof data.data === 'object') {
    for (const key of keys) {
      if (Array.isArray(data.data[key])) return data.data[key].length;
    }
  }
  return 0;
}

function shouldMeasure(req) {
  const path = req.path || req.originalUrl || req.url || '';
  if (!path.startsWith('/api/')) return false;
  if (path.startsWith('/api/health')) return false;
  if (path.startsWith('/api/docs')) return false;
  if (path.startsWith('/api/swagger')) return false;
  if (path.startsWith('/api/system/api-monitor')) return false;
  return true;
}

function recordMetric(metric) {
  const key = `${metric.method} ${metric.path}`;
  if (!apiStats.has(key) && apiStats.size >= MAX_ROUTE_STATS) {
    const firstKey = apiStats.keys().next().value;
    if (firstKey) apiStats.delete(firstKey);
  }
  const current = apiStats.get(key) || {
    route: key,
    method: metric.method,
    path: metric.path,
    module: metric.module,
    count: 0,
    totalMs: 0,
    maxMs: 0,
    minMs: null,
    slowCount: 0,
    errorCount: 0,
    lastMs: 0,
    lastMongoMs: 0,
    lastJsMs: 0,
    lastDbQueries: 0,
    totalMongoMs: 0,
    totalJsMs: 0,
    totalDbQueries: 0,
    maxMongoMs: 0,
    maxJsMs: 0,
    maxDbQueries: 0,
    totalRows: 0,
    maxRows: 0,
    totalResponseBytes: 0,
    maxResponseBytes: 0,
    responseBytesKnown: 0,
    lastRows: 0,
    lastStatus: 0,
    lastAt: null,
    lastOriginalUrl: '',
    maxOriginalUrl: '',
    lastQueryTraces: [],
    maxQueryTraces: [],
    slowestQueryLabel: '',
    slowestQueryMs: 0,
    latencySamples: [],
    recentTimestamps: [],
    maxConcurrentObserved: 0,
    statusCounts: {}
  };

  current.count += 1;
  current.latencySamples = Array.isArray(current.latencySamples) ? current.latencySamples : [];
  current.latencySamples.push(metric.ms);
  if (current.latencySamples.length > MAX_LATENCY_SAMPLES) current.latencySamples.splice(0, current.latencySamples.length - MAX_LATENCY_SAMPLES);
  current.statusCounts = current.statusCounts || {};
  current.statusCounts[metric.statusCode] = (current.statusCounts[metric.statusCode] || 0) + 1;
  current.recentTimestamps = Array.isArray(current.recentTimestamps) ? current.recentTimestamps : [];
  const metricAt = Date.now();
  current.recentTimestamps.push(metricAt);
  while (current.recentTimestamps.length && current.recentTimestamps[0] < metricAt - 5 * 60 * 1000) current.recentTimestamps.shift();
  if (current.recentTimestamps.length > MAX_LATENCY_SAMPLES * 5) {
    current.recentTimestamps.splice(0, current.recentTimestamps.length - MAX_LATENCY_SAMPLES * 5);
  }
  current.maxConcurrentObserved = Math.max(current.maxConcurrentObserved || 0, metric.activeRequests || 0);
  current.totalMs += metric.ms;
  current.totalMongoMs += metric.mongoMs || 0;
  current.totalJsMs += metric.jsMs || 0;
  current.totalDbQueries += metric.dbQueries || 0;
  current.maxMs = Math.max(current.maxMs || 0, metric.ms);
  current.minMs = current.minMs == null ? metric.ms : Math.min(current.minMs, metric.ms);
  current.lastMs = metric.ms;
  current.lastMongoMs = metric.mongoMs || 0;
  current.lastJsMs = metric.jsMs || 0;
  current.lastDbQueries = metric.dbQueries || 0;
  current.maxMongoMs = Math.max(current.maxMongoMs || 0, metric.mongoMs || 0);
  current.maxJsMs = Math.max(current.maxJsMs || 0, metric.jsMs || 0);
  current.maxDbQueries = Math.max(current.maxDbQueries || 0, metric.dbQueries || 0);
  current.totalRows += metric.rows || 0;
  current.maxRows = Math.max(current.maxRows || 0, metric.rows || 0);
  if (metric.contentLength > 0) {
    current.totalResponseBytes += metric.contentLength;
    current.responseBytesKnown += 1;
    current.maxResponseBytes = Math.max(current.maxResponseBytes || 0, metric.contentLength);
  }
  current.lastRows = metric.rows;
  current.lastStatus = metric.statusCode;
  current.lastAt = metric.at;
  current.lastOriginalUrl = metric.originalUrl;
  current.lastQueryTraces = Array.isArray(metric.queryTraces) ? metric.queryTraces : [];
  const slowestQuery = current.lastQueryTraces.slice().sort((a, b) => (b.ms || 0) - (a.ms || 0))[0] || null;
  current.lastSlowestQueryMs = slowestQuery ? (slowestQuery.ms || 0) : 0;
  current.lastSlowestQueryLabel = slowestQuery ? (slowestQuery.label || '') : '';
  if (slowestQuery && (slowestQuery.ms || 0) >= (current.slowestQueryMs || 0)) {
    current.slowestQueryMs = slowestQuery.ms || 0;
    current.slowestQueryLabel = slowestQuery.label || '';
  }
  current.module = metric.module;
  if (metric.ms >= metric.slowMs) current.slowCount += 1;
  if (metric.statusCode >= 400) current.errorCount += 1;
  if (current.maxMs === metric.ms) {
    current.maxOriginalUrl = metric.originalUrl;
    current.maxQueryTraces = Array.isArray(metric.queryTraces) ? metric.queryTraces : [];
  }
  apiStats.set(key, current);

  if (metric.ms >= metric.slowMs || metric.statusCode >= 500) {
    recentSlowApis.unshift(metric);
    if (recentSlowApis.length > MAX_RECENT_SLOW) recentSlowApis.pop();
  }
}

function apiMonitor(req, res, next) {
  if (!shouldMeasure(req)) return next();

  patchMongooseApiMonitor();
  const startedAt = nowMs();
  const metricStore = { mongoMs: 0, dbQueries: 0, queryTraces: [] };
  const originalJson = res.json.bind(res);
  let responseRows = 0;

  res.json = (body) => {
    const ms = Math.round(nowMs() - startedAt);
    const mongoMs = Math.round(metricStore.mongoMs || 0);
    const dbQueries = Math.round(metricStore.dbQueries || 0);
    const jsMs = Math.max(0, ms - mongoMs);
    responseRows = countRows(body);
    res.set('X-Response-Time-Ms', String(ms));
    res.set('X-Mongo-Time-Ms', String(mongoMs));
    res.set('X-JS-Time-Ms', String(jsMs));
    res.set('X-DB-Queries', String(dbQueries));
    res.set('X-API-Monitor', '1');
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      body.perf = {
        ...(body.perf && typeof body.perf === 'object' ? body.perf : {}),
        serverMs: body.perf?.serverMs ?? ms,
        mongoMs: body.perf?.mongoMs ?? mongoMs,
        jsMs: body.perf?.jsMs ?? jsMs,
        dbQueries: body.perf?.dbQueries ?? dbQueries,
        rows: body.perf?.rows ?? responseRows,
        slowestQuery: body.perf?.slowestQuery ?? (metricStore.queryTraces || []).slice().sort((a, b) => (b.ms || 0) - (a.ms || 0))[0] ?? null
      };
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    const ms = Math.round(nowMs() - startedAt);
    const mongoMs = Math.round(metricStore.mongoMs || 0);
    const dbQueries = Math.round(metricStore.dbQueries || 0);
    const jsMs = Math.max(0, ms - mongoMs);
    const path = normalizePath(req);
    const slowMs = DEFAULT_SLOW_MS;
    const metric = {
      at: new Date().toISOString(),
      method: req.method,
      path,
      originalUrl: path,
      requestId: req.requestId || '',
      module: moduleName(path),
      statusCode: res.statusCode,
      ms,
      mongoMs,
      jsMs,
      dbQueries,
      rows: responseRows,
      queryTraces: Array.isArray(metricStore.queryTraces) ? metricStore.queryTraces.slice().sort((a, b) => (b.ms || 0) - (a.ms || 0)) : [],
      slowMs,
      contentLength: Number(res.getHeader('content-length') || 0),
      activeRequests: performanceTelemetry._private.counters.activeRequests
    };
    recordMetric(metric);

    const logPayload = {
      requestId: metric.requestId,
      method: metric.method,
      route: metric.path,
      path: metric.path,
      module: metric.module,
      statusCode: metric.statusCode,
      serverMs: metric.ms,
      mongoMs: metric.mongoMs,
      jsMs: metric.jsMs,
      dbQueries: metric.dbQueries,
      rows: metric.rows,
      contentLength: metric.contentLength,
      slowestQuery: metric.queryTraces && metric.queryTraces[0] ? {
        label: metric.queryTraces[0].label,
        ms: metric.queryTraces[0].ms,
        rows: metric.queryTraces[0].rows
      } : null
    };
    if (metric.ms >= slowMs || metric.statusCode >= 500) {
      req.log?.warn(logPayload, '[API_SLOW]');
    } else if (process.env.API_PERF_LOG !== '0') {
      req.log?.info(logPayload, '[API_PERF]');
    }
  });

  apiMonitorStore.run(metricStore, next);
}

function getApiMonitorReport({ limit = 100, slowOnly = false, module = '' } = {}) {
  const now = Date.now();
  const rows = Array.from(apiStats.values()).map((s) => ({
    route: s.route,
    method: s.method,
    path: s.path,
    module: s.module,
    count: s.count,
    avgMs: Math.round(s.totalMs / Math.max(1, s.count)),
    p50Ms: percentile(s.latencySamples, 0.5),
    p95Ms: percentile(s.latencySamples, 0.95),
    p99Ms: percentile(s.latencySamples, 0.99),
    errorRate: Number(((s.errorCount || 0) / Math.max(1, s.count)).toFixed(4)),
    slowRate: Number(((s.slowCount || 0) / Math.max(1, s.count)).toFixed(4)),
    avgMongoMs: Math.round((s.totalMongoMs || 0) / Math.max(1, s.count)),
    avgJsMs: Math.round((s.totalJsMs || 0) / Math.max(1, s.count)),
    avgDbQueries: Math.round((s.totalDbQueries || 0) / Math.max(1, s.count)),
    avgRows: Math.round((s.totalRows || 0) / Math.max(1, s.count)),
    maxRows: s.maxRows || 0,
    avgResponseBytes: s.responseBytesKnown ? Math.round((s.totalResponseBytes || 0) / Math.max(1, s.responseBytesKnown)) : null,
    maxResponseBytes: s.maxResponseBytes || 0,
    last1mCount: (Array.isArray(s.recentTimestamps) ? s.recentTimestamps : []).filter((at) => at >= now - 60 * 1000).length,
    last5mCount: (Array.isArray(s.recentTimestamps) ? s.recentTimestamps : []).filter((at) => at >= now - 5 * 60 * 1000).length,
    maxConcurrentObserved: s.maxConcurrentObserved || 0,
    maxMs: s.maxMs,
    maxMongoMs: s.maxMongoMs || 0,
    maxJsMs: s.maxJsMs || 0,
    maxDbQueries: s.maxDbQueries || 0,
    minMs: s.minMs || 0,
    lastMs: s.lastMs,
    lastMongoMs: s.lastMongoMs || 0,
    lastJsMs: s.lastJsMs || 0,
    lastDbQueries: s.lastDbQueries || 0,
    lastRows: s.lastRows,
    lastStatus: s.lastStatus,
    lastAt: s.lastAt,
    lastOriginalUrl: s.lastOriginalUrl,
    maxOriginalUrl: s.maxOriginalUrl,
    slowestQueryLabel: s.slowestQueryLabel || '',
    slowestQueryMs: s.slowestQueryMs || 0,
    lastSlowestQueryLabel: s.lastSlowestQueryLabel || '',
    lastSlowestQueryMs: s.lastSlowestQueryMs || 0,
    lastQueryTraces: Array.isArray(s.lastQueryTraces) ? s.lastQueryTraces : [],
    maxQueryTraces: Array.isArray(s.maxQueryTraces) ? s.maxQueryTraces : [],
    slowCount: s.slowCount,
    errorCount: s.errorCount,
    statusCounts: { ...(s.statusCounts || {}) },
    statusClassCounts: {
      '2xx': Object.entries(s.statusCounts || {}).reduce((sum, [code, count]) => Number(code) >= 200 && Number(code) < 300 ? sum + count : sum, 0),
      '3xx': Object.entries(s.statusCounts || {}).reduce((sum, [code, count]) => Number(code) >= 300 && Number(code) < 400 ? sum + count : sum, 0),
      '4xx': Object.entries(s.statusCounts || {}).reduce((sum, [code, count]) => Number(code) >= 400 && Number(code) < 500 ? sum + count : sum, 0),
      '5xx': Object.entries(s.statusCounts || {}).reduce((sum, [code, count]) => Number(code) >= 500 ? sum + count : sum, 0)
    },
    status: s.slowCount > 0 || s.maxMs >= DEFAULT_SLOW_MS ? 'slow' : 'ok'
  }))
    .filter((row) => (slowOnly ? row.slowCount > 0 || row.maxMs >= DEFAULT_SLOW_MS : true))
    .filter((row) => (module ? row.module === module : true))
    .sort((a, b) => (b.maxMs - a.maxMs) || (b.avgMs - a.avgMs));

  const topSlowestApis = rows.slice().sort((a, b) => (b.maxMs - a.maxMs) || (b.avgMs - a.avgMs)).slice(0, 30);
  const topCalledApis = rows.slice().sort((a, b) => (b.count - a.count) || (b.maxMs - a.maxMs)).slice(0, 30);
  const topRowsApis = rows.slice().sort((a, b) => (b.maxRows - a.maxRows) || (b.avgRows - a.avgRows) || (b.lastRows - a.lastRows)).slice(0, 30);
  const topQueryTraceApis = rows.slice().sort((a, b) => (b.slowestQueryMs - a.slowestQueryMs) || (b.maxMongoMs - a.maxMongoMs)).slice(0, 30);

  const slowRows = rows.filter((row) => row.status === 'slow');
  const summary = {
    totalRoutes: apiStats.size,
    totalCalls: Array.from(apiStats.values()).reduce((sum, s) => sum + s.count, 0),
    slowRoutes: slowRows.length,
    slowCalls: Array.from(apiStats.values()).reduce((sum, s) => sum + s.slowCount, 0),
    errorCalls: Array.from(apiStats.values()).reduce((sum, s) => sum + s.errorCount, 0),
    slowMs: DEFAULT_SLOW_MS,
    totalMongoMs: Array.from(apiStats.values()).reduce((sum, s) => sum + (s.totalMongoMs || 0), 0),
    totalJsMs: Array.from(apiStats.values()).reduce((sum, s) => sum + (s.totalJsMs || 0), 0),
    totalDbQueries: Array.from(apiStats.values()).reduce((sum, s) => sum + (s.totalDbQueries || 0), 0),
    activeRequests: performanceTelemetry._private.counters.activeRequests,
    maxActiveRequests: performanceTelemetry._private.counters.maxActiveRequests,
    generatedAt: new Date().toISOString()
  };

  const moduleStats = Array.from(apiStats.values()).reduce((acc, s) => {
    const key = s.module || 'Khác';
    acc[key] = acc[key] || { module: key, count: 0, totalMs: 0, totalMongoMs: 0, totalJsMs: 0, totalDbQueries: 0, maxMs: 0, maxMongoMs: 0, slowCount: 0, errorCount: 0, routes: 0, latencySamples: [] };
    acc[key].count += s.count;
    acc[key].totalMs += s.totalMs;
    acc[key].totalMongoMs += s.totalMongoMs || 0;
    acc[key].totalJsMs += s.totalJsMs || 0;
    acc[key].totalDbQueries += s.totalDbQueries || 0;
    acc[key].maxMs = Math.max(acc[key].maxMs, s.maxMs || 0);
    acc[key].maxMongoMs = Math.max(acc[key].maxMongoMs, s.maxMongoMs || 0);
    acc[key].slowCount += s.slowCount || 0;
    acc[key].errorCount += s.errorCount || 0;
    acc[key].latencySamples.push(...(Array.isArray(s.latencySamples) ? s.latencySamples : []));
    if (acc[key].latencySamples.length > MAX_LATENCY_SAMPLES * 4) acc[key].latencySamples.splice(0, acc[key].latencySamples.length - MAX_LATENCY_SAMPLES * 4);
    acc[key].routes += 1;
    return acc;
  }, {});

  return {
    ok: true,
    success: true,
    summary,
    modules: Object.values(moduleStats).map((x) => ({
      ...x,
      avgMs: Math.round(x.totalMs / Math.max(1, x.count)),
      avgMongoMs: Math.round((x.totalMongoMs || 0) / Math.max(1, x.count)),
      avgJsMs: Math.round((x.totalJsMs || 0) / Math.max(1, x.count)),
      avgDbQueries: Math.round((x.totalDbQueries || 0) / Math.max(1, x.count)),
      p50Ms: percentile(x.latencySamples, 0.5),
      p95Ms: percentile(x.latencySamples, 0.95),
      p99Ms: percentile(x.latencySamples, 0.99),
      errorRate: Number(((x.errorCount || 0) / Math.max(1, x.count)).toFixed(4)),
      latencySamples: undefined
    })).sort((a, b) => b.maxMs - a.maxMs),
    data: rows.slice(0, Math.max(1, Math.min(Number(limit) || 100, 500))),
    topSlowestApis,
    topCalledApis,
    topRowsApis,
    topQueryTraceApis,
    slowApis: recentSlowApis.slice(0, 100)
  };
}

function resetApiMonitor() {
  apiStats.clear();
  recentSlowApis.splice(0, recentSlowApis.length);
  return { ok: true, success: true, message: 'Đã xóa thống kê API Monitor', resetAt: new Date().toISOString() };
}

module.exports = {
  apiMonitor,
  apiStats,
  getApiMonitorReport,
  resetApiMonitor,
  percentile
};
