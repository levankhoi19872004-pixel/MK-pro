'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');
const remittanceDomain = require('../src/domain/fund/deliveryRemittanceLines');
const { readSource } = require('./helpers/sourceBundle.util');

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

function baseSubmission(overrides = {}) {
  return {
    id: 'SUB-230-1',
    code: 'NQGH-20260709-ghtp',
    deliveryDate: '2026-07-09',
    deliveryStaffCode: 'ghtp',
    deliveryStaffName: 'Hiếu Giao Hàng TP',
    reportCashAmount: 15533000,
    reportBankAmount: 0,
    submittedCashAmount: 15533000,
    submittedBankAmount: 0,
    differenceCashAmount: 0,
    differenceBankAmount: 0,
    status: 'pending',
    fundPosted: false,
    hasPostedLines: false,
    remittanceLines: [],
    ...overrides
  };
}

function makeHarness(initialSubmission, options = {}) {
  let submissionState = structuredClone(initialSubmission);
  const ledgerRows = [];
  const auditRows = [];
  const shortageRows = [];
  const deliveryOrders = options.deliveryOrders || [];

  const harness = freshFundService({
    'src/repositories/deliveryCashSubmissionRepository.js': {
      findByIdOrCode: async (value) => {
        if (!submissionState) return null;
        return [submissionState.id, submissionState.code].includes(String(value)) ? structuredClone(submissionState) : null;
      },
      findAll: async () => submissionState ? [structuredClone(submissionState)] : [],
      upsert: async (row) => {
        submissionState = structuredClone(row);
        return structuredClone(submissionState);
      },
      patchByIdOrCode: async (_value, patch) => {
        submissionState = { ...submissionState, ...structuredClone(patch) };
        return structuredClone(submissionState);
      }
    },
    'src/repositories/fundLedgerRepository.js': {
      findAll: async (filter = {}) => {
        if (filter.idempotencyKey) return ledgerRows.filter((row) => row.idempotencyKey === filter.idempotencyKey).map((row) => structuredClone(row));
        if (filter.sourceType === 'DELIVERY_CASH_SUBMISSION') return ledgerRows.map((row) => structuredClone(row));
        if (filter.code && filter.code.$regex) return ledgerRows.map((row) => structuredClone(row));
        return ledgerRows.map((row) => structuredClone(row));
      },
      findByIdempotencyKey: async (key) => {
        const found = ledgerRows.find((row) => row.idempotencyKey === key);
        return found ? structuredClone(found) : null;
      },
      upsert: async (row) => {
        const found = ledgerRows.find((entry) => entry.idempotencyKey === row.idempotencyKey);
        if (found) return structuredClone(found);
        ledgerRows.push(structuredClone(row));
        return structuredClone(row);
      }
    },
    'src/repositories/deliveryCashShortageRepository.js': {
      findAll: async () => shortageRows.map(structuredClone),
      findBySourceAndFundType: async () => null,
      upsert: async (row) => {
        shortageRows.push(structuredClone(row));
        return structuredClone(row);
      }
    },
    'src/repositories/deliveryShortageRepaymentRepository.js': { findAll: async () => [] },
    'src/repositories/expenseVoucherRepository.js': { findAll: async () => [] },
    'src/repositories/fundTransferRepository.js': { findAll: async () => [] },
    'src/services/auditService.js': {
      log: async (event, payload) => {
        auditRows.push({ event, payload: structuredClone(payload) });
        return null;
      }
    },
    'src/utils/transaction.util.js': { withMongoTransaction: async (work) => work({ id: 'TEST_SESSION' }) },
    'src/services/master-order/masterOrderDelivery.service.js': {
      listDeliveryTodayOrdersCompact: async () => ({ orders: structuredClone(deliveryOrders), summary: {} })
    },
    'src/services/delivery/DeliveryPaymentStateReadService.js': {
      resolvePaymentStatesForOrders: async (orders = []) => ({
        statesByIdentity: new Map(orders.flatMap((row) => {
          const state = {
            cashAmount: row.cashAmount || 0,
            bankAmount: row.bankAmount || 0,
            rewardAmount: row.rewardAmount || row.bonusAmount || 0,
            source: { paymentState: 'orders.top-level' }
          };
          return [[row.id, state], [row.orderCode, state], [row.code, state]].filter(([key]) => key);
        }))
      }),
      stateForOrder: (row, map) => map.get(row.id) || map.get(row.orderCode) || map.get(row.code) || {
        cashAmount: row.cashAmount || 0,
        bankAmount: row.bankAmount || 0,
        rewardAmount: row.rewardAmount || row.bonusAmount || 0,
        source: { paymentState: 'orders.top-level' }
      }
    }
  });

  return {
    ...harness,
    ledgerRows,
    auditRows,
    shortageRows,
    get submission() { return structuredClone(submissionState); },
    set submission(value) { submissionState = structuredClone(value); }
  };
}

