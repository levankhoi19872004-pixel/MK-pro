'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../../../src/config/db');
const DataQualitySnapshotService = require('../../../src/services/reports/DataQualitySnapshotService');

function argValue(name) {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : '';
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--confirm-rebuild');
  const dateFrom = argValue('dateFrom');
  const dateTo = argValue('dateTo');
  const tenantId = argValue('tenantId') || process.env.DEFAULT_TENANT_ID || 'default';
  const scopeKey = argValue('scopeKey') || 'global';

  if (!dateFrom || !dateTo) {
    const error = new Error('Bắt buộc truyền --dateFrom=YYYY-MM-DD và --dateTo=YYYY-MM-DD');
    error.code = 'REPORT_SNAPSHOT_DATE_RANGE_REQUIRED';
    throw error;
  }
  if (apply && !confirmed) {
    const error = new Error('Apply yêu cầu đồng thời --apply và --confirm-rebuild');
    error.code = 'REPORT_SNAPSHOT_CONFIRMATION_REQUIRED';
    throw error;
  }

  await connectDB();
  const result = await DataQualitySnapshotService.rebuildSnapshot(
    { dateFrom, dateTo, tenantId, scopeKey },
    { tenantId },
    { apply }
  );
  console.log(JSON.stringify({
    ok: true,
    mode: apply ? 'APPLY' : 'DRY_RUN',
    writesPlanned: 1,
    writesApplied: apply ? 1 : 0,
    snapshot: {
      id: result.document.id,
      snapshotVersion: result.document.snapshotVersion,
      sourceVersion: result.document.sourceVersion,
      generatedAt: result.document.generatedAt,
      sourceRange: result.document.sourceRange,
      rowCount: result.document.rows.length,
      summary: result.document.summary,
      estimatedBytes: result.estimatedBytes,
      maxConcurrency: result.maxConcurrency
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, code: error.code || 'REPORT_SNAPSHOT_REBUILD_FAILED', message: error.message }, null, 2));
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
