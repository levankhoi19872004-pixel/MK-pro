'use strict';

const fs = require('fs');
const path = require('path');
const {
  buildAudit,
  collectFrontendFetches,
  collectRouteDeclarations,
  routeCovered
} = require('./audit-flow-usage');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const PLAN_FILE = path.join(ROOT, 'docs', 'RUNTIME_FLOW_VERIFICATION_PLAN.md');
const DOC_REPORT = path.join(ROOT, 'docs', 'RUNTIME_FLOW_VERIFICATION_REPORT.md');
const JSON_REPORT = path.join(REPORT_DIR, 'runtime-flow-verification.json');
const CANONICAL_CONFIG = path.join(ROOT, 'config', 'canonical-flows.json');
const RETIRED_CONFIG = path.join(ROOT, 'config', 'retired-flows.json');

const REQUIRED_RUNTIME_FLOWS = [
  'authAndRole',
  'productCatalog',
  'customerCatalog',
  'webSalesOrder',
  'mobileSalesOrder',
  'salesImportPreviewCommit',
  'dmsInventoryComparison',
  'dmsGapSimulator',
  'displayCheckManager',
  'masterOrder',
  'deliveryMobilePhase23Workflow',
  'deliveryTodayNewOrders',
  'deliveryCloseout',
  'deliveryAdjustment',
  'deliveryAdjustmentBulkCommit',
  'debtNew',
  'mobileDebt',
  'debtCollectionSubmit',
  'debtCollectionConfirm',
  'fundLedger',
  'returnOrders',
  'warehouseReturnCheck',
  'returnStockInAccounting',
  'reportCenter',
  'sseExportByDeliveryStaff',
  'vatExport',
  'backup',
  'resetData',
  'enterpriseConsole'
];

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}

function safeRead(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch (_) { return ''; }
}

function normalizeRoute(route) {
  const text = String(route || '').trim();
  const parts = text.split(/\s+/);
  if (parts.length > 1 && /^[A-Z]+$/.test(parts[0])) return parts.slice(1).join(' ');
  return text;
}