function confirmedLedgerFixture(ledgerRows) {
  return ledgerRows.map((row) => ({
    ...row,
    active: row.active !== false,
    accountingConfirmed: row.accountingConfirmed !== false,
    accountingStatus: row.accountingStatus || 'confirmed',
    status: row.status || 'posted',
    reversed: false
  }));
}

test('Phase230: giao ngày 09, nộp cash ngày 10 thì ledger và balance ghi ngày 10', async () => {
  const submission = baseSubmission({
    remittanceLines: [{ lineId: 'CASH-1', method: 'cash', amount: 15533000, remittanceDate: '2026-07-10', status: 'draft' }]
  });
  const harness = makeHarness(submission);
  try {
    const result = await harness.service.confirmDeliveryRemittanceLine(submission.code, 'CASH-1', { confirmedBy: 'admin' });
    assert.equal(result.idempotent, false);
    assert.equal(harness.ledgerRows.length, 1);
    assert.equal(harness.ledgerRows[0].date, '2026-07-10');
    assert.equal(harness.ledgerRows[0].accountingDate, '2026-07-10');
    assert.equal(harness.ledgerRows[0].remittanceDate, '2026-07-10');
    assert.equal(harness.ledgerRows[0].deliveryDate, '2026-07-09');

    const rows = confirmedLedgerFixture(harness.ledgerRows);
    const day9 = FundBalanceReadService.calculateFixture(rows, { full: true, dateFrom: '2026-07-09', dateTo: '2026-07-09' });
    const day10 = FundBalanceReadService.calculateFixture(rows, { full: true, dateFrom: '2026-07-10', dateTo: '2026-07-10' });
    assert.equal(day9.summary.cashEndingBalance, 0);
    assert.equal(day10.summary.cashEndingBalance, 15533000);
  } finally {
    harness.restore();
  }
});

test('Phase230: cash và bank khác ngày tạo hai ledger đúng quỹ, đúng accounting date', async () => {
  const submission = baseSubmission({
    reportCashAmount: 10000000,
    reportBankAmount: 5533000,
    remittanceLines: [
      { lineId: 'CASH-A', method: 'cash', amount: 10000000, remittanceDate: '2026-07-09', status: 'draft' },
      { lineId: 'BANK-A', method: 'bank', amount: 5533000, remittanceDate: '2026-07-10', bankAccountCode: 'VCB', bankReference: 'FT-MASKED', status: 'draft' }
    ]
  });
  const harness = makeHarness(submission);
  try {
    const result = await harness.service.confirmDeliveryCashSubmission(submission.code, { confirmedBy: 'admin' });
    assert.equal(result.error, undefined);
    assert.equal(harness.ledgerRows.length, 2);
    const cash = harness.ledgerRows.find((row) => row.fundType === 'cash');
    const bank = harness.ledgerRows.find((row) => row.fundType === 'bank');
    assert.equal(cash.date, '2026-07-09');
    assert.equal(bank.date, '2026-07-10');
    assert.equal(bank.bankAccountCode, 'VCB');
    assert.equal(bank.sourceLineId, 'BANK-A');
  } finally {
    harness.restore();
  }
});

