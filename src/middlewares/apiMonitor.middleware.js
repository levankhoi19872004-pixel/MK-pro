'use strict';

const DEFAULT_SLOW_MS = Number(process.env.API_MONITOR_SLOW_MS || 1000);
const MAX_RECENT_SLOW = Number(process.env.API_MONITOR_MAX_SLOW || 200);
const MAX_ROUTE_STATS = Number(process.env.API_MONITOR_MAX_ROUTES || 500);

const apiStats = new Map();
const recentSlowApis = [];

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

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
    lastRows: 0,
    lastStatus: 0,
    lastAt: null,
    lastOriginalUrl: '',
    maxOriginalUrl: ''
  };

  current.count += 1;
  current.totalMs += metric.ms;
  current.maxMs = Math.max(current.maxMs || 0, metric.ms);
  current.minMs = current.minMs == null ? metric.ms : Math.min(current.minMs, metric.ms);
  current.lastMs = metric.ms;
  current.lastRows = metric.rows;
  current.lastStatus = metric.statusCode;
  current.lastAt = metric.at;
  current.lastOriginalUrl = metric.originalUrl;
  current.module = metric.module;
  if (metric.ms >= metric.slowMs) current.slowCount += 1;
  if (metric.statusCode >= 400) current.errorCount += 1;
  if (current.maxMs === metric.ms) current.maxOriginalUrl = metric.originalUrl;
  apiStats.set(key, current);

  if (metric.ms >= metric.slowMs || metric.statusCode >= 500) {
    recentSlowApis.unshift(metric);
    if (recentSlowApis.length > MAX_RECENT_SLOW) recentSlowApis.pop();
  }
}

function apiMonitor(req, res, next) {
  if (!shouldMeasure(req)) return next();

  const startedAt = nowMs();
  const originalJson = res.json.bind(res);
  let responseRows = 0;

  res.json = (body) => {
    const ms = Math.round(nowMs() - startedAt);
    responseRows = countRows(body);
    res.set('X-Response-Time-Ms', String(ms));
    res.set('X-API-Monitor', '1');
    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      body.perf = {
        ...(body.perf && typeof body.perf === 'object' ? body.perf : {}),
        serverMs: body.perf?.serverMs ?? ms,
        rows: body.perf?.rows ?? responseRows
      };
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    const ms = Math.round(nowMs() - startedAt);
    const path = normalizePath(req);
    const slowMs = DEFAULT_SLOW_MS;
    const metric = {
      at: new Date().toISOString(),
      method: req.method,
      path,
      originalUrl: req.originalUrl || req.url || path,
      module: moduleName(path),
      statusCode: res.statusCode,
      ms,
      rows: responseRows,
      slowMs,
      contentLength: Number(res.getHeader('content-length') || 0)
    };
    recordMetric(metric);

    const logPayload = {
      method: metric.method,
      route: metric.originalUrl,
      path: metric.path,
      module: metric.module,
      statusCode: metric.statusCode,
      serverMs: metric.ms,
      rows: metric.rows,
      contentLength: metric.contentLength
    };
    if (metric.ms >= slowMs || metric.statusCode >= 500) {
      req.log?.warn(logPayload, '[API_SLOW]');
    } else if (process.env.API_PERF_LOG !== '0') {
      req.log?.info(logPayload, '[API_PERF]');
    }
  });

  next();
}

function getApiMonitorReport({ limit = 100, slowOnly = false, module = '' } = {}) {
  const rows = Array.from(apiStats.values()).map((s) => ({
    route: s.route,
    method: s.method,
    path: s.path,
    module: s.module,
    count: s.count,
    avgMs: Math.round(s.totalMs / Math.max(1, s.count)),
    maxMs: s.maxMs,
    minMs: s.minMs || 0,
    lastMs: s.lastMs,
    lastRows: s.lastRows,
    lastStatus: s.lastStatus,
    lastAt: s.lastAt,
    lastOriginalUrl: s.lastOriginalUrl,
    maxOriginalUrl: s.maxOriginalUrl,
    slowCount: s.slowCount,
    errorCount: s.errorCount,
    status: s.slowCount > 0 || s.maxMs >= DEFAULT_SLOW_MS ? 'slow' : 'ok'
  }))
    .filter((row) => (slowOnly ? row.slowCount > 0 || row.maxMs >= DEFAULT_SLOW_MS : true))
    .filter((row) => (module ? row.module === module : true))
    .sort((a, b) => (b.maxMs - a.maxMs) || (b.avgMs - a.avgMs));

  const slowRows = rows.filter((row) => row.status === 'slow');
  const summary = {
    totalRoutes: apiStats.size,
    totalCalls: Array.from(apiStats.values()).reduce((sum, s) => sum + s.count, 0),
    slowRoutes: slowRows.length,
    slowCalls: Array.from(apiStats.values()).reduce((sum, s) => sum + s.slowCount, 0),
    errorCalls: Array.from(apiStats.values()).reduce((sum, s) => sum + s.errorCount, 0),
    slowMs: DEFAULT_SLOW_MS,
    generatedAt: new Date().toISOString()
  };

  const moduleStats = Array.from(apiStats.values()).reduce((acc, s) => {
    const key = s.module || 'Khác';
    acc[key] = acc[key] || { module: key, count: 0, totalMs: 0, maxMs: 0, slowCount: 0, routes: 0 };
    acc[key].count += s.count;
    acc[key].totalMs += s.totalMs;
    acc[key].maxMs = Math.max(acc[key].maxMs, s.maxMs || 0);
    acc[key].slowCount += s.slowCount || 0;
    acc[key].routes += 1;
    return acc;
  }, {});

  return {
    ok: true,
    success: true,
    summary,
    modules: Object.values(moduleStats).map((x) => ({
      ...x,
      avgMs: Math.round(x.totalMs / Math.max(1, x.count))
    })).sort((a, b) => b.maxMs - a.maxMs),
    data: rows.slice(0, Math.max(1, Math.min(Number(limit) || 100, 500))),
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
  resetApiMonitor
};
