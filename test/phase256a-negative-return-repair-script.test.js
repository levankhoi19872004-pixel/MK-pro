'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repair = require('../scripts/repair-delivery-closeout-negative-returned-amount');

test('repair script defaults to dry-run and requires scoped order codes', () => {
  assert.deepEqual(repair.parseArgs(['--order-codes=B0039101,B0039100']).orderCodes, ['B0039101', 'B0039100']);
  assert.equal(repair.parseArgs(['--order-codes=B0039101']).apply, false);
  assert.equal(repair.parseArgs(['--order-codes=B0039101', '--apply']).apply, true);

  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts/repair-delivery-closeout-negative-returned-amount.js'), 'utf8');
  assert.match(source, /Missing --order-codes/);
  assert.doesNotMatch(source, /postDebtOpen\s*\(/);
  assert.doesNotMatch(source, /postAdjustment\s*\(/);
  assert.doesNotMatch(source, /stockTransaction/i);
  assert.doesNotMatch(source, /fundLedgers/i);
});

test('repair script dry-run fixture reports canonical return and debt without applying', async () => {
  const order = {
    id: 'SO-39101',
    code: 'B0039101',
    customerCode: 'C1',
    totalAmount: 7842510,
    deliveryCloseout: {
      status: 'pending_accounting',
      originalAmount: 7842510,
      deliveredAmount: 8133686,
      returnedAmount: -291176,
      collectedAmount: 0,
      finalDebtAmount: 8133686,
      calculationHash: 'before-hash'
    }
  };
  const plan = await repair.buildPlanForOrder(order, {
    actor: 'KT',
    returnOrders: [
      { id: 'RO-39101', code: 'RO-39101', sourceOrderId: 'SO-39101', totalReturnAmount: 291176, status: 'active' }
    ]
  });

  assert.equal(plan.orderCode, 'B0039101');
  assert.equal(plan.existingReturnedAmount, -291176);
  assert.equal(plan.canonicalReturnedAmount, 291176);
  assert.equal(plan.canonicalFinalDebtAmount, 7551334);
  assert.deepEqual(plan.returnOrderIds, ['RO-39101']);
  assert.equal(plan.mismatchReasons.includes('legacy_negative_closeout_value'), true);
  assert.equal(plan.wouldRepair, true);
  assert.equal(plan.applied, false);
  assert.equal(Boolean(plan.beforeCalculationHash), true);
  assert.equal(Boolean(plan.afterCalculationHash), true);
});

test('repair script helper leaves valid order as no-op after repair state', async () => {
  const order = {
    id: 'SO-39100',
    code: 'B0039100',
    customerCode: 'C2',
    totalAmount: 13606658,
    deliveryCloseout: {
      status: 'pending_accounting',
      originalAmount: 13606658,
      deliveredAmount: 13324379,
      returnedAmount: 282279,
      returnAmount: 282279,
      rewardAmount: 1850000,
      collectedAmount: 0,
      finalDebtAmount: 11474379,
      rawFinalDebtAmount: 11474379,
      returnOrderIds: ['RO-39100']
    }
  };
  const plan = await repair.buildPlanForOrder(order, {
    actor: 'KT',
    returnOrders: [
      { id: 'RO-39100', code: 'RO-39100', sourceOrderId: 'SO-39100', totalReturnAmount: 282279, status: 'active' }
    ]
  });
  assert.equal(plan.wouldRepair, false);
  assert.equal(plan.applied, false);
});
