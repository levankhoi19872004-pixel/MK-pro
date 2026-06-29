'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const core = read('src/services/master-order/deliveryAccountingCore.impl.js');
const posting = read('src/engines/posting.engine.js');
const backfill = read('scripts/backfill-ar-return-from-return-orders.js');

test('phase52 adds ensureArReturnForConfirmedReturnOrder and direct confirmed returnOrders lookup', () => {
  assert.match(core, /PHASE52_SCOPED_FIX: CONFIRMED_RETURN_ORDER_AR_RETURN_ENSURE_START/);
  assert.match(core, /async function ensureArReturnForConfirmedReturnOrder\(returnOrder = \{\}, options = \{\}\)/);
  assert.match(core, /accountingConfirmed: true/);
  assert.match(core, /accountingStatus: \{ \$in: \['confirmed', 'locked', 'posted'\] \}/);
  assert.match(core, /postedAt: returnOrder\.postedAt/);
  assert.match(core, /receivedAt: returnOrder\.receivedAt/);
  assert.doesNotMatch(core, /if \([^\n]*(postedAt|receivedAt)[^\n]*\) return/);
});

test('phase52 ensure is called from postDeliveryCollectionsAfterAccountingConfirmed safety-net', () => {
  assert.match(core, /PHASE52_SCOPED_FIX: ENSURE_CONFIRMED_RETURN_ORDER_AR_RETURN_START/);
  assert.match(core, /await ensureArReturnsForAccountingOrder\(order, hydratedReturnRows, \{/);
  assert.match(core, /assumeConfirmed: true/);
  assert.match(core, /posted\.push\(\{ type: 'ar_return'/);
});

test('AR-RETURN ledger writes report-compatible fields and robust active lookup', () => {
  assert.match(posting, /ledgerType: 'AR-RETURN'/);
  assert.match(posting, /category: 'AR-RETURN'/);
  assert.match(posting, /sourceType: returnOrder\.sourceType \|\| returnOrder\.refType \|\| 'returnOrder'/);
  assert.match(posting, /sourceId: returnOrder\.sourceId \|\| returnOrderId \|\| returnOrderCode/);
  assert.match(posting, /\{ ledgerType: 'AR-RETURN' \}/);
  assert.match(posting, /\{ category: 'AR-RETURN' \}/);
});

test('manual backfill detects uppercase/ledgerType/category AR-RETURN and remains dry-run by default', () => {
  assert.match(backfill, /const dryRun = !apply/);
  assert.match(backfill, /\{ ledgerType: 'AR-RETURN' \}/);
  assert.match(backfill, /\{ category: 'AR-RETURN' \}/);
  assert.match(backfill, /\{ code: \/\^AR-RETURN-\//);
});
