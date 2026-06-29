'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const accountingCommand = read('src/services/master-order/deliveryAccountingCommand.impl.js');
const accountingCore = read('src/services/master-order/deliveryAccountingCore.impl.js');
const postingEngine = read('src/engines/posting.engine.js');
const debtReportSource = read('src/services/reportLegacy.service.source/part-02.jsfrag');
const debtReportGenerated = read('src/services/reportLegacy.service.js');
const repairScript = read('scripts/repair-delivery-accounting-ar-ledgers.js');

test('delivery re-accounting reverses old AR before posting new sale and return ledgers', () => {
  assert.match(accountingCommand, /if \(requiresReAccounting\)/);
  assert.match(accountingCommand, /reverseActiveArLedgersForOrder\(accountingSource/);
  assert.match(accountingCommand, /postDeliveryArLedgerRowsAfterReAccounting\(updated, reverseResult\.accountingBatchId/);
  assert.match(accountingCommand, /postDeliveryCollectionsAfterAccountingConfirmed\(updated, \{[\s\S]*accountingBatchId: reverseResult\.accountingBatchId[\s\S]*forceRepostReturn: true/);
});

test('AR-RETURN active check ignores reversed, cancelled and deleted rows', () => {
  assert.match(postingEngine, /status:\s*\{\s*\$nin:\s*\['void', 'reversed', 'cancelled', 'canceled', 'deleted'\]\s*\}/);
  assert.match(postingEngine, /reversed:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.match(postingEngine, /isDeleted:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.match(accountingCore, /status:\s*\{\s*\$nin:\s*\['void', 'reversed', 'cancelled', 'canceled', 'deleted'\]\s*\}/);
});

test('current debt report excludes technical re-accounting reversal rows', () => {
  assert.match(debtReportSource, /DEBT_REPORT_EXCLUDE_REACCOUNTING_REVERSALS_START/);
  assert.match(debtReportSource, /'ar_sale_reversal'/);
  assert.match(debtReportSource, /'ar_return_reversal'/);
  assert.match(debtReportGenerated, /"ar_sale_reversal"/);
  assert.match(debtReportGenerated, /"ar_return_reversal"/);
});

test('repair script is manual dry-run by default and can repair duplicate AR-SALE plus missing AR-RETURN', () => {
  assert.match(repairScript, /repair-delivery-accounting-ar-ledgers/);
  assert.match(repairScript, /const apply = truthy\(arg\('apply'/);
  assert.match(repairScript, /duplicateArSaleOrders/);
  assert.match(repairScript, /mark_duplicate_ar_sale_reversed/);
  assert.match(repairScript, /missingArReturnOrders/);
  assert.match(repairScript, /postingEngine\.postReturnOrderAR/);
  assert.doesNotMatch(repairScript, /main\(\)[\s\S]*process\.env\.AUTO/i);
});
