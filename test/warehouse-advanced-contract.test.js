'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeItems } = require('../src/services/warehouse/WarehouseService');

test('warehouse reservation normalizes and merges duplicate lines', () => {
  const items = normalizeItems([
    { productCode: 'P1', qty: 1 },
    { code: 'P1', quantity: 2 },
    { productCode: '', quantity: 10 }
  ]);
  assert.deepEqual(items.map((row) => [row.productCode, row.quantity]), [['P1', 3]]);
});
