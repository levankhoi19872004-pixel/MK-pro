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

test('AR-RETURN repair only treats active non-reversed return ledgers as existing', () => {
  assert.match(accountingCore, /AR_RETURN_REPAIR_ACTIVE_ONLY_START/);
  assert.match(accountingCore, /status:\s*\{\s*\$nin:\s*\['void', 'reversed', 'cancelled', 'canceled', 'deleted'\]\s*\}/);
  assert.match(accountingCore, /reversed:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.doesNotMatch(accountingCore, /type:\s*'ar_return',[\s\S]{0,120}status:\s*\{\s*\$ne:\s*'void'\s*\}/);
});

test('already-confirmed delivery accounting can repair missing AR-RETURN from return amount fallback', () => {
  assert.match(accountingCore, /function fallbackReturnAmountFromAccountingOrder/);
  assert.match(accountingCore, /returnAmountFromReturnOrders[\s\S]*syncedReturnAmountFromReturnOrders[\s\S]*returnAmount[\s\S]*returnedAmount/);
  assert.match(accountingCore, /salesOrder_returnAmount_repair_fallback/);
  assert.match(accountingCore, /repairMissingArReturnIfNeeded/);
});

test('posting engine writes AR-RETURN as credit and keeps sales-order linkage', () => {
  assert.match(postingEngine, /async function postReturnOrderAR/);
  assert.match(postingEngine, /type:\s*'ar_return'/);
  assert.match(postingEngine, /credit:\s*amount/);
  assert.match(postingEngine, /salesOrderId/);
  assert.match(postingEngine, /salesOrderCode/);
  assert.match(postingEngine, /orderCode:\s*salesOrderCode/);
});

test('debt report groups return credit into returnAmount, not UI hardcode', () => {
  assert.match(debtReportSource, /returnAmount:\s*\{\s*\$sum:\s*\{\s*\$cond/);
  assert.match(debtReportSource, /regex:\s*'return'/);
  assert.match(debtReportSource, /debt:\s*\{\s*\$subtract:\s*\['\$debit', '\$credit'\]/);
});

test('manual backfill script is dry-run by default and prevents duplicate AR-RETURN', () => {
  assert.match(backfillScript, /backfill-ar-return-from-return-orders/);
  assert.match(backfillScript, /const dryRun = !apply/);
  assert.match(backfillScript, /async function hasActiveArReturn/);
  assert.match(backfillScript, /type:\s*'ar_return'/);
  assert.match(backfillScript, /reversed:\s*\{\s*\$ne:\s*true\s*\}/);
  assert.match(backfillScript, /postingEngine\.postReturnOrderAR/);
});

