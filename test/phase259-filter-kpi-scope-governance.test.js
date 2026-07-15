'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const { auditText } = require('../scripts/lib/filterKpiScopeAuditCore');

const root = path.resolve(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('Phase259 audit guard detects summary derived after limit', () => {
  const findings = auditText(`
    async function bad(Model, filter) {
      const items = await Model.find(filter).limit(50).lean();
      const summary = { totalAmount: items.reduce((sum, row) => sum + row.amount, 0) };
      return { items, summary };
    }
  `, 'fixture.js');
  assert(findings.some((finding) => finding.id === 'summaryAfterLimit' && finding.severity === 'P1_REVIEW_REQUIRED'));
});

test('Phase259 audit guard detects client post-filter with backend summary', () => {
  const findings = auditText(`
    function render(rows, summary) {
      const visible = rows.filter((row) => row.name.includes(search.value));
      kpi.textContent = summary.totalAmount;
      table.innerHTML = visible.map(renderRow).join('');
    }
  `, 'fixture-ui.js');
  assert(findings.some((finding) => finding.id === 'clientPostFilterBackendSummary'));
});

test('Phase259 audit guard allows explicit selection and facet scopes', () => {
  const selection = auditText(`
    // SELECTION_SCOPE
    const visible = state.rows.filter((row) => selected[row.salesStaffCode]);
    const summary = visible.reduce((acc, row) => acc + row.amount, 0);
  `, 'selection.js');
  const facet = auditText(`
    // FACET_SCOPE
    const filteredRows = rows.filter((row) => row.type === type);
    const summary = rows.reduce((acc, row) => acc + row.amount, 0);
  `, 'facet.js');
  assert(!selection.some((finding) => finding.severity === 'P1_REVIEW_REQUIRED'));
  assert(!facet.some((finding) => finding.severity === 'P1_REVIEW_REQUIRED'));
});

test('Debt Collections uses backend q scope and full-scope summary aggregation', () => {
  const service = read('src/services/DebtCollectionService.js');
  const ui = read('public/js/app/debt/07e-debt-collections.js');
  assert.match(service, /normalizeDebtCollectionScope/);
  assert.match(service, /DebtCollection\.aggregate/);
  assert.match(service, /DebtCollection\.countDocuments/);
  assert.doesNotMatch(service, /totalAmount:\s*items\.reduce/);
  assert.match(ui, /params\.set\('q'/);
  assert.doesNotMatch(ui, /debtCollectionRowMatches/);
});

test('AR Ledger, Return Orders, External Debt and DMS summaries are not page-row totals', () => {
  const ar = read('src/services/reportLegacy.service.source/part-03.jsfrag');
  const returns = read('src/services/returnOrderLegacy.service.source/part-01b.jsfrag');
  const external = read('src/services/ExternalDebtOrderService.js');
  const dms = read('src/services/dmsInventoryReconciliation.service.js');
  assert.match(ar, /ArLedger\.aggregate/);
  assert.doesNotMatch(ar, /totalDebit:\s*sum\(arLedger/);
  assert.match(returns, /\$facet/);
  assert.match(returns, /rows\.summary/);
  assert.match(external, /ExternalDebtOrder\.aggregate/);
  assert.doesNotMatch(external, /totalAmount:\s*items\.reduce/);
  assert.match(dms, /searchScopedRows/);
  assert.match(dms, /FACET_SCOPE/);
});

test('Fund Ledger declares mixed exact/global scope and labels global balances explicitly', () => {
  const service = read('src/services/accounting/FundBalanceReadService.js');
  const ui = read('public/js/app/debt/07f-fund-ledger.source/part-03.jsfrag');
  assert.match(service, /GLOBAL_EXPLICIT_SCOPE/);
  assert.match(service, /transactionTotals/);
  assert.match(ui, /toàn quỹ/);
  assert.match(ui, /filteredRowsTotalIn/);
  assert.match(ui, /theo bộ lọc/);
});
