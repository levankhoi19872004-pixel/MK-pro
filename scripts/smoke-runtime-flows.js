'use strict';

const fs = require('fs');
const path = require('path');
const { collectRuntimeVerification } = require('./verify-runtime-flows');

const ROOT = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'reports');
const OUT = path.join(REPORT_DIR, 'runtime-smoke-flows.json');

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const safeMode = process.env.NODE_ENV === 'test' || process.env.FLOW_VERIFY_MODE === '1';
  const report = collectRuntimeVerification();
  const smoke = {
    generatedAt: new Date().toISOString(),
    ok: report.ok,
    safeMode,
    mode: safeMode ? 'static-smoke-no-db-writes' : 'skipped-unsafe-env',
    reason: safeMode
      ? 'Không có seed/test DB trong source ZIP; script chỉ chạy static runtime-flow gate và không gọi command ghi.'
      : 'Set NODE_ENV=test hoặc FLOW_VERIFY_MODE=1 để chạy smoke an toàn.',
    runtimeFlowVerification: report.summary,
    skippedCommands: [
      'deliveryCloseout',
      'deliveryAdjustment',
      'debtCollectionSubmit',
      'debtCollectionConfirm',
      'returnStockInAccounting',
      'resetData'
    ]
  };
  fs.writeFileSync(OUT, JSON.stringify(smoke, null, 2));
  console.log(`[runtime-smoke-flows] ${smoke.ok ? 'OK' : 'FAIL'} mode=${smoke.mode}`);
  if (!smoke.ok) process.exitCode = 1;
}

if (require.main === module) main();