test('Phase230: cùng một ngày giao có thể nộp cash nhiều lần ở nhiều ngày', async () => {
  const submission = baseSubmission({
    remittanceLines: [
      { lineId: 'CASH-P1', method: 'cash', amount: 10000000, remittanceDate: '2026-07-09', status: 'draft' },
      { lineId: 'CASH-P2', method: 'cash', amount: 5533000, remittanceDate: '2026-07-10', status: 'draft' }
    ]
  });
  const harness = makeHarness(submission);
  try {
    await harness.service.confirmDeliveryCashSubmission(submission.code, { confirmedBy: 'admin' });
    assert.equal(harness.ledgerRows.length, 2);
    assert.deepEqual(harness.ledgerRows.map((row) => row.date).sort(), ['2026-07-09', '2026-07-10']);
    assert.equal(harness.submission.totalActualCashAmount, 15533000);
    assert.equal(harness.submission.remainingCashAmount, 0);
    assert.equal(harness.submission.status, 'confirmed');
  } finally {
    harness.restore();
  }
});

test('Phase230: dòng pending/submitted không tự sinh fundLedger và không vào balance', () => {
  const lines = remittanceDomain.normalizeLines([
    { lineId: 'PENDING', method: 'cash', amount: 15533000, remittanceDate: '2026-07-10', status: 'submitted' }
  ], { submissionIdentity: 'SUB-PENDING' });
  const summary = remittanceDomain.applyLineSummary(baseSubmission(), lines);
  assert.equal(summary.totalActualCashAmount, 0);
  assert.equal(summary.status, 'pending');
  const balance = FundBalanceReadService.calculateFixture([], { full: true, dateFrom: '2026-07-10', dateTo: '2026-07-10' });
  assert.equal(balance.summary.cashEndingBalance, 0);
});

test('Phase230: xác nhận riêng một dòng tạo trạng thái partially_confirmed', async () => {
  const submission = baseSubmission({
    reportCashAmount: 10000000,
    reportBankAmount: 5533000,
    remittanceLines: [
      { lineId: 'CASH-LINE', method: 'cash', amount: 10000000, remittanceDate: '2026-07-10', status: 'submitted' },
      { lineId: 'BANK-LINE', method: 'bank', amount: 5533000, remittanceDate: '2026-07-11', status: 'submitted' }
    ]
  });
  const harness = makeHarness(submission);
  try {
    const result = await harness.service.confirmDeliveryRemittanceLine(submission.code, 'CASH-LINE', { confirmedBy: 'admin' });
    assert.equal(result.submission.status, 'partially_confirmed');
    assert.equal(result.submission.hasPostedLines, true);
    assert.equal(result.submission.fundPosted, false);
    assert.equal(harness.ledgerRows.length, 1);
    assert.equal(harness.ledgerRows[0].fundType, 'cash');
    assert.equal(result.submission.remittanceLines.find((line) => line.lineId === 'BANK-LINE').status, 'submitted');
  } finally {
    harness.restore();
  }
});

test('Phase230: xác nhận cùng line hai lần là idempotent', async () => {
  const submission = baseSubmission({
    remittanceLines: [{ lineId: 'IDEMP-LINE', method: 'cash', amount: 15533000, remittanceDate: '2026-07-10', status: 'draft' }]
  });
  const harness = makeHarness(submission);
  try {
    const first = await harness.service.confirmDeliveryRemittanceLine(submission.code, 'IDEMP-LINE', { confirmedBy: 'admin' });
    const second = await harness.service.confirmDeliveryRemittanceLine(submission.code, 'IDEMP-LINE', { confirmedBy: 'admin' });
    assert.equal(first.idempotent, false);
    assert.equal(second.idempotent, true);
    assert.equal(harness.ledgerRows.length, 1);
    assert.match(harness.ledgerRows[0].idempotencyKey, /^FUND-DELIVERY-REMITTANCE:SUB-230-1:IDEMP-LINE:CASH$/);
  } finally {
    harness.restore();
  }
});

