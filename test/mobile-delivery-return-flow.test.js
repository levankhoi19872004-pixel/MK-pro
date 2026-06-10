'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const masterOrderService = require('../src/services/masterOrderService');
const postingEngine = require('../src/engines/posting.engine');
const paymentRepository = require('../src/repositories/paymentRepository');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) target[key] = value;
  };
}

const arReturn = masterOrderService._internal;

test('mobile delivery return flow reads returnAmount from returnOrders and posts one auditable AR-RETURN', async () => {
  const salesOrder = { id: 'SO-MOBILE-1', code: 'HU-MOBILE-1', masterOrderId: 'MO-MOBILE', masterOrderCode: 'DT-MOBILE', customerId: 'C1', customerCode: 'C1', __masterChildCount: 2 };

  // App giao hàng gửi returnQty, backend lưu vào returnOrders.
  const savedReturnOrder = {
    id: 'RO-HU-MOBILE-1',
    code: 'RO-HU-MOBILE-1',
    salesOrderId: 'SO-MOBILE-1',
    salesOrderCode: 'HU-MOBILE-1',
    masterOrderId: 'MO-MOBILE',
    masterOrderCode: 'DT-MOBILE',
    customerId: 'C1',
    customerCode: 'C1',
    returnStatus: 'active',
    items: [{ productCode: 'P001', returnQty: 2, price: 12000 }]
  };

  // Tab thu tiền đọc lại returnAmount từ returnOrders, không lấy snapshot mơ hồ trên master.
  const hydrated = arReturn.hydrateReturnOrdersForAccounting(salesOrder, [savedReturnOrder]);
  assert.equal(hydrated.returnAmount, 24000);
  assert.equal(hydrated.returnAmountSource, 'returnOrders_direct_salesOrder');

  const ledgers = [];
  const restorePaymentRepo = patch(paymentRepository, {
    findAll: async () => [],
    upsert: async (entry) => { ledgers.push(entry); return entry; }
  });

  try {
    const ro = hydrated.accountingReturnOrders[0];
    const entry = await postingEngine.postReturnOrderAR({
      ...ro,
      customerId: salesOrder.customerId,
      customerCode: salesOrder.customerCode,
      amount: arReturn.returnOrderTotalAmount(ro),
      debtReduction: arReturn.returnOrderTotalAmount(ro)
    });
    assert.ok(entry);
  } finally {
    restorePaymentRepo();
  }

  assert.equal(ledgers.length, 1);
  assert.equal(ledgers[0].returnOrderId, 'RO-HU-MOBILE-1');
  assert.equal(ledgers[0].returnOrderCode, 'RO-HU-MOBILE-1');
  assert.equal(ledgers[0].salesOrderId, 'SO-MOBILE-1');
  assert.equal(ledgers[0].salesOrderCode, 'HU-MOBILE-1');
  assert.equal(ledgers[0].credit, 24000);
});
