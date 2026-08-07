'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function source(path) { return fs.readFileSync(path, 'utf8'); }

test('feature flags are opt-in and have no true fallback default', () => {
  const policy = source('src/services/reports/ReportExecutionPolicy.js');
  assert.match(policy, /PERF_REPORT_DB_PAGINATION_V1/);
  assert.match(policy, /PERF_REPORT_CENTER_SNAPSHOT_V1/);
  assert.doesNotMatch(policy, /PERF_REPORT_DB_PAGINATION_V1\s*\|\|\s*['"]true/);
});

test('data-quality read path uses snapshot and legacy rebuild fan-out is bounded', () => {
  const center = source('src/services/reports/ReportCenterService.js');
  assert.match(center, /DataQualitySnapshotService\.readSnapshot/);
  assert.match(center, /runLegacyDataQuality/);
  assert.match(center, /ReportExecutionPolicy\.runBounded/);
  const dataQualityCase = center.slice(center.indexOf("case 'data-quality'"), center.indexOf('default:', center.indexOf("case 'data-quality'")));
  assert.doesNotMatch(dataQualityCase, /Promise\.all/);
});

test('preview service query strips full/export and carries pre-paged metadata', () => {
  const center = source('src/services/reports/ReportCenterService.js');
  const policy = source('src/services/reports/ReportExecutionPolicy.js');
  assert.match(center, /reportServiceQuery/);
  assert.match(center, /prePagedMeta/);
  assert.match(policy, /delete normalized\.full/);
  assert.match(policy, /delete normalized\.export/);
});

test('snapshot rebuild command is dry-run first and apply requires confirmation', () => {
  const script = source('scripts/performance/perf-a4b/rebuild-data-quality-snapshot.js');
  assert.match(script, /--apply/);
  assert.match(script, /--confirm-rebuild/);
  assert.match(script, /writesPlanned/);
  assert.match(script, /if \(apply && !confirmed\)/);
});

test('report export uses background job, progress polling and row/size guards', () => {
  const controller = source('src/controllers/excelInteractionController.js');
  const frontend = source('public/js/components/excel-interaction/ContextExport.js');
  const handler = source('src/services/background-jobs/BackgroundJobHandlers.js');
  const policy = source('src/services/reports/ReportExecutionPolicy.js');
  assert.match(controller, /submitContextExport/);
  assert.match(controller, /status\(202\)/);
  assert.match(frontend, /Prefer':'respond-async/);
  assert.match(frontend, /waitForExportJob/);
  assert.match(handler, /report_export_excel/);
  assert.match(policy, /REPORT_EXPORT_ROW_LIMIT_EXCEEDED/);
  assert.match(policy, /REPORT_EXPORT_SIZE_LIMIT_EXCEEDED/);
});
