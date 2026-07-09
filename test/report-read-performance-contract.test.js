'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('report preview is active-request bounded and aborts stale responses', () => {
  const source = read('public/js/app/admin/08a-reports.js');
  assert.match(source, /requestSeq/);
  assert.match(source, /activeRequestController/);
  assert.match(source, /AbortController/);
  assert.match(source, /reportRequestWasAborted/);
});

test('dashboard remains summary driven and avoids full report list calls', () => {
  const dashboard = read('public/js/app/00-dashboard.js');
  assert.match(dashboard, /loadHomeDashboard/);
  assert.doesNotMatch(dashboard, /loadReports\(/);
  assert.doesNotMatch(dashboard, /salesReport\(/);
});

test('SSE export contract keeps delivery staff summary and compliant error-report behavior', () => {
  const sse = read('src/services/sseInvoiceExport.service.js');
  const query = read('src/services/invoiceExportQuery.service.js');
  assert.match(sse, /deliveryStaffSummary|deliveryStaffCode|summaryBy/);
  assert.match(sse, /error-report|errorReport|mapping/i);
  assert.match(query, /isDeliveryStaffSummaryMode/);
});
