'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const masterOrderService = fs.readFileSync(path.join(root, 'src/services/master-order/masterOrderLegacy.service.js'), 'utf8');

function functionBody(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${startNeedle} is missing`);
  const end = endNeedle ? source.indexOf(endNeedle, start + startNeedle.length) : -1;
  return source.slice(start, end === -1 ? source.length : end);
}

test('re-accounting keeps hydrated returnOrders on updated order before posting collections', () => {
  const confirmFn = functionBody(masterOrderService, 'async function confirmDeliveryAccounting', 'async function listDeliveryTodaySummaryFast');

  assert.match(confirmFn, /accountingReturnOrders:\s*accountingSource\.accountingReturnOrders \|\| \[\]/, 'updated order must keep accountingReturnOrders');
  assert.match(confirmFn, /const reverseResult = await reverseActiveArLedgersForOrder\(accountingSource, \{ name: confirmedBy \}, \{ session \}\);/, 're-accounting branch must reverse old AR first');
  assert.match(confirmFn, /await postDeliveryCollectionsAfterAccountingConfirmed\(updated, \{[\s\S]*session,[\s\S]*accountingBatchId: reverseResult\.accountingBatchId,[\s\S]*skipIfExists: true,[\s\S]*forceRepostReturn: true[\s\S]*\}\);/s, 're-accounting branch must repost AR-RETURN with the new accounting batch and forceRepostReturn');
});

test('postDeliveryCollectionsAfterAccountingConfirmed marks returnOrders confirmed after AR-RETURN is posted', () => {
  const postFn = functionBody(masterOrderService, 'async function postDeliveryCollectionsAfterAccountingConfirmed', 'function makeBatchArRow');

  assert.match(postFn, /const arReturnPosted = posted\.some\(\(row\) => String\(row\?\.type \|\| ''\)\.toLowerCase\(\) === 'ar_return'\);/, 'must detect posted AR-RETURN rows');
  assert.match(postFn, /await markAccountingReturnOrdersConfirmed\(hydratedReturnRows, options\);/, 'must mark source returnOrders confirmed after AR-RETURN post');
  assert.match(postFn, /\[AR_RETURN_DEBUG\] STEP-9B hydratedReturnRows before post/, 'must log hydrated return rows before posting');
  assert.match(postFn, /\[AR_RETURN_DEBUG\] STEP-12 mark returnOrders confirmed/, 'must log confirmed returnOrders after posting');
  assert.match(postFn, /accountingBatchId: options\.accountingBatchId \|\| returnRow\.accountingBatchId \|\| order\.accountingBatchId \|\| ''/, 'AR-RETURN rows must keep re-accounting batch id');
});

test('markAccountingReturnOrdersConfirmed sets accountingConfirmed true and accountingStatus confirmed', () => {
  const helperFn = functionBody(masterOrderService, 'async function markAccountingReturnOrdersConfirmed', 'async function postDeliveryCollectionsAfterAccountingConfirmed');

  assert.match(helperFn, /accountingConfirmed:\s*true/, 'returnOrders must be marked accountingConfirmed=true');
  assert.match(helperFn, /accountingStatus:\s*'confirmed'/, 'returnOrders must be marked accountingStatus=confirmed');
  assert.match(helperFn, /accountingConfirmedAt:/, 'returnOrders must keep accounting confirmation timestamp');
  assert.match(helperFn, /await returnOrderRepository\.upsert\(confirmed, options\);/, 'helper must persist returnOrder confirmation through repository');
});
