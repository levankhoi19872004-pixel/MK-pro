'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');
const ArDebtAdjustmentPostingService = require('../src/services/accounting/ArDebtAdjustmentPostingService');

test('add return correction creates new closeout version and AR-DEBT-ADJUSTMENT credit', () => {
  const order = { id: 'SO-COR-ADD', code: 'B-COR-ADD', customerCode: 'C1', totalAmount: 1000000, deliveryCloseout: { status: 'accounting_confirmed', version: 1, finalDebtAmount: 1000000, collectedAmount: 0, versions: [{ version: 1, finalDebtAmount: 1000000 }] } };
  const newCloseout = DeliveryCloseoutService.confirmCloseout(
    order,
    DeliveryCloseoutService.buildCloseout(order, [{ id: 'RO-ADD', code: 'RO-ADD', sourceOrderId: 'SO-COR-ADD', totalReturnAmount: 100000, status: 'active' }], [], { version: 2 }),
    { actor: 'KT' }
  );
  const deltaDebt = newCloseout.finalDebtAmount - order.deliveryCloseout.finalDebtAmount;
  const ledger = ArDebtAdjustmentPostingService.buildAdjustmentLedger(order, { deliveryCloseoutVersion: 2, oldFinalDebtAmount: 1000000, newFinalDebtAmount: newCloseout.finalDebtAmount, deltaDebt, returnOrderIds: ['RO-ADD'], reason: 'Bổ sung hàng trả', correctedBy: 'KT' });
  assert.equal(newCloseout.version, 2);
  assert.equal(deltaDebt, -100000);
  assert.equal(ledger.category, 'AR-DEBT-ADJUSTMENT');
  assert.equal(ledger.credit, 100000);
  assert.equal(ledger.debit, 0);
});
