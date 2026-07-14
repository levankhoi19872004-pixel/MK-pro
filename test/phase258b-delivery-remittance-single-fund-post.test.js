'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');

const ROOT = path.resolve(__dirname, '..');

function modulePath(relativePath) {
  return require.resolve(path.join(ROOT, relativePath));
}

function installStub(relativePath, exportsValue) {
  const filename = modulePath(relativePath);
  const previous = require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsValue };
  return () => {
    if (previous) require.cache[filename] = previous;
    else delete require.cache[filename];
  };
}

test('Phase258B: confirmed delivery remittance creates exactly one cash and one bank fund ledger', async () => {
  let submission = {
    id: 'SUB-258B',
    code: 'NQGH-20260714-ghth',
    deliveryDate: '2026-07-14',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'GH Thanh',
    reportCashAmount: 1000000,
    reportBankAmount: 500000,
    status: 'pending',
    fundPosted: false,
    remittanceLines: [
      { lineId: 'CASH-1', method: 'cash', amount: 1000000, remittanceDate: '2026-07-14', status: 'draft' },
      { lineId: 'BANK-1', method: 'bank', amount: 500000, remittanceDate: '2026-07-14', status: 'draft', bankAccountCode: 'BANK' }
    ]
  };
  const ledgerRows = [];
  const restores = [
    installStub('src/utils/transaction.util.js', { withMongoTransaction: async (work) => work({ id: 'TEST_SESSION' }) }),
    installStub('src/repositories/deliveryCashSubmissionRepository.js', {
      findByIdOrCode: async () => structuredClone(submission),
      upsert: async (row) => {
        submission = structuredClone(row);
        return structuredClone(submission);
      },
      findAll: async () => [structuredClone(submission)]
    }),
    installStub('src/repositories/fundLedgerRepository.js', {
      findByIdempotencyKey: async (key) => ledgerRows.find((row) => row.idempotencyKey === key) || null,
      upsert: async (row) => {
        ledgerRows.push(structuredClone(row));
        return structuredClone(row);
      },
      findAll: async () => []
    }),
    installStub('src/repositories/deliveryCashShortageRepository.js', { findAll: async () => [] }),
    installStub('src/repositories/deliveryShortageRepaymentRepository.js', { findAll: async () => [] }),
    installStub('src/repositories/expenseVoucherRepository.js', { findAll: async () => [] }),
    installStub('src/repositories/fundTransferRepository.js', { findAll: async () => [] }),
    installStub('src/services/auditService.js', { log: async () => null }),
    installStub('src/services/master-order/masterOrderDelivery.service.js', { listDeliveryTodayOrdersCompact: async () => ({ orders: [], summary: {} }) })
  ];
  const servicePath = modulePath('src/services/fundService.js');
  const previous = require.cache[servicePath];
  delete require.cache[servicePath];
  try {
    const fundService = require(servicePath);
    const result = await fundService.confirmDeliveryCashSubmission(submission.code, { confirmedBy: 'accountant' });
    assert.equal(result.error, undefined);
    assert.equal(ledgerRows.length, 2);
    assert.deepEqual(ledgerRows.map((row) => row.sourceType), ['DELIVERY_CASH_SUBMISSION', 'DELIVERY_CASH_SUBMISSION']);
    assert.equal(ledgerRows.some((row) => String(row.idempotencyKey || '').startsWith('FUND:OPA:')), false);
    assert.equal(ledgerRows.find((row) => row.fundType === 'cash').amount, 1000000);
    assert.equal(ledgerRows.find((row) => row.fundType === 'bank').amount, 500000);

    const balance = FundBalanceReadService.calculateFixture(ledgerRows, { dateFrom: '2026-07-14', dateTo: '2026-07-14', full: true });
    assert.equal(balance.summary.cashInPeriod, 1000000);
    assert.equal(balance.summary.bankInPeriod, 500000);
    assert.equal(balance.summary.totalInPeriod, 1500000);
  } finally {
    delete require.cache[servicePath];
    if (previous) require.cache[servicePath] = previous;
    restores.reverse().forEach((fn) => fn());
  }
});
