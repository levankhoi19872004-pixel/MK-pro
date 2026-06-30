'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');
const ArDebtAdjustmentPostingService = require('../src/services/accounting/ArDebtAdjustmentPostingService');

test('reduce return correction creates AR-DEBT-ADJUSTMENT debit', () => {
  const order = { id: 'SO-COR-REDUCE', code: 'B-COR-REDUCE', customerCode: 'C1', totalAmount: 1000000, deliveryCloseout: { status: 'accounting_confirmed', version: 1, finalDebtAmount: 700000, collectedAmount: 0, versions: [{ version: 1, finalDebtAmount: 700000 }] } };
  const newCloseout = DeliveryCloseoutService.confirmCloseout(
    order,
    DeliveryCloseoutService.buildCloseout(order, [
      { id: 'RO-OLD', code: 'RO-OLD', sourceOrderId: 'SO-COR-REDUCE', totalReturnAmount: 300000, status: 'active' },
      { id: 'RO-REDUCE', code: 'RO-REDUCE', sourceOrderId: 'SO-COR-REDUCE', totalReturnAmount: -100000, status: 'active' }
    ], [], { version: 2 }),
    { actor: 'KT' }
  );
  const deltaDebt = newCloseout.finalDebtAmount - order.deliveryCloseout.finalDebtAmount;
  const ledger = ArDebtAdjustmentPostingService.buildAdjustmentLedger(order, { deliveryCloseoutVersion: 2, oldFinalDebtAmount: 700000, newFinalDebtAmount: newCloseout.finalDebtAmount, deltaDebt, returnOrderIds: ['RO-OLD', 'RO-REDUCE'], reason: 'Giảm hàng trả', correctedBy: 'KT' });
  assert.equal(deltaDebt, 100000);
  assert.equal(ledger.debit, 100000);
  assert.equal(ledger.credit, 0);
});
