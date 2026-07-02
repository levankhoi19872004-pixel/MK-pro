'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { validateArLedgerContract } = require('../src/domain/ar/arLedgerValidator');
const manualDebtPostingService = require('../src/services/accounting/manualDebtPostingService');

test('manual debt writer builds canonical AR-DEBT-ADJUSTMENT debit ledger without salesOrder/returnOrder writes', () => {
  const normalized = manualDebtPostingService.normalizeManualDebtInput({
    customerCode: 'BBHOASON',
    debtType: 'OPENING_DEBT',
    amount: '1.000.000',
    postingDate: '2026-07-03',
    note: 'Công nợ đầu kỳ tháng 07/2026',
    referenceNo: 'BB-HOASON-OPENING-202607'
  });
  const source = manualDebtPostingService.buildManualDebtSource(normalized);
  const ledger = manualDebtPostingService.buildManualDebtLedger({}, {
    normalized,
    source,
    now: '2026-07-03T00:00:00.000Z',
    actor: { username: 'accountant' },
    customer: { _id: 'cust1', code: 'BBHOASON', name: 'Hoa Sơn' },
    salesStaff: { code: '35093', name: 'NVBH A' },
    deliveryStaff: { code: 'ghth', name: 'Thành GH Tiền Hải' }
  });

  assert.equal(ledger.category, 'AR-DEBT-ADJUSTMENT');
  assert.equal(ledger.ledgerType, 'AR-DEBT-ADJUSTMENT');
  assert.equal(ledger.entryType, 'normal');
  assert.equal(ledger.sourceType, 'MANUAL_DEBT');
  assert.equal(ledger.debit, 1000000);
  assert.equal(ledger.credit, 0);
  assert.equal(ledger.direction, 'debit');
  assert.equal(ledger.amountField, 'debit');
  assert.equal(ledger.active, true);
  assert.equal(ledger.reversed, false);
  assert.equal(ledger.accountingConfirmed, true);
  assert.equal(ledger.accountingStatus, 'confirmed');
  assert.equal(ledger.metadata.debtType, 'OPENING_DEBT');
  assert.match(ledger.idempotencyKey, /^AR-DEBT-ADJUSTMENT:/);
  assert.equal(validateArLedgerContract(ledger).ok, true);
});

test('manual debt validation rejects missing customer and non-positive amount', () => {
  assert.throws(() => manualDebtPostingService.normalizeManualDebtInput({ amount: 1, postingDate: '2026-07-03', note: 'x' }), /Cần chọn khách hàng/);
  assert.throws(() => manualDebtPostingService.normalizeManualDebtInput({ customerCode: 'C001', amount: 0, postingDate: '2026-07-03', note: 'x' }), /Số tiền công nợ phải lớn hơn 0/);
});

test('createManualDebt validates customer/staff and persists one AR ledger through arLedgers only', async () => {
  const created = [];
  const query = (value) => ({ lean: async () => value, session() { return this; } });
  manualDebtPostingService.setModelsForTest({
    Customer: { findOne: () => query({ _id: 'cust1', code: 'C001', name: 'Khách 001' }) },
    User: {
      findOne: (filter) => query(filter.role === 'delivery'
        ? { _id: 'd1', role: 'delivery', code: 'D001', fullName: 'Giao hàng 001' }
        : { _id: 's1', role: 'sales', code: 'S001', fullName: 'Bán hàng 001' })
    },
    ArLedger: {
      findOne: () => query(null),
      create: async (rows) => { created.push(...rows); return rows; }
    }
  });
  try {
    const result = await manualDebtPostingService.createManualDebt({
      customerCode: 'C001',
      debtType: 'MANUAL_DEBT',
      amount: 250000,
      postingDate: '2026-07-03',
      salesStaffCode: 'S001',
      deliveryStaffCode: 'D001',
      note: 'Nợ ngoài bán hàng',
      referenceNo: 'BB-001'
    }, { actor: { username: 'admin' } });

    assert.equal(result.created, true);
    assert.equal(created.length, 1);
    assert.equal(created[0].sourceType, 'MANUAL_DEBT');
    assert.equal(created[0].customerCode, 'C001');
    assert.equal(created[0].salesStaffCode, 'S001');
    assert.equal(created[0].deliveryStaffCode, 'D001');
    assert.equal(created[0].amount, 250000);
    assert.equal(validateArLedgerContract(created[0]).ok, true);
  } finally {
    manualDebtPostingService.setModelsForTest(null);
  }
});
