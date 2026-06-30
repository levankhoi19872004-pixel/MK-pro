'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');
const ArDebtOpenPostingService = require('../src/services/accounting/ArDebtOpenPostingService');
const paymentRepository = require('../src/repositories/paymentRepository');
const arDebtReadModel = require('../src/services/arDebtReadModel.service');

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

test('Hoa Sơn strict closeout final debt posts exactly one AR-DEBT-OPEN', async () => {
  const order = {
    id: 'SO-HOASON',
    code: 'B0038442',
    customerCode: 'BBHOASON',
    customerName: 'Hoa Sơn',
    deliveryStatus: 'delivered',
    totalAmount: 487484570,
    deliveryCloseout: { collectedAmount: 190000000 }
  };
  const returnOrders = [{ id: 'RO-HOASON-1', code: 'RO-HOASON-1', sourceOrderId: 'SO-HOASON', totalReturnAmount: 549540, status: 'active' }];
  const closeout = DeliveryCloseoutService.confirmCloseout(
    order,
    DeliveryCloseoutService.buildCloseout(order, returnOrders, [], { actor: 'KT' }),
    { actor: 'KT' }
  );

  assert.equal(closeout.originalAmount, 487484570);
  assert.equal(closeout.returnedAmount, 549540);
  assert.equal(closeout.collectedAmount, 190000000);
  assert.equal(closeout.finalDebtAmount, 296935030);

  const posted = [];
  const restorePayment = patch(paymentRepository, {
    findAll: async () => [],
    upsert: async (entry) => { posted.push(entry); return entry; }
  });
  const restoreReadModel = patch(arDebtReadModel, {
    rebuildDebtForSource: async () => ({ dryRun: true })
  });
  try {
    const result = await ArDebtOpenPostingService.postDebtOpen(order, closeout, { skipReadModelRebuild: false });
    assert.equal(result.posted, true);
  } finally {
    restoreReadModel();
    restorePayment();
  }

  assert.equal(posted.length, 1);
  assert.equal(posted[0].category, 'AR-DEBT-OPEN');
  assert.equal(posted[0].ledgerType, 'AR-DEBT-OPEN');
  assert.equal(posted[0].entryType, 'normal');
  assert.equal(posted[0].sourceType, 'SALES_ORDER_DELIVERY_CLOSEOUT');
  assert.equal(posted[0].debit, 296935030);
  assert.equal(posted[0].credit, 0);
  assert.equal(posted[0].amount, 296935030);
  assert.equal(posted[0].direction, 'debit');
  assert.equal(posted[0].amountField, 'debit');
  assert.equal(posted[0].active, true);
  assert.equal(posted[0].reversed, false);
  assert.equal(posted[0].accountingConfirmed, true);
  assert.equal(posted[0].idempotencyKey, 'AR-DEBT-OPEN:SO-HOASON');
  assert.notEqual(posted[0].category, 'AR-SALE');
});
