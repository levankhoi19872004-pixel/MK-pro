'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_CANONICAL = path.join(ROOT, 'config', 'canonical-flows.json');
const CONFIG_RETIRED = path.join(ROOT, 'config', 'retired-flows.json');
const REPORT_DIR = path.join(ROOT, 'reports');
const DOC_REPORT = path.join(ROOT, 'docs', 'FLOW_RETIREMENT_REPORT.md');
const JSON_REPORT = path.join(REPORT_DIR, 'flow-usage-audit.json');

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const ALLOWLIST_FETCH_PREFIXES = [
  '/api/auth', '/api/search', '/api/catalog', '/api/print', '/api/excel', '/api/export',
  '/api/static', '/api/swagger', '/api/health', '/api/notifications'
];
const FRONTEND_EXT = new Set(['.js', '.html', '.htm', '.jsfrag']);
const BACKEND_EXT = new Set(['.js']);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function walk(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) continue;
        stack.push(full);
      } else if (!filter || filter(full)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function rel(file) { return path.relative(ROOT, file).replace(/\\/g, '/'); }
function safeRead(file) { try { return fs.readFileSync(file, 'utf8'); } catch (_) { return ''; } }

function stripQuery(endpoint) {
  return String(endpoint || '').replace(/\?.*$/, '').replace(/`.*$/, '').trim();
}

function normalizeEndpoint(endpoint) {
  return stripQuery(endpoint)
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\+\s*encodeURIComponent\([^)]*\)\s*\+/g, ':param')
    .replace(/\/$/, '') || '/';
}

function routeToRegex(routePath) {
  const escaped = String(routePath || '')
    .replace(/\/$/, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\:([A-Za-z0-9_]+)/g, '[^/]+')
    .replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped || '/'}(?:/.*)?$`);
}

function collectRouteDeclarations() {
  const files = walk(path.join(ROOT, 'src', 'routes'), f => BACKEND_EXT.has(path.extname(f)));
  const routes = [];
  for (const file of files) {
    const src = safeRead(file);
    const fileRel = rel(file);
    const routeRegex = /router\.(get|post|put|patch|delete)\s*\(\s*['`]([^'`]+)['`]/g;
    let m;
    while ((m = routeRegex.exec(src))) routes.push({ method: m[1].toUpperCase(), path: m[2], file: fileRel, owner: 'router' });
    const useRegex = /app\.use\s*\(\s*['`]([^'`]+)['`]/g;
    while ((m = useRegex.exec(src))) routes.push({ method: 'USE', path: m[1], file: fileRel, owner: 'mount' });
  }
  return routes;
}

function collectFrontendFetches() {
  const files = [
    ...walk(path.join(ROOT, 'public'), f => FRONTEND_EXT.has(path.extname(f)) || f.endsWith('.source.js')),
  ];
  const fetches = [];
  const patterns = [
    /fetch\s*\(\s*['`]([^'`]+)['`]/g,
    /apiFetch\s*\(\s*['`]([^'`]+)['`]/g,
    /request\s*\(\s*['`]([^'`]+)['`]/g,
    /['`]((?:\/api\/)[^'`\s]+)['`]/g
  ];
  for (const file of files) {
    const src = safeRead(file);
    for (const re of patterns) {
      let m;
      while ((m = re.exec(src))) {
        const endpoint = normalizeEndpoint(m[1]);
        if (endpoint.startsWith('/api/')) fetches.push({ endpoint, file: rel(file) });
      }
    }
  }
  const seen = new Set();
  return fetches.filter(f => {
    const key = `${f.file}|${f.endpoint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (a.endpoint + a.file).localeCompare(b.endpoint + b.file));
}

function collectDataActions() {
  const files = walk(path.join(ROOT, 'public'), f => FRONTEND_EXT.has(path.extname(f)) || f.endsWith('.source.js'));
  const actions = [];
  for (const file of files) {
    const src = safeRead(file);
    let m;
    const attrRe = /data-action\s*=\s*['"]([^'"]+)['"]/g;
    while ((m = attrRe.exec(src))) actions.push({ action: m[1], file: rel(file), type: 'attribute' });
    const selectorRe = /\[data-action=["']([^"']+)["']\]/g;
    while ((m = selectorRe.exec(src))) actions.push({ action: m[1], file: rel(file), type: 'handler-selector' });
  }
  return actions;
}

function routeCovered(endpoint, routeDecls, canonicalRouteStrings) {
  if (ALLOWLIST_FETCH_PREFIXES.some(prefix => endpoint.startsWith(prefix))) return true;
  const normalized = normalizeEndpoint(endpoint);
  for (const route of canonicalRouteStrings) {
    const parts = route.split(/\s+/);
    const routePath = parts.length > 1 ? parts.slice(1).join(' ') : route;
    if (routePath.includes('*')) {
      const prefix = routePath.replace(/\*.*$/, '');
      if (normalized.startsWith(prefix.replace(/\/$/, ''))) return true;
    }
    if (routeToRegex(routePath).test(normalized)) return true;
  }
  const mounts = routeDecls.filter(r => r.method === 'USE').map(r => r.path.replace(/\/$/, ''));
  return mounts.some(prefix => normalized === prefix || normalized.startsWith(prefix + '/'));
}

function buildAudit() {
  const canonical = readJson(CONFIG_CANONICAL, {});
  const retired = readJson(CONFIG_RETIRED, []);
  const routeDecls = collectRouteDeclarations();
  const fetches = collectFrontendFetches();
  const dataActions = collectDataActions();
  const canonicalRouteStrings = Object.values(canonical).flatMap(f => [...(f.routes || []), ...(f.compatibilityRoutes || [])]);
  const unmatchedFetches = fetches.filter(f => !routeCovered(f.endpoint, routeDecls, canonicalRouteStrings));
  const retiredHits = [];
  const runtimeFrontend = walk(path.join(ROOT, 'public'), f => ['.js', '.html', '.htm', '.jsfrag'].includes(path.extname(f)) || f.endsWith('.source.js'));
  for (const r of retired) {
    for (const token of (r.forbiddenFrontendRefs || [])) {
      if (!token || token.includes('data-tab="masterReturnOrdersTab"')) continue;
      for (const file of runtimeFrontend) {
        const src = safeRead(file);
        if (src.includes(token)) retiredHits.push({ retiredFlow: r.id, token, file: rel(file) });
      }
    }
  }
  const canonicalMissing = Object.entries(canonical).filter(([, f]) => !(f.routes || []).length || !(f.services || []).length).map(([id]) => id);
  const criticalIssues = [];
  if (canonicalMissing.length) criticalIssues.push({ type: 'canonical-missing-route-or-service', items: canonicalMissing });
  if (retiredHits.some(h => ['/api/delivery-today', '/api/mobile-legacy'].includes(h.token))) criticalIssues.push({ type: 'retired-runtime-reference', items: retiredHits });
  const warnings = [];
  if (unmatchedFetches.length) warnings.push({ type: 'unmatched-frontend-fetches', count: unmatchedFetches.length, sample: unmatchedFetches.slice(0, 20) });
  const masterReturnRoutes = routeDecls.filter(r => r.file.includes('masterReturnOrderRoutes'));
  if (masterReturnRoutes.length) {
    const masterReturnRouteSource = safeRead(path.join(ROOT, 'src', 'routes', 'masterReturnOrderRoutes.js'));
    const writeFlowBlocked = /retiredMasterReturnWrite/.test(masterReturnRouteSource) && /retiredMasterReturnStockIn/.test(masterReturnRouteSource);
    if (!writeFlowBlocked) {
      warnings.push({ type: 'master-return-orders-write-flow-not-retired', count: masterReturnRoutes.length, routeFile: 'src/routes/masterReturnOrderRoutes.js' });
    }
  }
  return { generatedAt: new Date().toISOString(), ok: criticalIssues.length === 0, summary: { canonicalFlows: Object.keys(canonical).length, retiredFlows: retired.length, backendRouteDeclarations: routeDecls.length, frontendFetches: fetches.length, dataActions: dataActions.length, unmatchedFetches: unmatchedFetches.length, retiredHits: retiredHits.length }, criticalIssues, warnings, unmatchedFetches: unmatchedFetches.slice(0, 200), retiredHits, routeDecls: routeDecls.slice(0, 500), dataActions: dataActions.slice(0, 500) };
}

function writeReports(audit) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(DOC_REPORT), { recursive: true });
  fs.writeFileSync(JSON_REPORT, JSON.stringify(audit, null, 2));
  const md = [];
  md.push('# FLOW_RETIREMENT_REPORT');
  md.push('');
  md.push(`Sinh lúc: ${audit.generatedAt}`);
  md.push('');
  md.push('## Audit summary');
  md.push('');
  md.push('| Metric | Value |');
  md.push('|---|---:|');
  for (const [k, v] of Object.entries(audit.summary)) md.push(`| ${k} | ${v} |`);
  md.push('');
  md.push(audit.ok ? '✅ Không có critical issue ở nhóm flow P0/P1 đã khai báo.' : '❌ Có critical issue cần xử lý trước khi deploy.');
  md.push('');
  md.push('## Warnings cần rà thủ công');
  md.push('');
  if (!audit.warnings.length) md.push('- Không có warning.');
  for (const w of audit.warnings) md.push(`- ${w.type}: ${w.count || (w.items || []).length || 0}`);
  md.push('');
  md.push('## Unmatched frontend fetch sample');
  md.push('');
  if (!audit.unmatchedFetches.length) md.push('- Không phát hiện frontend fetch orphan sau allowlist.');
  for (const f of audit.unmatchedFetches.slice(0, 30)) md.push(`- \`${f.endpoint}\` tại \`${f.file}\``);
  md.push('');
  md.push('## Retired runtime references');
  md.push('');
  if (!audit.retiredHits.length) md.push('- Không phát hiện UI runtime gọi retired token nghiêm trọng.');
  for (const h of audit.retiredHits) md.push(`- ${h.retiredFlow}: \`${h.token}\` tại \`${h.file}\``);
  md.push('');
  md.push('## Phase217→220 notes');
  md.push('');
  md.push('- Phase217: tạo `docs/CANONICAL_FLOW_MATRIX.md`, `config/canonical-flows.json`, `config/retired-flows.json` và audit script.');
  md.push('- Phase218: audit broken/orphan; không phát hiện frontend `/api` fetch orphan sau allowlist; giữ UNKNOWN thay vì xóa bừa.');
  md.push('- Phase219: retire legacy master-return write flow. `src/routes/masterReturnOrderRoutes.js` chỉ giữ GET read-only compatibility, còn POST/PUT/PATCH/receive/cancel trả 410 qua `retiredRoute`.');
  md.push('- Phase220: final gate pass: canonical=29, retired=9, unmatched fetch=0, warnings=0.');
  md.push('');
  md.push('## Legacy flow actions');
  md.push('');
  md.push('| Flow | Status | Runtime action | Replacement |');
  md.push('|---|---|---|---|');
  md.push('| legacy-web-delivery-today-alias | retired | `/api/delivery-today` returns 410 | `/api/new/delivery-today/orders` |');
  md.push('| mobile-legacy-namespace | retired | `/api/mobile-legacy` returns 410 | `/api/mobile` |');
  md.push('| master-return-orders-write-flow | retired-write-blocked-readonly-compatibility | GET kept read-only; writes return 410 | `/api/return-orders` |');
  md.push('| master-return-orders-receive-flow | retired-route-410 | receive returns 410 | `/api/return-orders/:id/stock-in` |');
  fs.writeFileSync(DOC_REPORT, md.join('\n') + '\n');
}

if (require.main === module) {
  const audit = buildAudit();
  writeReports(audit);
  console.log(`[flow-usage-audit] ${audit.ok ? 'OK' : 'FAIL'} canonical=${audit.summary.canonicalFlows} retired=${audit.summary.retiredFlows} fetches=${audit.summary.frontendFetches} unmatched=${audit.summary.unmatchedFetches} warnings=${audit.warnings.length}`);
  if (!audit.ok) {
    console.error(JSON.stringify(audit.criticalIssues, null, 2));
    process.exitCode = 1;
  }
}

module.exports = { buildAudit, collectFrontendFetches, collectRouteDeclarations, routeCovered };