test('Phase230: chặn ngày nộp trước ngày giao', async () => {
  const submission = baseSubmission({
    deliveryDate: '2026-07-10',
    remittanceLines: [{ lineId: 'BAD-DATE', method: 'cash', amount: 1000, remittanceDate: '2026-07-09', status: 'draft' }]
  });
  const harness = makeHarness(submission);
  try {
    await assert.rejects(
      () => harness.service.confirmDeliveryRemittanceLine(submission.code, 'BAD-DATE', { confirmedBy: 'admin' }),
      (error) => error.code === 'REMITTANCE_DATE_BEFORE_DELIVERY_DATE'
    );
    assert.equal(harness.ledgerRows.length, 0);
  } finally {
    harness.restore();
  }
});

test('Phase230: chặn xác nhận ngày nộp trong tương lai', async () => {
  const submission = baseSubmission({
    remittanceLines: [{ lineId: 'FUTURE-DATE', method: 'cash', amount: 1000, remittanceDate: '2099-01-01', status: 'draft' }]
  });
  const harness = makeHarness(submission);
  try {
    await assert.rejects(
      () => harness.service.confirmDeliveryRemittanceLine(submission.code, 'FUTURE-DATE', { confirmedBy: 'admin' }),
      (error) => error.code === 'FUTURE_REMITTANCE_DATE'
    );
    assert.equal(harness.ledgerRows.length, 0);
  } finally {
    harness.restore();
  }
});

test('Phase230: chặn post vào kỳ quỹ đã khóa', async () => {
  const previous = process.env.FUND_ACCOUNTING_LOCKED_THROUGH_DATE;
  process.env.FUND_ACCOUNTING_LOCKED_THROUGH_DATE = '2026-07-10';
  const submission = baseSubmission({
    remittanceLines: [{ lineId: 'LOCKED-DATE', method: 'cash', amount: 1000, remittanceDate: '2026-07-10', status: 'draft' }]
  });
  const harness = makeHarness(submission);
  try {
    await assert.rejects(
      () => harness.service.confirmDeliveryRemittanceLine(submission.code, 'LOCKED-DATE', { confirmedBy: 'admin' }),
      (error) => error.code === 'ACCOUNTING_PERIOD_LOCKED'
    );
    assert.equal(harness.ledgerRows.length, 0);
  } finally {
    if (previous === undefined) delete process.env.FUND_ACCOUNTING_LOCKED_THROUGH_DATE;
    else process.env.FUND_ACCOUNTING_LOCKED_THROUGH_DATE = previous;
    harness.restore();
  }
});

test('Phase230: dòng đã posted không được sửa amount/date/method; sai ngày phải reversal + replacement', () => {
  const current = [{
    lineId: 'POSTED', method: 'cash', amount: 15533000, remittanceDate: '2026-07-10',
    status: 'confirmed', fundLedgerId: 'FL00001'
  }];
  const incoming = [{
    lineId: 'POSTED', method: 'cash', amount: 15533000, remittanceDate: '2026-07-11',
    status: 'confirmed', fundLedgerId: 'FL00001'
  }];
  const merged = remittanceDomain.mergeEditableLines(current, incoming, { submissionIdentity: 'SUB-1' });
  assert.equal(merged.code, 'POSTED_REMITTANCE_LINE_IMMUTABLE');
  assert.match(merged.error, /không được sửa/);
});

test('Phase230: legacy confirmed đã có fund ledger chỉ derive read-only line, không post lần hai', async () => {
  const legacy = baseSubmission({
    id: 'LEGACY-CONF', code: 'NQGH-20260709-legacy', status: 'confirmed', fundPosted: true,
    submittedCashAmount: 15533000, remittanceLines: []
  });
  const harness = makeHarness(legacy);
  harness.ledgerRows.push({
    id: 'FL-LEGACY', code: 'FL00999', date: '2026-07-09', accountingDate: '2026-07-09',
    fundType: 'cash', direction: 'in', amount: 15533000, sourceType: 'DELIVERY_CASH_SUBMISSION',
    sourceId: legacy.id, sourceCode: legacy.code, accountingConfirmed: true, status: 'posted', idempotencyKey: 'LEGACY-KEY'
  });
  try {
    const listed = await harness.service.listDeliveryCashSubmissions({});
    assert.equal(listed.submissions.length, 1);
    assert.equal(listed.submissions[0].legacyDerived, true);
    assert.equal(listed.submissions[0].remittanceLines[0].legacyDerived, true);
    assert.equal(listed.submissions[0].remittanceLines[0].status, 'confirmed');
    const result = await harness.service.confirmDeliveryCashSubmission(legacy.code, { confirmedBy: 'admin' });
    assert.match(result.message, /đã ghi sổ quỹ/);
    assert.equal(harness.ledgerRows.length, 1);
  } finally {
    harness.restore();
  }
});

