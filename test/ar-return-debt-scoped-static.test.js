'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const accountingCore = read('src/services/master-order/deliveryAccountingCore.impl.js');
const postingEngine = read('src/engines/posting.engine.js');
const debtReportSource = read('src/services/reportLegacy.service.source/part-02.jsfrag');
const backfillScript = read('scripts/backfill-ar-return-from-return-orders.js');

test('delivery accounting no longer owns AR-RETURN repair/fallback writer', () => {
  assert.doesNotMatch(accountingCore, /AR_RETURN_REPAIR_ACTIVE_ONLY_START/);
  assert.doesNotMatch(accountingCore, /function fallbackReturnAmountFromAccountingOrder/);
  assert.doesNotMatch(accountingCore, /salesOrder_returnAmount_repair_fallback/);
  assert.doesNotMatch(accountingCore, /repairMissingArReturnIfNeeded/);
  assert.match(accountingCore, /returnArPostingService\.postReturnOrderToAR/);
  assert.doesNotMatch(accountingCore, /postingEngine\.postReturnOrderAR/);
});

test('posting engine writes AR-RETURN as credit and keeps sales-order linkage', () => {
  assert.match(postingEngine, /async function postReturnOrderAR/);
  assert.match(postingEngine, /type:\s*'ar_return'/);
  assert.match(postingEngine, /credit:\s*amount/);
  assert.match(postingEngine, /salesOrderId/);
  assert.match(postingEngine, /salesOrderCode/);
  assert.match(postingEngine, /orderCode:\s*salesOrderCode/);
});

test('debt report no longer classifies AR-RETURN legacy and delegates to strict AR debt read model v2', () => {
  assert.match(debtReportSource, /arCustomerDebtReadModel\.debtReport\(query\)/);
  assert.match(debtReportSource, /debtSource:\s*'AR_DEBT_READ_MODEL_V2'/);
  assert.doesNotMatch(debtReportSource, /returnAmount:\s*\{\s*\$sum:\s*\{\s*\$cond/);
  assert.doesNotMatch(debtReportSource, /regex:\s*'return'/);
});

test('manual backfill script is dry-run by default and delegates duplicate prevention through posting wrapper', () => {
  assert.match(backfillScript, /backfill-ar-return-from-return-orders/);
  assert.match(backfillScript, /const dryRun = !apply/);
  assert.match(backfillScript, /async function hasActiveArReturn/);
  assert.match(backfillScript, /type:\s*'ar_return'/);
  assert.match(backfillScript, /reversed:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.match(backfillScript, /postingEngine\.postReturnOrderAR/);
});

