'use strict';

require('dotenv').config();

const connectDB = require('../src/config/db');
const ReconciliationService = require('../src/domain/reconciliation/ReconciliationService');

async function main() {
  const typeArg = process.argv.find((arg) => arg.startsWith('--type='));
  const type = typeArg ? typeArg.split('=')[1] : 'all';

  await connectDB();

  const report = await ReconciliationService.runReconciliation(type, {
    source: 'script',
    checkedBy: 'system'
  });

  console.log(JSON.stringify({
    ok: true,
    type: report.type,
    status: report.status,
    summary: report.summary,
    mismatchCount: Array.isArray(report.items) ? report.items.length : 0
  }, null, 2));

  process.exit(report.status === 'critical' ? 2 : 0);
}

main().catch((err) => {
  console.error('❌ Reconciliation failed:', err);
  process.exit(1);
});
