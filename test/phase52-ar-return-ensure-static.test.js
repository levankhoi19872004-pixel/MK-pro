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

test('PHASE52 ensure/repair has been removed from deliveryAccountingCore', () => {
  assert.doesNotMatch(core, /PHASE52_SCOPED_FIX/);
  assert.doesNotMatch(core, /ensureArReturnForConfirmedReturnOrder/);
  assert.doesNotMatch(core, /ensureArReturnsForAccountingOrder/);
  assert.doesNotMatch(core, /repairMissingArReturnIfNeeded/);
  assert.match(core, /returnArPostingService\.postReturnOrderToAR\(/);
  assert.doesNotMatch(core, /postingEngine\.postReturnOrderAR\(/);
});

test('AR-RETURN ledger writes remain centralized behind returnArPostingService compatibility wrapper', () => {
  assert.match(posting, /async function postReturnOrderAR/);
  assert.match(posting, /returnArPostingService\.postReturnOrderToAR\(returnOrder, options\)/);
  assert.match(posting, /ledgerType: 'AR-RETURN'/);
  assert.match(posting, /category: 'AR-RETURN'/);
  assert.match(posting, /sourceType: returnOrder\.sourceType \|\| returnOrder\.refType \|\| 'returnOrder'/);
  assert.match(posting, /sourceId: returnOrder\.sourceId \|\| returnOrderId \|\| returnOrderCode/);
});

test('manual backfill remains dry-run by default and goes through posting engine compatibility wrapper', () => {
  assert.match(backfill, /const dryRun = !apply/);
  assert.match(backfill, /\{ ledgerType: 'AR-RETURN' \}/);
  assert.match(backfill, /\{ category: 'AR-RETURN' \}/);
  assert.match(backfill, /\{ code: \/\^AR-RETURN-\//);
  assert.match(backfill, /postingEngine\.postReturnOrderAR/);
});