function collectRuntimeVerification() {
  const canonical = readJson(CANONICAL_CONFIG, {});
  const retired = readJson(RETIRED_CONFIG, []);
  const flowAudit = buildAudit();
  const routeDecls = collectRouteDeclarations();
  const fetches = collectFrontendFetches();
  const plan = safeRead(PLAN_FILE);
  const missingRuntimePlanFlows = REQUIRED_RUNTIME_FLOWS.filter((flowId) => !plan.includes(flowId));
  const missingCanonicalFlows = REQUIRED_RUNTIME_FLOWS.filter((flowId) => !canonical[flowId]);

  const routeChecks = [];
  for (const [flowId, flow] of Object.entries(canonical)) {
    for (const route of (flow.routes || [])) {
      const routePath = normalizeRoute(route);
      const covered = routeCovered(routePath, routeDecls, []);
      routeChecks.push({ flowId, route, covered });
    }
  }

  const missingBackendRoutes = routeChecks.filter((item) => !item.covered);
  const retiredFrontendHits = flowAudit.retiredHits || [];
  const unmatchedFetches = flowAudit.unmatchedFetches || [];

  const masterReturnSource = safeRead(path.join(ROOT, 'src', 'routes', 'masterReturnOrderRoutes.js'));
  const masterReturnWriteFlowBlocked = /retiredMasterReturnWrite/.test(masterReturnSource)
    && /retiredMasterReturnStockIn/.test(masterReturnSource)
    && /router\.post\('\/'/.test(masterReturnSource)
    && /router\.post\('\/:id\/receive'/.test(masterReturnSource);

  const frontendText = fetches.map((f) => `${f.file} ${f.endpoint}`).join('\n');
  const retiredMasterReturnWriteFetches = fetches.filter((f) => {
    const endpoint = f.endpoint;
    return endpoint.startsWith('/api/master-return-orders')
      && !endpoint.includes('/api/master-return-orders`')
      && /(receive|cancel|stock|post|put|patch)/i.test(endpoint);
  });

  const compatibilityIssues = [];
  for (const [flowId, flow] of Object.entries(canonical)) {
    for (const route of (flow.compatibilityRoutes || [])) {
      if (!flow.owner || !(flow.routes || []).length) compatibilityIssues.push({ flowId, route, reason: 'compatibility route has no canonical owner/routes' });
    }
  }

  const criticalIssues = [];
  if (missingCanonicalFlows.length) criticalIssues.push({ type: 'missing-canonical-flow', items: missingCanonicalFlows });
  if (missingRuntimePlanFlows.length) criticalIssues.push({ type: 'missing-runtime-plan-flow', items: missingRuntimePlanFlows });
  if (missingBackendRoutes.length) criticalIssues.push({ type: 'missing-backend-route-mount', items: missingBackendRoutes.slice(0, 50) });
  if (retiredFrontendHits.length) criticalIssues.push({ type: 'retired-frontend-reference', items: retiredFrontendHits.slice(0, 50) });
  if (unmatchedFetches.length) criticalIssues.push({ type: 'orphan-frontend-fetch', items: unmatchedFetches.slice(0, 50) });
  if (!masterReturnWriteFlowBlocked) criticalIssues.push({ type: 'master-return-write-flow-active', items: ['src/routes/masterReturnOrderRoutes.js'] });
  if (retiredMasterReturnWriteFetches.length) criticalIssues.push({ type: 'frontend-fetches-master-return-write-flow', items: retiredMasterReturnWriteFetches });
  if (compatibilityIssues.length) criticalIssues.push({ type: 'compatibility-route-without-owner', items: compatibilityIssues });

  return {
    generatedAt: new Date().toISOString(),
    ok: criticalIssues.length === 0,
    runtimeEvidenceMode: process.env.FLOW_VERIFY_MODE === '1' ? 'FLOW_VERIFY_MODE_ENABLED' : 'static-verification-only',
    summary: {
      canonicalFlows: Object.keys(canonical).length,
      retiredFlows: retired.length,
      requiredRuntimeFlows: REQUIRED_RUNTIME_FLOWS.length,
      backendRouteChecks: routeChecks.length,
      missingBackendRoutes: missingBackendRoutes.length,
      frontendFetches: fetches.length,
      unmatchedFetches: unmatchedFetches.length,
      retiredFrontendHits: retiredFrontendHits.length,
      retiredMasterReturnWriteFetches: retiredMasterReturnWriteFetches.length,
      masterReturnWriteFlowBlocked: masterReturnWriteFlowBlocked ? 1 : 0
    },
    criticalIssues,
    missingRuntimePlanFlows,
    missingCanonicalFlows,
    missingBackendRoutes,
    unmatchedFetches,
    retiredFrontendHits,
    retiredMasterReturnWriteFetches,
    compatibilityIssues,
    notes: [
      'This script proves route/config/network-contract consistency statically.',
      'Manual browser Network evidence is still required to claim production runtime flow is completely clean.',
      'Set FLOW_VERIFY_MODE=1 and run the app to collect runtime-flow telemetry from real UI actions.'
    ]
  };
}

function writeReports(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(DOC_REPORT), { recursive: true });
  fs.writeFileSync(JSON_REPORT, JSON.stringify(report, null, 2));

  const md = [];
  md.push('# RUNTIME_FLOW_VERIFICATION_REPORT');
  md.push('');
  md.push(`Sinh lúc: ${report.generatedAt}`);
  md.push('');
  md.push(`Trạng thái: ${report.ok ? '✅ PASS static runtime-flow gate' : '❌ FAIL static runtime-flow gate'}`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push('| Metric | Value |');
  md.push('|---|---:|');
  for (const [key, value] of Object.entries(report.summary)) md.push(`| ${key} | ${value} |`);
  md.push('');
  md.push('## Critical issues');
  md.push('');
  if (!report.criticalIssues.length) md.push('- Không phát hiện issue static/runtime contract nghiêm trọng.');
  for (const issue of report.criticalIssues) md.push(`- ${issue.type}: ${(issue.items || []).length}`);
  md.push('');
  md.push('## Runtime evidence status');
  md.push('');
  md.push(`- Mode: ${report.runtimeEvidenceMode}`);
  md.push('- Script này kiểm tra hợp đồng route/fetch/retired flow bằng static evidence.');
  md.push('- Để kết luận sạch tuyệt đối cần chạy app với `FLOW_VERIFY_MODE=1` và lưu Network/log thực tế theo plan.');
  md.push('');
  md.push('## Master return retirement gate');
  md.push('');
  md.push(`- master-return write flow blocked: ${report.summary.masterReturnWriteFlowBlocked ? 'YES' : 'NO'}`);
  md.push(`- frontend master-return write fetches: ${report.summary.retiredMasterReturnWriteFetches}`);
  md.push('');
  md.push('## Next manual verification');
  md.push('');
  md.push('- Mở Đơn giao hôm nay New, Công nợ New, App giao hàng, App thủ kho, Import, DMS, Display Check, SSE và chụp Network.');
  md.push('- Không được kết luận “sạch tuyệt đối” nếu chưa có runtime Network evidence cho P0/P1.');
  fs.writeFileSync(DOC_REPORT, md.join('\n') + '\n');
}

if (require.main === module) {
  const report = collectRuntimeVerification();
  writeReports(report);
  console.log(`[runtime-flow-verification] ${report.ok ? 'OK' : 'FAIL'} canonical=${report.summary.canonicalFlows} retired=${report.summary.retiredFlows} routeChecks=${report.summary.backendRouteChecks} unmatchedFetches=${report.summary.unmatchedFetches} retiredHits=${report.summary.retiredFrontendHits}`);
  if (!report.ok) {
    console.error(JSON.stringify(report.criticalIssues, null, 2));
    process.exitCode = 1;
  }
}

module.exports = { collectRuntimeVerification, REQUIRED_RUNTIME_FLOWS };
