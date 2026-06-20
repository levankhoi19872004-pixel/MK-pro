'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const netSale = require('../src/services/invoiceNetSales.service');
const queryService = require('../src/services/invoiceExportQuery.service');

function order(code, items) {
  return { id: code, code, orderDate: '2026-06-19', status: 'delivered', items };
}
function item(productCode, quantity, extra = {}) {
  return { productCode, quantity, priceAfterPromotion: 10800, ...extra };
}
function returned(code, orderCode, productCode, qty, state = 'accounting_confirmed', extra = {}) {
  return {
    code,
    salesOrderCode: orderCode,
    returnState: state,
    updatedAt: extra.updatedAt || '2026-06-20T00:00:00.000Z',
    items: [{ productCode, returnQty: qty, ...(extra.item || {}) }]
  };
}
function build(orders, returns) {
  return netSale.buildNetSaleDataset({
    orders,
    returnOrders: returns,
    isEligibleReturnOrder: queryService.isEligibleReturnOrder
  });
}

test('full return in one voucher removes every exportable line and marks the order fully returned', () => {
  const result = build([order('SO-1', [item('A', 10)])], [returned('RO-1', 'SO-1', 'A', 10)]);
  assert.equal(result.orders[0].fullyReturned, true);
  assert.equal(result.orders[0].totalNetQty, 0);
  assert.equal(result.orders[0].exportableLines.length, 0);
});

test('multiple valid return vouchers are accumulated by original order + productCode', () => {
  const result = build(
    [order('SO-2', [item('A', 10)])],
    [returned('RO-21', 'SO-2', 'A', 3), returned('RO-22', 'SO-2', 'A', 7)]
  );
  assert.equal(result.orders[0].fullyReturned, true);
  assert.equal(result.orders[0].lines[0].returnedQty, 10);
  assert.equal(result.orders[0].lines[0].netQty, 0);
});

test('multi-product order is excluded only when every product is fully returned', () => {
  const result = build(
    [order('SO-3', [item('A', 10), item('B', 5), item('C', 2)])],
    [returned('RO-A', 'SO-3', 'A', 10), returned('RO-B', 'SO-3', 'B', 5), returned('RO-C', 'SO-3', 'C', 2)]
  );
  assert.equal(result.orders[0].fullyReturned, true);
  assert.equal(result.orders[0].exportableLines.length, 0);
});

test('fully returned product is removed while another product remains with its net quantity', () => {
  const result = build(
    [order('SO-4', [item('A', 10), item('B', 5)])],
    [returned('RO-A', 'SO-4', 'A', 10), returned('RO-B', 'SO-4', 'B', 2)]
  );
  assert.equal(result.orders[0].fullyReturned, false);
  assert.deepEqual(result.orders[0].exportableLines.map((line) => [line.productCode, line.netQty]), [['B', 3]]);
});

test('cancelled/draft returns are ignored while received operational returns are subtracted', () => {
  const result = build(
    [order('SO-5', [item('A', 10)])],
    [
      returned('RO-OK', 'SO-5', 'A', 5),
      returned('RO-CANCEL', 'SO-5', 'A', 5, 'cancelled'),
      returned('RO-DRAFT', 'SO-5', 'A', 5, 'draft'),
      returned('RO-RECEIVED', 'SO-5', 'A', 5, 'received')
    ]
  );
  assert.equal(result.orders[0].fullyReturned, true);
  assert.equal(result.orders[0].lines[0].netQty, 0);
});

test('production-shaped B0037855 active/pending return with quantity fields removes the full order', () => {
  const result = build(
    [order('B0037855', [
      item('65551554', 1),
      item('65591284', 6),
      item('65591301', 6),
      item('65687138', 1)
    ])],
    [{
      code: 'RO-B0037855',
      orderCode: 'B0037855',
      returnStatus: 'active',
      accountingStatus: 'pending',
      items: [
        { productCode: '65551554', quantity: 1 },
        { productCode: '65591284', quantity: 6 },
        { productCode: '65591301', quantity: 6 },
        { productCode: '65687138', quantity: 1 }
      ]
    }]
  );
  assert.equal(result.orders[0].fullyReturned, true);
  assert.equal(result.orders[0].totalSoldQty, 14);
  assert.equal(result.orders[0].totalReturnedQty, 14);
  assert.equal(result.orders[0].exportableLines.length, 0);
});

test('master-only return is applied only when the exported master has exactly one child order', () => {
  const salesOrder = {
    ...order('SO-MASTER-1', [item('A', 10)]),
    masterOrderId: 'MO-1',
    masterOrderCode: 'MASTER-1'
  };
  const result = build([salesOrder], [{
    code: 'RO-MASTER-1',
    masterOrderId: 'MO-1',
    returnStatus: 'active',
    accountingStatus: 'pending',
    items: [{ productCode: 'A', qty: 10 }]
  }]);
  assert.equal(result.orders[0].fullyReturned, true);
});

test('over-return is capped at zero and emits a warning without negative quantities', () => {
  const result = build([order('SO-6', [item('A', 10)])], [returned('RO-6', 'SO-6', 'A', 12)]);
  assert.equal(result.orders[0].lines[0].netQty, 0);
  assert.equal(result.orders[0].fullyReturned, true);
  assert.equal(result.warnings.some((warning) => warning.code === 'RETURN_QTY_EXCEEDS_SOLD'), true);
});

test('same product split into multiple sales lines consumes the product return total once, not once per line', () => {
  const result = build(
    [order('SO-7', [item('A', 4, { lineKey: 'L1' }), item('A', 6, { lineKey: 'L2' })])],
    [returned('RO-7', 'SO-7', 'A', 7)]
  );
  assert.equal(result.orders[0].totalReturnedQty, 7);
  assert.equal(result.orders[0].totalNetQty, 3);
  assert.deepEqual(result.orders[0].lines.map((line) => line.netQty), [0, 3]);
});

test('case/loose quantities are converted to base units before netting', () => {
  const result = build(
    [order('SO-8', [item('A', '2/6', { conversionRateAtOrder: 24 })])],
    [returned('RO-8', 'SO-8', 'A', '1/4', 'accounting_confirmed', { item: { conversionRateAtOrder: 24 } })]
  );
  assert.equal(result.orders[0].lines[0].soldQty, 54);
  assert.equal(result.orders[0].lines[0].returnedQty, 28);
  assert.equal(result.orders[0].lines[0].netQty, 26);
});

test('return voucher after sale date is still applied because netting is link/state based, not sale-date filtered', () => {
  const later = returned('RO-9', 'SO-9', 'A', 10);
  later.documentDate = '2026-07-01';
  const result = build([order('SO-9', [item('A', 10)])], [later]);
  assert.equal(result.orders[0].fullyReturned, true);
});
