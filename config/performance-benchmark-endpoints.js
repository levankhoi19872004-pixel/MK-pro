'use strict';

const APPROVED_ENDPOINTS = Object.freeze([
  Object.freeze({
    id: 'health-live',
    path: '/api/health/live',
    method: 'GET',
    auth: 'none',
    workloadClass: 'light',
    productionApproved: true,
    maxConcurrency: 5,
    maxRequests: 50,
    expectedContentType: 'application/json'
  }),
  Object.freeze({
    id: 'health-ready',
    path: '/api/health/ready',
    method: 'GET',
    auth: 'none',
    workloadClass: 'light',
    productionApproved: true,
    maxConcurrency: 5,
    maxRequests: 50,
    expectedContentType: 'application/json'
  }),
  Object.freeze({
    id: 'system-status',
    path: '/api/system/status',
    method: 'GET',
    auth: 'none',
    workloadClass: 'light',
    productionApproved: true,
    maxConcurrency: 5,
    maxRequests: 50,
    expectedContentType: 'application/json'
  }),
  Object.freeze({
    id: 'performance-baseline',
    path: '/api/system/performance-baseline',
    method: 'GET',
    auth: 'manager',
    workloadClass: 'light',
    productionApproved: true,
    maxConcurrency: 2,
    maxRequests: 20,
    expectedContentType: 'application/json'
  })
]);

const FORBIDDEN_PATH_PARTS = Object.freeze([
  '/commit',
  '/closeout',
  '/confirm',
  '/reconciliation/run',
  '/repair',
  '/reset',
  '/delete',
  '/update',
  '/create',
  '/backup',
  '/export',
  '/download',
  '/import',
  '/migrate',
  '/backfill'
]);

function normalizePath(value) {
  return String(value || '').trim();
}

function validateEndpointPath(endpoint) {
  const path = normalizePath(endpoint);
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error(`Endpoint must be a same-origin path starting with one slash: ${path}`);
  }
  if (/\s/.test(path)) throw new Error(`Endpoint contains whitespace: ${path}`);
  if (path.includes('..')) throw new Error(`Endpoint path traversal is not allowed: ${path}`);
  const parsed = new URL(path, 'http://benchmark.local');
  if (parsed.search && /token|jwt|authorization|cookie|secret/i.test(parsed.search)) {
    throw new Error(`Endpoint query cannot contain token-like parameters: ${path}`);
  }
  const lower = parsed.pathname.toLowerCase();
  if (FORBIDDEN_PATH_PARTS.some((part) => lower.includes(part))) {
    throw new Error(`Benchmark only allows approved read-only GET paths; refused write-like endpoint: ${path}`);
  }
  return `${parsed.pathname}${parsed.search || ''}`;
}

function byPath() {
  return new Map(APPROVED_ENDPOINTS.map((item) => [item.path, item]));
}

function resolveBenchmarkEndpoints(rawEndpoints, env = process.env) {
  const approved = byPath();
  const requested = String(rawEndpoints || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const defaultRows = APPROVED_ENDPOINTS.filter((item) => item.id !== 'performance-baseline');
  const rows = requested.length ? requested.map((path) => {
    const normalized = validateEndpointPath(path);
    const row = approved.get(normalized);
    if (row) return row;
    if (String(env.PERF_ALLOW_CUSTOM_ENDPOINTS || '').toLowerCase() !== 'true') {
      throw new Error(`Endpoint is not in approved registry: ${normalized}`);
    }
    const explicit = new Set(String(env.PERF_APPROVED_ENDPOINTS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => validateEndpointPath(item)));
    if (!explicit.has(normalized)) {
      throw new Error(`Custom endpoint requires PERF_APPROVED_ENDPOINTS explicit approval: ${normalized}`);
    }
    return Object.freeze({
      id: `custom-${normalized.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`,
      path: normalized,
      method: 'GET',
      auth: 'explicit',
      workloadClass: 'custom',
      productionApproved: false,
      maxConcurrency: 1,
      maxRequests: 10,
      expectedContentType: ''
    });
  }) : defaultRows;
  return rows.map((row) => ({ ...row }));
}

module.exports = {
  APPROVED_ENDPOINTS,
  FORBIDDEN_PATH_PARTS,
  validateEndpointPath,
  resolveBenchmarkEndpoints
};
