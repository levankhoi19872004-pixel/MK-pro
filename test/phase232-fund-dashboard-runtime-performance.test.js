'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Phase232 read budget registers funds dashboard as abortable read-only runtime endpoint', () => {
  const { READ_ENDPOINT_BUDGETS: budgets } = require('../src/config/readEndpointBudgets');
  const entry = budgets.fundsDashboard;

  assert.ok(entry);
  assert.equal(entry.endpoint, 'GET /api/funds/dashboard');
  assert.equal(entry.requiresAbortableFrontend, true);
  assert.equal(entry.acceptsSequenceGuard, true);
  assert.equal(entry.readOnly, true);
  assert.equal(entry.forbiddenWrites, true);
  assert.equal(entry.maxLimit, 100);
  assert.equal(entry.reloadPolicy, 'lazy-load-active-fund-dashboard-tab');
  assert.equal(entry.cachePolicy, 'short-session-memory-only-no-localStorage');
});

test('Phase232 OpenAPI documents the dashboard partial contract and strict input surface', () => {
  const spec = JSON.parse(read('docs/openapi.json'));
  const operation = spec.paths['/api/funds/dashboard'].get;

  assert.ok(operation);
  assert.equal(operation.summary, 'GET /api/funds/dashboard');
  assert.deepEqual(
    operation.parameters.map((param) => param.name).sort(),
    ['asOf', 'cashInTransitLimit', 'recentLimit'].sort()
  );

  const example = operation.responses['200'].content['application/json'].example;
  assert.equal(example.status, 'partial');
  assert.equal(example.data.contractVersion, 'fund-dashboard-v1');
  assert.equal(example.data.sections.balances.status, 'ok');
  assert.equal(example.data.sections.cashInTransit.status, 'error');
  assert.equal(example.data.workQueues.overdueDeliveryCash.amount, null);
  assert.ok(Array.isArray(example.errors));
});

test('Phase232 cash-in-transit service supports summary-before-limit output controls', () => {
  const source = read('src/domain/settlement/DeliveryCashInTransitReportService.js');

  assert.match(source, /overdueSummary/);
  assert.match(source, /const limit=|const limit =/);
  assert.match(source, /includeItems/);
  assert.match(source, /summaryOnly/);
  assert.match(source, /truncated/);
  assert.match(source, /\$facet:\s*\{/);
  assert.match(source, /\$unionWith:\s*\{/);
  assert.match(source, /\$limit:\s*limit/);
  assert.match(source, /rows,/);
});

test('Phase232 dashboard service avoids legacy remittance overcount and exposes timing diagnostics', () => {
  const source = read('src/services/accounting/FundDashboardReadService.js');

  assert.match(source, /loadRelatedSubmissionLedgers/);
  assert.match(source, /fundLedgerRepository\.findAll/);
  assert.match(source, /linesFromLegacyAmounts/);
  assert.match(source, /FINAL_LINE_STATUSES/);
  assert.match(source, /sectionDurations/);
  assert.match(source, /loadSection\('pendingRemittances'/);
  assert.doesNotMatch(source, /remittanceLines\.status/);
  assert.doesNotMatch(source, /FundLedger\.find/);
});
