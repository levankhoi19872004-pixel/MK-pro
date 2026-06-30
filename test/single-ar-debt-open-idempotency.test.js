'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const ArDebtOpenPostingService = require('../src/services/accounting/ArDebtOpenPostingService');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) { originals[key] = target[key]; target[key] = value; }
  return () => { for (const [key, value] of Object.entries(originals)) target[key] = value; };
}

test('confirming debt open twice does not duplicate AR-DEBT-OPEN', async () => {
  const order = { id: 'SO-IDEMP', code: 'B-IDEMP', customerCode: 'C1', customerName: 'KH' };
  const closeout = { version: 1, finalDebtAmount: 123000, originalAmount: 200000, returnedAmount: 0, collectedAmount: 77000, calculationHash: 'hash' };
  const posted = [];
  let existing = [];
  ArDebtOpenPostingService._internal.setAdaptersForTest({
    paymentRepository: {
      findAll: async () => existing,
      upsert: async (entry) => { posted.push(entry); existing = [entry]; return entry; }
    },
    arDebtReadModel: { rebuildDebtForSource: async () => ({}) }
  });
  try {
    const first = await ArDebtOpenPostingService.postDebtOpen(order, closeout);
    const second = await ArDebtOpenPostingService.postDebtOpen(order, closeout);
    assert.equal(first.posted, true);
    assert.equal(second.idempotent, true);
  } finally {
    ArDebtOpenPostingService._internal.setAdaptersForTest();
  }
  assert.equal(posted.length, 1);
});
