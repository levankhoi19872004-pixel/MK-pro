'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CANONICAL_CONFIG = path.join(ROOT, 'config', 'canonical-flows.json');
const RETIRED_CONFIG = path.join(ROOT, 'config', 'retired-flows.json');

const SAFE_ALLOWLIST_PREFIXES = [
  '/api/health',
  '/api/system/status',
  '/api/system/health',
  '/api/auth',
  '/api/search',
  '/api/catalog',
  '/api/print',
  '/api/excel',
  '/api/export',
  '/api/swagger',
  '/api/notifications'
];

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function stripQuery(value) {
  return String(value || '').split('?')[0].replace(/\/+$/, '') || '/';
}

function splitRoute(route) {
  const text = String(route || '').trim();
  const parts = text.split(/\s+/);
  if (parts.length > 1 && /^[A-Z]+$/.test(parts[0])) {
    return { method: parts[0], path: stripQuery(parts.slice(1).join(' ')) };
  }
  return { method: '*', path: stripQuery(text) };
}

function routeToRegex(routePath) {
  const escaped = stripQuery(routePath)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\:([A-Za-z0-9_]+)/g, '[^/]+')
    .replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped || '/'}(?:/.*)?$`);
}

function buildRuntimeFlowIndex() {
  const canonical = readJson(CANONICAL_CONFIG, {});
  const retired = readJson(RETIRED_CONFIG, []);
  const entries = [];

  for (const [flowId, flow] of Object.entries(canonical)) {
    for (const route of (flow.routes || [])) {
      const parsed = splitRoute(route);
      entries.push({
        flowId,
        classification: 'canonical',
        method: parsed.method,
        path: parsed.path,
        regex: routeToRegex(parsed.path)
      });
    }
    for (const route of (flow.compatibilityRoutes || [])) {
      const parsed = splitRoute(route);
      entries.push({
        flowId,
        classification: 'compatibility',
        method: parsed.method,
        path: parsed.path,
        regex: routeToRegex(parsed.path)
      });
    }
  }

  for (const flow of retired) {
    for (const route of (flow.forbiddenRoutes || [])) {
      const parsed = splitRoute(route);
      entries.push({
        flowId: flow.id,
        classification: 'retired',
        method: parsed.method,
        path: parsed.path,
        regex: routeToRegex(parsed.path),
        replacement: flow.replacementFlow || flow.replacement || null
      });
    }
  }

  return { canonical, retired, entries };
}

function classifyRuntimeFlow(method, requestPath, index = buildRuntimeFlowIndex()) {
  const safePath = stripQuery(requestPath);
  const upperMethod = String(method || '').toUpperCase();

  for (const entry of index.entries) {
    if (entry.method !== '*' && entry.method !== upperMethod) continue;
    if (entry.regex.test(safePath)) return entry;
  }

  if (SAFE_ALLOWLIST_PREFIXES.some(prefix => safePath === prefix || safePath.startsWith(prefix + '/'))) {
    return { flowId: 'allowlisted-runtime-support', classification: 'allowlisted', method: '*', path: safePath };
  }

  return { flowId: 'unknown-runtime-flow', classification: 'unknown', method: upperMethod, path: safePath };
}

function createRuntimeFlowTelemetry(options = {}) {
  const enabled = process.env.FLOW_VERIFY_MODE === '1';
  const log = options.logger || console;
  const index = enabled ? buildRuntimeFlowIndex() : null;

  return function runtimeFlowTelemetry(req, res, next) {
    if (!enabled) return next();
    const startedAt = Date.now();
    const requestPath = stripQuery(req.originalUrl || req.url || '');
    const classification = classifyRuntimeFlow(req.method, requestPath, index);

    res.on('finish', () => {
      const warnings = [];
      if (classification.classification === 'retired') warnings.push('RETIRED_ROUTE_CALLED');
      if (classification.classification === 'unknown' && requestPath.startsWith('/api/')) warnings.push('UNKNOWN_API_FLOW');

      const payload = {
        type: 'runtime-flow',
        method: String(req.method || '').toUpperCase(),
        path: requestPath,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        flow: classification.flowId,
        classification: classification.classification,
        requestId: req.requestId,
        userRole: req.user?.role || req.user?.userRole || undefined,
        warnings
      };

      const writer = warnings.length ? (log.warn || log.warning || log.info || console.warn) : (log.info || console.log);
      writer.call(log, payload, warnings.length ? 'Runtime flow warning' : 'Runtime flow verified');
    });

    return next();
  };
}

module.exports = {
  createRuntimeFlowTelemetry,
  classifyRuntimeFlow,
  buildRuntimeFlowIndex,
  stripQuery
};
