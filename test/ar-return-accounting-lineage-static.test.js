'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const masterOrderService = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/services/master-order/masterOrderLegacy.service.js'));
const returnSource = fs.readFileSync(path.join(root, 'src/services/master-order/masterOrderReturn.impl.js'), 'utf8');
const postingEngine = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/engines/posting.engine.js'));

test('AR-RETURN query projection keeps staff lineage fields from returnOrders', () => {
  const projectionStart = returnSource.indexOf('const projection = {');
  assert.notEqual(projectionStart, -1, 'projection block is missing');
  const projectionEnd = returnSource.indexOf('};', projectionStart);
  const projection = returnSource.slice(projectionStart, projectionEnd);

  [
    'salesStaffCode: 1',
    'salesStaffName: 1',
    'salesmanCode: 1',
    'salesmanName: 1',
    'nvbhCode: 1',
    'nvbhName: 1',
    'nvghCode: 1',
    'nvghName: 1',
    'staffCode: 1',
    'staffName: 1'
  ].forEach((needle) => assert.match(projection, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing projection field: ${needle}`));
});

test('AR-RETURN accounting hydrates return rows with order lineage before posting', () => {
  assert.match(returnSource, /function enrichAccountingReturnRows\(rows = \[\], order = \{\}\)/, 'enrichAccountingReturnRows helper is missing');
  assert.match(returnSource, /const directRows = enrichAccountingReturnRows\(directReturnOrdersForSalesOrder\(returnOrders, order\), order\);/, 'direct return rows must be enriched');
  assert.match(returnSource, /const matchedRows = enrichAccountingReturnRows\(returnOrdersForSalesOrder\(returnOrders, order\), order\);/, 'fallback return rows must be enriched');
  assert.match(returnSource, /salesmanName: row\.salesmanName \|\| row\.salesStaffName \|\| row\.nvbhName \|\| order\.salesmanName \|\| order\.salesStaffName \|\| order\.nvbhName \|\| ''/, 'NVBH name lineage is not explicit');
  assert.match(returnSource, /deliveryStaffName: row\.deliveryStaffName \|\| row\.deliveryName \|\| row\.nvghName \|\| order\.deliveryStaffName \|\| order\.deliveryName \|\| order\.nvghName \|\| ''/, 'NVGH name lineage is not explicit');
});

test('postReturnOrderAR does not use generic staffName/staffCode as delivery staff fallback', () => {
  const start = postingEngine.indexOf('async function postReturnOrderAR');
  assert.notEqual(start, -1, 'postReturnOrderAR is missing');
  const end = postingEngine.indexOf('async function', start + 1);
  const fn = postingEngine.slice(start, end === -1 ? postingEngine.length : end);

  assert.doesNotMatch(fn, /deliveryStaffCode:\s*returnOrder\.deliveryStaffCode\s*\|\|\s*returnOrder\.staffCode/, 'AR-RETURN must not fallback deliveryStaffCode to staffCode');
  assert.doesNotMatch(fn, /deliveryStaffName:\s*returnOrder\.deliveryStaffName\s*\|\|\s*returnOrder\.staffName/, 'AR-RETURN must not fallback deliveryStaffName to staffName');
  assert.match(fn, /deliveryStaffCode: returnOrder\.deliveryStaffCode \|\| returnOrder\.deliveryCode \|\| returnOrder\.nvghCode \|\| ''/, 'AR-RETURN delivery code lineage is not explicit');
  assert.match(fn, /salesmanName: returnOrder\.salesmanName \|\| returnOrder\.salesStaffName \|\| returnOrder\.nvbhName \|\| ''/, 'AR-RETURN salesman name lineage is not explicit');
});

test('deliveryAccountingCore has no repairMissingArReturnIfNeeded fallback writer', () => {
  const core = require('./helpers/sourceBundle.util').readSource(path.join(root, 'src/services/master-order/deliveryAccountingCore.impl.js'));

  assert.doesNotMatch(core, /repairMissingArReturnIfNeeded/);
  assert.doesNotMatch(core, /hasReturnOrdersForAccounting/);
  assert.doesNotMatch(core, /hasPostedArReturn/);
  assert.match(core, /returnArPostingService\.postReturnOrderToAR/);
});
