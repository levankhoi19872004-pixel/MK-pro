'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

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

function freshFundService(stubs) {
  const restores = Object.entries(stubs).map(([file, value]) => installStub(file, value));
  const servicePath = modulePath('src/services/fundService.js');
  const previous = require.cache[servicePath];
  delete require.cache[servicePath];
  const service = require(servicePath);
  return {
    service,
    restore() {
      delete require.cache[servicePath];
      if (previous) require.cache[servicePath] = previous;
      restores.reverse().forEach((fn) => fn());
    }
  };
}

function commonEmptyRepos() {
  return {
    'src/repositories/expenseVoucherRepository.js': { findAll: async () => [] },
    'src/repositories/fundTransferRepository.js': { findAll: async () => [] },
    'src/services/auditService.js': { log: async () => null },
    'src/utils/transaction.util.js': { withMongoTransaction: async (work) => work(null) }
  };
}

test('phiếu thiếu không được xác nhận khi chưa phân loại trách nhiệm', async () => {
  const submission = {
    id: 'SUB_1', code: 'NQGH-20260617-ghth', deliveryDate: '2026-06-17',
    deliveryStaffCode: 'ghth', deliveryStaffName: 'Thành GH',
    reportCashAmount: 100000, submittedCashAmount: 60000, differenceCashAmount: -40000,
    reportBankAmount: 0, submittedBankAmount: 0, differenceBankAmount: 0,
    status: 'pending', fundPosted: false
  };
  let submissionWrites = 0;
  let ledgerWrites = 0;
  const harness = freshFundService({
    ...commonEmptyRepos(),
    'src/repositories/deliveryCashSubmissionRepository.js': {
      findByIdOrCode: async () => ({ ...submission }),
      upsert: async () => { submissionWrites += 1; }
    },
    'src/repositories/fundLedgerRepository.js': {
      findAll: async () => [],
      findByIdempotencyKey: async () => null,
      upsert: async () => { ledgerWrites += 1; }
    },
    'src/repositories/deliveryCashShortageRepository.js': {
      findBySourceAndFundType: async () => null,
      upsert: async () => null
    },
    'src/repositories/deliveryShortageRepaymentRepository.js': {}
  });
  try {
    const result = await harness.service.confirmDeliveryCashSubmission(submission.code, {});
    assert.equal(result.status, 422);
    assert.equal(result.requiresShortageResolution, true);
    assert.equal(submissionWrites, 0);
    assert.equal(ledgerWrites, 0);
  } finally {
    harness.restore();
  }
});

test('xác nhận thiếu do NVGH tạo công nợ thiếu quỹ riêng và chỉ ghi số thực nộp vào fundLedgers', async () => {
  const submission = {
    id: 'SUB_2', code: 'NQGH-20260617-ghth', deliveryDate: '2026-06-17',
    deliveryStaffCode: 'ghth', deliveryStaffName: 'Thành GH',
    reportCashAmount: 100000, submittedCashAmount: 60000, differenceCashAmount: -40000,
    reportBankAmount: 0, submittedBankAmount: 0, differenceBankAmount: 0,
    status: 'pending', fundPosted: false
  };
  let savedSubmission = null;
  const shortageRows = [];
  const ledgerRows = [];
  const harness = freshFundService({
    ...commonEmptyRepos(),
    'src/repositories/deliveryCashSubmissionRepository.js': {
      findByIdOrCode: async () => ({ ...submission }),
      upsert: async (row) => { savedSubmission = { ...row }; return row; }
    },
    'src/repositories/fundLedgerRepository.js': {
      findAll: async () => ledgerRows,
      findByIdempotencyKey: async (key) => ledgerRows.find((row) => row.idempotencyKey === key) || null,
      upsert: async (row) => { ledgerRows.push({ ...row }); return row; }
    },
    'src/repositories/deliveryCashShortageRepository.js': {
      findBySourceAndFundType: async () => null,
      upsert: async (row) => { shortageRows.push({ ...row }); return row; }
    },
    'src/repositories/deliveryShortageRepaymentRepository.js': {}
  });
  try {
    const result = await harness.service.confirmDeliveryCashSubmission(submission.code, {
      confirmedBy: 'admin',
      shortageResolution: { cash: { reasonType: 'collected_not_remitted', note: 'NVGH hẹn nộp bù' } }
    });
    assert.equal(result.error, undefined);
    assert.equal(savedSubmission.status, 'confirmed');
    assert.equal(savedSubmission.fundPosted, true);
    assert.equal(ledgerRows.length, 1);
    assert.equal(ledgerRows[0].amount, 60000);
    assert.equal(ledgerRows[0].fundType, 'cash');
    assert.equal(shortageRows.length, 1);
    assert.equal(shortageRows[0].responsibleType, 'delivery_staff');
    assert.equal(shortageRows[0].originalShortageAmount, 40000);
    assert.equal(shortageRows[0].outstandingAmount, 40000);
    assert.equal(shortageRows[0].status, 'open');
  } finally {
    harness.restore();
  }
});