test('Phase230: legacy pending thiếu remittanceDate phải manual review và không xác nhận', async () => {
  const legacy = baseSubmission({
    id: 'LEGACY-PENDING', code: 'NQGH-20260709-pending', submittedCashAmount: 15533000,
    remittanceLines: [], status: 'pending', fundPosted: false
  });
  const harness = makeHarness(legacy);
  try {
    const listed = await harness.service.listDeliveryCashSubmissions({});
    const line = listed.submissions[0].remittanceLines[0];
    assert.equal(line.remittanceDate, '');
    assert.equal(line.manualReviewRequired, true);
    const result = await harness.service.confirmDeliveryCashSubmission(legacy.code, { confirmedBy: 'admin' });
    assert.equal(result.code, 'REMITTANCE_DATE_REQUIRED');
    assert.equal(result.manualReviewRequired, true);
    assert.equal(harness.ledgerRows.length, 0);
  } finally {
    harness.restore();
  }
});

test('Phase230: Phase228 invariant cùng dateTo vẫn giữ nguyên với ledger remittance', () => {
  const rows = confirmedLedgerFixture([
    { id: 'R1', code: 'R1', date: '2026-07-10', accountingDate: '2026-07-10', remittanceDate: '2026-07-10', deliveryDate: '2026-07-09', fundType: 'cash', direction: 'in', amount: 15533000, sourceType: 'DELIVERY_CASH_SUBMISSION' }
  ]);
  const a = FundBalanceReadService.calculateFixture(rows, { full: true, dateFrom: '2026-07-09', dateTo: '2026-07-10' });
  const b = FundBalanceReadService.calculateFixture(rows, { full: true, dateFrom: '2026-07-10', dateTo: '2026-07-10' });
  assert.equal(a.summary.cashEndingBalance, 15533000);
  assert.equal(a.summary.cashEndingBalance, b.summary.cashEndingBalance);
});

test('Phase230: deliveryDate + deliveryStaffCode vẫn dùng để tải đúng báo cáo phải nộp', async () => {
  const orders = [{
    id: 'ORDER-1', orderCode: 'B0039001', deliveryStaffCode: 'ghtp', deliveryStaffName: 'Hiếu Giao Hàng TP',
    cashAmount: 15000000, oldDebtCashCollected: 533000, bankAmount: 0
  }];
  const harness = makeHarness(null, { deliveryOrders: orders });
  try {
    const preview = await harness.service.buildDeliverySubmissionDraft({ deliveryDate: '2026-07-09', deliveryStaffCode: 'ghtp' });
    assert.equal(preview.error, undefined);
    assert.equal(preview.draft.deliveryDate, '2026-07-09');
    assert.equal(preview.draft.deliveryStaffCode, 'ghtp');
    assert.equal(preview.draft.reportCashAmount, 15533000);
    assert.equal(preview.draft.remittanceLines[0].remittanceDate === '2026-07-09', false, 'không được mặc định ngày nộp theo ngày giao cũ');
  } finally {
    harness.restore();
  }
});

test('Phase230: frontend/listing tách rõ Ngày giao, Ngày nộp và dùng remittanceLines', () => {
  const html = readSource(path.join(ROOT, 'public/index.html'));
  const frontend = readSource(path.join(ROOT, 'public/js/app/debt/07f-fund-ledger.js'));
  assert.match(html, /Ngày giao/i);
  assert.match(html, /Ngày nộp|Ngày nhận/i);
  assert.match(html, /\+ Tiền mặt/i);
  assert.match(html, /\+ Chuyển khoản/i);
  assert.match(frontend, /remittanceLines/);
  assert.match(frontend, /confirm-remittance-line/);
});

