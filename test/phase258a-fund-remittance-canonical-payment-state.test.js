'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_FILE = path.join(ROOT, 'PHASE258A_FUND_REMITTANCE_PAYMENT_STATE_EVIDENCE.json');

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

function chain(rows) {
  return {
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    lean: async () => structuredClone(rows)
  };
}

function clearRuntimeModules() {
  for (const relativePath of [
    'src/services/fundService.js',
    'src/services/delivery/DeliveryPaymentStateReadService.js',
    'src/services/v2/deliveryTodayNew.service.js'
  ]) {
    delete require.cache[modulePath(relativePath)];
  }
}

function legacyFirstPositive(row, keys) {
  for (const key of keys) {
    const value = Math.round(Number(row[key] || 0));
    if (value > 0) return value;
  }
  return 0;
}

function installFundHarness({ deliveryOrders, closeoutVersions, allocations }) {
  const restores = [
    installStub('src/utils/transaction.util.js', { withMongoTransaction: async (work) => work(null) }),
    installStub('src/repositories/fundLedgerRepository.js', {}),
    installStub('src/repositories/deliveryCashSubmissionRepository.js', { findByIdOrCode: async () => null, findAll: async () => [] }),
    installStub('src/repositories/expenseVoucherRepository.js', {}),
    installStub('src/repositories/fundTransferRepository.js', {}),
    installStub('src/repositories/deliveryCashShortageRepository.js', { findAll: async () => [] }),
    installStub('src/repositories/deliveryShortageRepaymentRepository.js', { findAll: async () => [] }),
    installStub('src/services/auditService.js', { log: async () => null }),
    installStub('src/services/master-order/masterOrderDelivery.service.js', {
      listDeliveryTodayOrdersCompact: async () => ({ orders: structuredClone(deliveryOrders), summary: { totalOrders: deliveryOrders.length } })
    }),
    installStub('src/models/DeliveryCloseoutVersion.js', { find: () => chain(closeoutVersions) }),
    installStub('src/models/OrderPaymentAllocation.js', { find: () => chain(allocations) })
  ];
  clearRuntimeModules();
  return {
    fundService: require(modulePath('src/services/fundService.js')),
    deliveryTodayNewService: require(modulePath('src/services/v2/deliveryTodayNew.service.js')),
    resolver: require(modulePath('src/services/delivery/DeliveryPaymentStateReadService.js')),
    restore() {
      clearRuntimeModules();
      restores.reverse().forEach((fn) => fn());
    }
  };
}

