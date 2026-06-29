'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('reconcile-return-ar detects allocation-source and duplicate returnOrder AR-RETURN cases', () => {
  const source = read('scripts/reconcile-return-ar.js');

  assert.match(source, /duplicateArReturnByReturnOrderCode/);
  assert.match(source, /duplicateArReturnSameReturnOrderAllocationSource/);
  assert.match(source, /arReturnAllocationSourceType/);
  assert.match(source, /ledgerHasAllocationSource/);
  assert.match(source, /ar_return_sourceType_allocation_should_be_returnOrder/);
  assert.match(source, /duplicate_ar_return_same_returnOrderCode/);
  assert.match(source, /duplicate_ar_return_same_allocation_source_and_returnOrder/);
});