test('Phase230: model và writer giữ đủ deliveryDate/remittanceDate/accountingDate/sourceLineId', () => {
  const model = fs.readFileSync(path.join(ROOT, 'src/models/FundLedger.js'), 'utf8');
  const submissionModel = fs.readFileSync(path.join(ROOT, 'src/models/DeliveryCashSubmission.js'), 'utf8');
  const fundSource = readSource(path.join(ROOT, 'src/services/fundService.js'));
  assert.match(model, /accountingDate/);
  assert.match(model, /remittanceDate/);
  assert.match(model, /sourceLineId/);
  assert.match(submissionModel, /remittanceLines/);
  assert.match(fundSource, /date:\s*line\.remittanceDate/);
  assert.match(fundSource, /accountingDate:\s*line\.remittanceDate/);
  assert.match(fundSource, /deliveryDate:\s*submission\.deliveryDate/);
});

test('Phase230: normalize ngày giữ YYYY-MM-DD theo Asia/Ho_Chi_Minh, không lệch UTC', () => {
  const line = remittanceDomain.normalizeLine({
    lineId: 'TZ', method: 'cash', amount: 1000, remittanceDate: '2026-07-10T16:59:59.000Z'
  });
  assert.equal(line.remittanceDate, '2026-07-10');
  const boundary = FundBalanceReadService.calculateFixture(confirmedLedgerFixture([{
    id: 'TZ-LEDGER', code: 'TZ-LEDGER', date: '', createdAt: '2026-07-10T16:59:59.000Z',
    fundType: 'cash', direction: 'in', amount: 1000, sourceType: 'DELIVERY_CASH_SUBMISSION'
  }]), { full: true, dateFrom: '2026-07-10', dateTo: '2026-07-10', timezone: 'Asia/Ho_Chi_Minh' });
  assert.equal(boundary.summary.cashEndingBalance, 1000);
});

test('Phase230: Phase229 order identity fix vẫn hiện diện, không rollback AR closeout guard', () => {
  const identitySource = fs.readFileSync(path.join(ROOT, 'src/domain/ar/arOrderIdentity.js'), 'utf8');
  const reconcileSource = fs.readFileSync(path.join(ROOT, 'src/services/accounting/OrderPaymentDebtReconcileService.js'), 'utf8');
  assert.match(identitySource, /businessIdentityKeys/);
  assert.match(reconcileSource, /CANONICAL_AR_ORDER_IDENTITY_UNRESOLVED/);
});

test('Phase230: audit fixture phát hiện đúng ledger backdated và chỉ lập remediation plan read-only', () => {
  const audit = require('../scripts/audit-delivery-remittance-accounting-date');
  const fixture = audit.fixtureData();
  const result = audit.auditData(fixture.submissions, fixture.ledgers, {});
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.countsBySeverity.OK, 1);
  assert.equal(result.countsBySeverity.P0_FUND_LEDGER_POSTED_ON_DELIVERY_DATE, 1);
  assert.equal(result.countsBySeverity.WARNING_MISSING_REMITTANCE_DATE, 1);
  const p0 = result.rows.find((row) => row.severity === 'P0_FUND_LEDGER_POSTED_ON_DELIVERY_DATE');
  assert.equal(p0.remediationPlan.applyAutomatically, false);
  assert.equal(p0.fundLedgerDate, '2026-07-09');
  assert.equal(p0.declaredRemittanceDate, '2026-07-10');
});

test('Phase230: package exposes read-only audit command', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['audit:delivery-remittance-accounting-date'], 'node scripts/audit-delivery-remittance-accounting-date.js --json');
});

test('Phase230: method ngoài cash/bank bị chặn trước khi post fundLedger', async () => {
  const submission = baseSubmission({
    remittanceLines: [{ lineId: 'INVALID-METHOD', method: 'crypto', amount: 1000, remittanceDate: '2026-07-10', status: 'draft' }]
  });
  const harness = makeHarness(submission);
  try {
    const result = await harness.service.confirmDeliveryCashSubmission(submission.code, { confirmedBy: 'admin' });
    assert.equal(result.code, 'INVALID_REMITTANCE_METHOD');
    assert.equal(harness.ledgerRows.length, 0);
  } finally {
    harness.restore();
  }
});
