'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildArSaleLedger, buildArSaleReversalLedger } = require('../src/domain/ar/arLedgerContract');
const { auditArLedgerContractRows } = require('../scripts/audit-ar-ledger-contract');
const { b0038423Order } = require('./helpers/phase79FakeModels');

test('audit detects missing contract, ACC id with REV batch, duplicate sale, duplicate reversal and reversed-but-active', () => {
  const sale = buildArSaleLedger(b0038423Order(), { accountant: 'kt01', timestamp: '1' });
  const sale2 = { ...buildArSaleLedger(b0038423Order(), { accountant: 'kt01', timestamp: '2' }), id: 'AR-SALE-DUP', code: 'AR-SALE-DUP', idempotencyKey: 'AR-SALE:salesOrder:SO1782550380164673:DUP' };
  const rev = buildArSaleReversalLedger(sale, { accountant: 'kt01', timestamp: '3' });
  const rev2 = { ...rev, id: 'AR-SALE-REVERSAL-DUP', code: 'AR-SALE-REVERSAL-DUP', idempotencyKey: `${rev.idempotencyKey}:DUP` };
  const dirty = {
    account: 'AR', accountingConfirmed: true, accountingStatus: 'confirmed', active: true,
    id: 'AR-SALE-B0038423-ACC-SO1782550380164673', code: 'AR-SALE-B0038423', accountingBatchId: 'REV-SO1782550380164673-1',
    sourceId: 'SO1782550380164673', sourceCode: 'B0038423', customerCode: '4501221', debit: 100, credit: 0, amount: 100, direction: 'debit', amountField: 'debit'
  };
  const reversedButActive = { ...sale, id: 'AR-SALE-REVERSED-ACTIVE', code: 'AR-SALE-REVERSED-ACTIVE', idempotencyKey: 'AR-SALE:salesOrder:SO1782550380164673:RBA', accountingStatus: 'reversed', active: true, reversed: false };
  const summary = auditArLedgerContractRows([sale, sale2, rev, rev2, dirty, reversedButActive]);
  const codes = new Set(summary.issues.map((item) => item.code));
  assert.ok(codes.has('DIRTY_LEDGER_MISSING_CATEGORY'));
  assert.ok(codes.has('DIRTY_LEDGER_MISSING_LEDGER_TYPE'));
  assert.ok(codes.has('DIRTY_LEDGER_MISSING_ENTRY_TYPE'));
  assert.ok(codes.has('DIRTY_LEDGER_ACC_ID_REV_BATCH_MISMATCH'));
  assert.ok(codes.has('DIRTY_LEDGER_DUPLICATE_AR_SALE'));
  assert.ok(codes.has('DIRTY_LEDGER_DUPLICATE_REVERSAL'));
  assert.ok(codes.has('DIRTY_LEDGER_REVERSED_BUT_ACTIVE'));
  assert.equal(summary.caseB0038423.length >= 1, true);
});
