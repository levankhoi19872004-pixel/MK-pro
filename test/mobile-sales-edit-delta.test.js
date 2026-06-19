'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOrderItemQuantityDeltas,
  buildInventoryEditMovements
} = require('../src/utils/orderItemDelta.util');

test('buildOrderItemQuantityDeltas aggregates duplicate product lines before comparing', () => {
  const rows = buildOrderItemQuantityDeltas(
    [
      { productCode: 'A', quantity: 5 },
      { productCode: 'a', quantity: 2 },
      { productCode: 'B', quantity: 4 }
    ],
    [
      { productCode: 'A', quantity: 10 },
      { productCode: 'C', quantity: 3 }
    ]
  );

  assert.deepEqual(rows.map((row) => ({
    productCode: row.productCode,
    previousQty: row.previousQty,
    nextQty: row.nextQty,
    deltaQty: row.deltaQty
  })), [
    { productCode: 'A', previousQty: 7, nextQty: 10, deltaQty: 3 },
    { productCode: 'B', previousQty: 4, nextQty: 0, deltaQty: -4 },
    { productCode: 'C', previousQty: 0, nextQty: 3, deltaQty: 3 }
  ]);
});

test('buildInventoryEditMovements creates only net stock IN/OUT movements', () => {
  const movements = buildInventoryEditMovements(
    [
      { productCode: 'A', productName: 'A old', quantity: 5 },
      { productCode: 'B', productName: 'B old', quantity: 9 }
    ],
    [
      { productCode: 'A', productName: 'A new', quantity: 8 },
      { productCode: 'B', productName: 'B new', quantity: 4 },
      { productCode: 'C', productName: 'C new', quantity: 2 }
    ]
  );

  assert.deepEqual(movements.outgoing.map((row) => [row.productCode, row.quantity]), [
    ['A', 3],
    ['C', 2]
  ]);
  assert.deepEqual(movements.incoming.map((row) => [row.productCode, row.quantity]), [
    ['B', 5]
  ]);
});

test('quota edit plan consumes only quantity increase and releases only previously consumed quota', () => {
  const { buildQuotaEditPlan } = require('../src/services/internalSaleAllocation.service');

  const normal = buildQuotaEditPlan(
    [{ productCode: 'A', quantity: 10, saleAllocationType: 'INTERNAL_APP_QUOTA', allocationConsumedQty: 10 }],
    [{ productCode: 'A', quantity: 13 }]
  )[0];
  assert.deepEqual({
    deltaQty: normal.deltaQty,
    consumeQty: normal.consumeQty,
    releaseQty: normal.releaseQty,
    nextQuotaQty: normal.nextQuotaQty
  }, {
    deltaQty: 3,
    consumeQty: 3,
    releaseQty: 0,
    nextQuotaQty: 13
  });

  const legacyDecrease = buildQuotaEditPlan(
    [{ productCode: 'B', quantity: 10 }],
    [{ productCode: 'B', quantity: 6 }]
  )[0];
  assert.deepEqual({
    deltaQty: legacyDecrease.deltaQty,
    consumeQty: legacyDecrease.consumeQty,
    releaseQty: legacyDecrease.releaseQty,
    nextQuotaQty: legacyDecrease.nextQuotaQty
  }, {
    deltaQty: -4,
    consumeQty: 0,
    releaseQty: 0,
    nextQuotaQty: 0
  });

  const partialQuotaDecrease = buildQuotaEditPlan(
    [{ productCode: 'C', quantity: 10, saleAllocationType: 'INTERNAL_APP_QUOTA', allocationConsumedQty: 3 }],
    [{ productCode: 'C', quantity: 5 }]
  )[0];
  assert.deepEqual({
    deltaQty: partialQuotaDecrease.deltaQty,
    consumeQty: partialQuotaDecrease.consumeQty,
    releaseQty: partialQuotaDecrease.releaseQty,
    nextQuotaQty: partialQuotaDecrease.nextQuotaQty
  }, {
    deltaQty: -5,
    consumeQty: 0,
    releaseQty: 3,
    nextQuotaQty: 0
  });
});
