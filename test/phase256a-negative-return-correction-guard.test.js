'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const correctionService = require('../src/services/deliveryCloseoutCorrection.service');

function calculated({ previousReturn = 291176, delta = 0, receivable = 1000000 } = {}) {
  return {
    cashAdjustmentLines: [
      { paymentMethod: 'cash', newAmount: 0 },
      { paymentMethod: 'bank', newAmount: 0 },
      { paymentMethod: 'reward', newAmount: 0 }
    ],
    returnAdjustmentAmount: delta,
    currentState: {
      receivableAmount: receivable,
      returnAmount: previousReturn
    },
    finalState: {
      returnAmount: previousReturn + delta,
      debtAmount: receivable - previousReturn - delta
    }
  };
}

test('correction validator blocks negative final returned amount', () => {
  assert.throws(
    () => correctionService._internal.validateCorrectionInput({}, calculated({ previousReturn: 291176, delta: -400000 })),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'DELIVERY_CLOSEOUT_CORRECTION_NEGATIVE_RETURN');
      assert.equal(err.data.previousReturnAmount, 291176);
      assert.equal(err.data.returnAdjustmentAmount, -400000);
      assert.equal(err.data.newReturnAmount, -108824);
      return true;
    }
  );
});

test('correction validator blocks returned amount above receivable', () => {
  assert.throws(
    () => correctionService._internal.validateCorrectionInput({}, calculated({ previousReturn: 900000, delta: 200000, receivable: 1000000 })),
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'DELIVERY_CLOSEOUT_CORRECTION_RETURN_EXCEEDS_RECEIVABLE');
      assert.equal(err.data.receivableAmount, 1000000);
      assert.equal(err.data.newReturnAmount, 1100000);
      return true;
    }
  );
});

test('correction validator allows zero, no-change and positive valid returns', () => {
  assert.doesNotThrow(() => correctionService._internal.validateCorrectionInput({}, calculated({ previousReturn: 291176, delta: -291176 })));
  assert.doesNotThrow(() => correctionService._internal.validateCorrectionInput({}, calculated({ previousReturn: 291176, delta: 0 })));
  assert.doesNotThrow(() => correctionService._internal.validateCorrectionInput({}, calculated({ previousReturn: 291176, delta: 100000 })));
});

test('open and confirmed correction flows share validateCorrectionInput guard', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/deliveryCloseoutCorrection.service.js'), 'utf8');
  const openStart = source.indexOf('async function createOpenOrderAdjustment');
  const confirmedStart = source.indexOf('async function createCorrection');
  assert.ok(openStart > -1);
  assert.ok(confirmedStart > -1);
  assert.match(source.slice(openStart, confirmedStart), /validateCorrectionInput\(input,\s*calculated\)/);
  assert.match(source.slice(confirmedStart), /validateCorrectionInput\(input,\s*calculated\)/);
});
