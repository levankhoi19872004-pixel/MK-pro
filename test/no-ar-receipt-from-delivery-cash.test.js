'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const DeliverySettlementService = require('../src/domain/settlement/DeliverySettlementService');

test('delivery cash record does not create AR-RECEIPT', async () => {
  const result = await DeliverySettlementService.recordCollectedMoney({ id: 'SO-CASH', cashCollected: 100000, bankCollected: 50000 });
  assert.equal(result.arPosted, false);
  assert.equal(result.posted, false);
  assert.equal(result.collectedAmount, 150000);
  assert.match(result.policy, /does not create AR-RECEIPT/);
});