test('phiếu nộp bù chỉ tăng quỹ khi xác nhận và giảm đúng số còn thiếu', async () => {
  const shortage = {
    id: 'SHORT_1', code: 'DCSH-NQGH-20260617-ghth-TM', sourceSubmissionId: 'SUB_3',
    sourceSubmissionCode: 'NQGH-20260617-ghth', deliveryDate: '2026-06-17',
    deliveryStaffCode: 'ghth', deliveryStaffName: 'Thành GH', fundType: 'cash',
    responsibleType: 'delivery_staff', originalShortageAmount: 40000,
    settledAmount: 0, adjustedAmount: 0, pendingRepaymentAmount: 0, outstandingAmount: 40000, status: 'open'
  };
  const repayments = [];
  const ledgerRows = [];
  const shortageState = { ...shortage };
  const harness = freshFundService({
    ...commonEmptyRepos(),
    'src/repositories/deliveryCashSubmissionRepository.js': {},
    'src/repositories/fundLedgerRepository.js': {
      findAll: async () => ledgerRows,
      findByIdempotencyKey: async (key) => ledgerRows.find((row) => row.idempotencyKey === key) || null,
      upsert: async (row) => { ledgerRows.push({ ...row }); return row; }
    },
    'src/repositories/deliveryCashShortageRepository.js': {
      findByIdOrCode: async () => ({ ...shortageState }),
      reservePendingRepayment: async (_id, amount) => {
        const pending = Number(shortageState.pendingRepaymentAmount || 0);
        const available = shortageState.outstandingAmount - pending;
        if (amount > available) return null;
        shortageState.pendingRepaymentAmount = pending + amount;
        return { ...shortageState };
      },
      applyConfirmedRepayment: async (_id, amount) => {
        if (amount > shortageState.outstandingAmount || amount > shortageState.pendingRepaymentAmount) return null;
        shortageState.settledAmount += amount;
        shortageState.pendingRepaymentAmount -= amount;
        shortageState.outstandingAmount -= amount;
        shortageState.status = shortageState.outstandingAmount === 0 ? 'settled' : 'partial';
        return { ...shortageState };
      }
    },
    'src/repositories/deliveryShortageRepaymentRepository.js': {
      findAll: async (filter = {}) => repayments.filter((row) => !filter.status || row.status === filter.status),
      upsert: async (row) => { repayments.push({ ...row }); return row; },
      findByIdOrCode: async (value) => repayments.find((row) => row.id === value || row.code === value) || null,
      markConfirmedIfPending: async (value, patch) => {
        const index = repayments.findIndex((row) => (row.id === value || row.code === value) && row.status === 'pending');
        if (index < 0) return null;
        repayments[index] = { ...repayments[index], ...patch };
        return { ...repayments[index] };
      }
    }
  });
  try {
    const created = await harness.service.createDeliveryShortageRepayment(shortage.id, {
      amount: 25000,
      fundType: 'cash',
      repaymentDate: '2026-06-18',
      createdBy: 'admin'
    });
    assert.equal(created.repayment.status, 'pending');
    assert.equal(ledgerRows.length, 0);
    assert.equal(shortageState.outstandingAmount, 40000);
    assert.equal(shortageState.pendingRepaymentAmount, 25000);

    await assert.rejects(
      () => harness.service.createDeliveryShortageRepayment(shortage.id, {
        amount: 20000,
        fundType: 'cash',
        repaymentDate: '2026-06-18',
        createdBy: 'admin'
      }),
      /vượt số còn có thể lập phiếu/
    );
    assert.equal(shortageState.pendingRepaymentAmount, 25000);
    assert.equal(ledgerRows.length, 0);

    const confirmed = await harness.service.confirmDeliveryShortageRepayment(created.repayment.code, { confirmedBy: 'admin' });
    assert.equal(confirmed.repayment.status, 'confirmed');
    assert.equal(ledgerRows.length, 1);
    assert.equal(ledgerRows[0].amount, 25000);
    assert.equal(ledgerRows[0].sourceType, 'DELIVERY_SHORTAGE_REPAYMENT');
    assert.equal(shortageState.outstandingAmount, 15000);
    assert.equal(shortageState.pendingRepaymentAmount, 0);
    assert.equal(shortageState.status, 'partial');
  } finally {
    harness.restore();
  }
});