test('Phase258A: Fund remittance uses canonical payment state and removes false B0039325 cash shortage', async () => {
  const b0039325 = {
    id: 'SO-B0039325',
    code: 'B0039325',
    orderCode: 'B0039325',
    salesOrderCode: 'B0039325',
    deliveryDate: '2026-07-11',
    deliveryStaffCode: 'ghtp',
    deliveryStaffName: 'Giao Hang TP',
    totalAmount: 11957117,
    cashAmount: 0,
    cashCollected: 7587000,
    bankAmount: 0,
    rewardAmount: 0
  };
  const otherOrder = {
    id: 'SO-OTHER-CASH-BANK',
    code: 'B0039001',
    orderCode: 'B0039001',
    salesOrderCode: 'B0039001',
    deliveryDate: '2026-07-11',
    deliveryStaffCode: 'ghtp',
    deliveryStaffName: 'Giao Hang TP',
    totalAmount: 8386000,
    cashAmount: 3366000,
    bankAmount: 5020000,
    rewardAmount: 0
  };
  const latestVersion = {
    salesOrderId: 'SO-B0039325',
    salesOrderCode: 'B0039325',
    orderId: 'SO-B0039325',
    orderCode: 'B0039325',
    closeoutVersion: 2,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 8300000,
    finalDebtAmount: 3657117
  };
  const currentAllocation = {
    allocationCode: 'OPA-B0039325-V2',
    salesOrderId: 'SO-B0039325',
    salesOrderCode: 'B0039325',
    orderId: 'SO-B0039325',
    orderCode: 'B0039325',
    sourceVersion: 2,
    cashAmount: 0,
    bankAmount: 0,
    rewardAmount: 8300000,
    receivableAmount: 11957117,
    returnAmount: 0,
    debtAmount: 3657117,
    status: 'posted',
    active: true
  };

  const harness = installFundHarness({
    deliveryOrders: [b0039325, otherOrder],
    closeoutVersions: [latestVersion],
    allocations: [currentAllocation]
  });

  try {
    const preview = await harness.fundService.buildDeliverySubmissionDraft({
      deliveryDate: '2026-07-11',
      deliveryStaffCode: 'ghtp',
      submittedCashAmount: 3366000,
      submittedBankAmount: 5020000
    });

    assert.equal(preview.error, undefined);
    const bRow = preview.orders.find((row) => row.orderCode === 'B0039325');
    assert.equal(bRow.cashAmount, 0);
    assert.equal(bRow.bankAmount, 0);
    assert.equal(bRow.rewardAmount, 8300000);
    assert.equal(bRow.deliveryPaymentStateSource, 'orderPaymentAllocations.current');
    assert.equal(preview.draft.reportCurrentOrderCashAmount, 3366000);
    assert.equal(preview.draft.reportCurrentOrderBankAmount, 5020000);
    assert.equal(preview.draft.reportCashAmount, 3366000);
    assert.equal(preview.draft.reportBankAmount, 5020000);
    assert.equal(preview.draft.submittedCashAmount, 3366000);
    assert.equal(preview.draft.submittedBankAmount, 5020000);
    assert.equal(preview.draft.differenceCashAmount, 0);
    assert.equal(preview.draft.differenceBankAmount, 0);
    assert.equal(preview.draft.matchStatus, 'matched');

    const versionsByKey = new Map([['SO-B0039325', latestVersion], ['B0039325', latestVersion]]);
    const allocationsByKey = new Map([['SO-B0039325', currentAllocation], ['B0039325', currentAllocation]]);
    const deliveryTodayRow = harness.deliveryTodayNewService.summarizeOrder(b0039325, new Map(), versionsByKey, allocationsByKey);
    assert.equal(deliveryTodayRow.cashAmount, 0);
    assert.equal(deliveryTodayRow.bankAmount, 0);
    assert.equal(deliveryTodayRow.rewardAmount, 8300000);

    const legacyOrderCashAmount = legacyFirstPositive(b0039325, ['cashAmount', 'cashCollected']);
    const legacyReportCashAmount = legacyOrderCashAmount + otherOrder.cashAmount;
    const evidence = {
      order: { orderCode: 'B0039325', deliveryDate: '2026-07-11', deliveryStaffCode: 'ghtp' },
      legacyStoredState: { cashAmount: b0039325.cashCollected, bankAmount: b0039325.bankAmount, rewardAmount: b0039325.rewardAmount },
      canonicalState: {
        cashAmount: bRow.cashAmount,
        bankAmount: bRow.bankAmount,
        rewardAmount: bRow.rewardAmount,
        debtAmount: 3657117,
        source: bRow.deliveryPaymentStateSource
      },
      fundPreviewBefore: {
        orderCashAmount: legacyOrderCashAmount,
        reportCashAmount: legacyReportCashAmount,
        submittedCashAmount: 3366000,
        differenceCashAmount: 3366000 - legacyReportCashAmount
      },
      fundPreviewAfter: {
        orderCashAmount: bRow.cashAmount,
        reportCashAmount: preview.draft.reportCashAmount,
        submittedCashAmount: preview.draft.submittedCashAmount,
        differenceCashAmount: preview.draft.differenceCashAmount,
        matchStatus: preview.draft.matchStatus
      },
      crossScreenConsistency: {
        deliveryTodayCashAmount: deliveryTodayRow.cashAmount,
        fundPreviewCashAmount: bRow.cashAmount,
        matched: deliveryTodayRow.cashAmount === bRow.cashAmount
      }
    };
    fs.writeFileSync(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    harness.restore();
  }
});

test('Phase258A: resolver keeps canonical zero and ignores stale allocation behind latest correction', () => {
  clearRuntimeModules();
  const resolver = require(modulePath('src/services/delivery/DeliveryPaymentStateReadService.js'));
  const order = {
    id: 'SO-B0039325',
    code: 'B0039325',
    orderCode: 'B0039325',
    cashAmount: 0,
    cashCollected: 7587000,
    bankAmount: 0,
    rewardAmount: 0
  };
  const latestV2 = { salesOrderId: 'SO-B0039325', salesOrderCode: 'B0039325', closeoutVersion: 2, cashAmount: 0, bankAmount: 0, rewardAmount: 8300000 };
  const latestV3 = { salesOrderId: 'SO-B0039325', salesOrderCode: 'B0039325', closeoutVersion: 3, cashAmount: 1000, bankAmount: 2000, rewardAmount: 3000 };
  const allocationV2 = { orderId: 'SO-B0039325', orderCode: 'B0039325', sourceVersion: 2, cashAmount: 0, bankAmount: 0, rewardAmount: 8300000, status: 'posted' };

  const current = resolver.resolvePaymentStateForOrder(
    order,
    new Map([['SO-B0039325', latestV2], ['B0039325', latestV2]]),
    new Map([['SO-B0039325', allocationV2], ['B0039325', allocationV2]])
  );
  assert.equal(current.source.paymentState, 'orderPaymentAllocations.current');
  assert.equal(current.cashAmount, 0);
  assert.equal(current.rewardAmount, 8300000);

  const stale = resolver.resolvePaymentStateForOrder(
    order,
    new Map([['SO-B0039325', latestV3], ['B0039325', latestV3]]),
    new Map([['SO-B0039325', allocationV2], ['B0039325', allocationV2]])
  );
  assert.equal(stale.source.paymentState, 'deliveryCloseoutVersions.latest');
  assert.equal(stale.stalePaymentAllocationIgnored, true);
  assert.equal(stale.cashAmount, 1000);
  assert.equal(stale.bankAmount, 2000);
  assert.equal(stale.rewardAmount, 3000);

  const topLevelZero = resolver.resolvePaymentStateForOrder(order, new Map(), new Map());
  assert.equal(topLevelZero.source.paymentState, 'orders.top-level');
  assert.equal(topLevelZero.cashAmount, 0);
});
