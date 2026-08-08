'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

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
    'src/services/delivery/CanonicalDeliveryFinancialScopeAdapter.js',
    'src/services/delivery/CanonicalDeliveryFinancialScopeReader.js',
    'src/services/delivery/deliveryTodayCanonicalOrderReader.js'
  ]) {
    delete require.cache[modulePath(relativePath)];
  }
}

function makeOrder(index, cashAmount, bankAmount = 0) {
  const orderCode = `PARITY-${String(index).padStart(2, '0')}`;
  return {
    id: `SO-${orderCode}`,
    code: orderCode,
    orderCode,
    salesOrderCode: orderCode,
    customerCode: `CUS-${String(index).padStart(2, '0')}`,
    customerName: `Khach ${index}`,
    deliveryDate: '2026-08-05',
    deliveryDateKey: '2026-08-05',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'Thanh GH Tien hai',
    salesStaffCode: index <= 12 ? '33955' : (index <= 28 ? '35095' : '42176'),
    cashAmount,
    bankAmount,
    rewardAmount: 0,
    totalAmount: cashAmount + bankAmount + 100000,
    status: 'delivered',
    deleted: false,
    isDeleted: false
  };
}

function fixture() {
  const legacyVisible = [];
  for (let i = 1; i <= 31; i += 1) legacyVisible.push(makeOrder(i, 1600000, i === 1 ? 6484000 : 0));
  legacyVisible.push(makeOrder(32, 3543962, 0));
  const omitted = [33, 34, 35, 36].map((index) => makeOrder(index, 440000, 0));
  return {
    legacyVisible,
    canonicalOrders: [...legacyVisible, ...omitted]
  };
}

test('RED: fund preview must use the same canonical 36-order scope as Delivery Today (32 legacy refs + 4 detached orders = 1,760,000 cash gap)', async () => {
  const { legacyVisible, canonicalOrders } = fixture();
  assert.equal(legacyVisible.length, 32);
  assert.equal(canonicalOrders.length, 36);
  assert.equal(legacyVisible.reduce((sum, row) => sum + row.cashAmount, 0), 53143962);
  assert.equal(canonicalOrders.reduce((sum, row) => sum + row.cashAmount, 0), 54903962);
  assert.equal(canonicalOrders.reduce((sum, row) => sum + row.bankAmount, 0), 6484000);

  let legacyReaderCalls = 0;
  const restores = [
    installStub('src/utils/transaction.util.js', { withMongoTransaction: async (work) => work(null) }),
    installStub('src/repositories/fundLedgerRepository.js', {}),
    installStub('src/repositories/deliveryCashSubmissionRepository.js', { findByIdOrCode: async () => null, findAll: async () => [] }),
    installStub('src/repositories/expenseVoucherRepository.js', {}),
    installStub('src/repositories/fundTransferRepository.js', {}),
    installStub('src/repositories/deliveryCashShortageRepository.js', { findAll: async () => [] }),
    installStub('src/repositories/deliveryShortageRepaymentRepository.js', { findAll: async () => [] }),
    installStub('src/services/auditService.js', { log: async () => null }),
    installStub('src/services/accounting/FundBalanceReadService.js', {}),
    installStub('src/services/master-order/masterOrderDelivery.service.js', {
      listDeliveryTodayOrdersCompact: async () => {
        legacyReaderCalls += 1;
        return {
          orders: structuredClone(legacyVisible),
          summary: { totalOrders: legacyVisible.length, cashAmount: 53143962, bankAmount: 6484000 }
        };
      }
    }),
    installStub('src/models/SalesOrder.js', { find: () => chain([]) }),
    installStub('src/models/MasterOrder.js', { find: () => chain([]) }),
    installStub('src/models/DeliveryCloseoutVersion.js', { find: () => chain([]) }),
    installStub('src/models/OrderPaymentAllocation.js', { find: () => chain([]) }),
    installStub('src/models/ReturnOrder.js', { find: () => chain([]) })
  ];

  clearRuntimeModules();

  // This is the canonical set Delivery Today sees. RED evidence was captured
  // before production changes, when fundService never reached the orders-first reader.
  const canonicalReaderPath = modulePath('src/services/delivery/deliveryTodayCanonicalOrderReader.js');
  const canonicalReader = require(canonicalReaderPath);
  const originalListSalesOrders = canonicalReader.listSalesOrders;
  let canonicalReaderCalls = 0;
  canonicalReader.listSalesOrders = async () => {
    canonicalReaderCalls += 1;
    return {
      orders: structuredClone(canonicalOrders),
      pagination: { hasMore: false, nextCursor: null },
      diagnostics: {
        reader: 'deliveryTodayCanonicalOrderReader',
        primarySource: 'orders',
        masterOrdersRole: 'metadata-only'
      }
    };
  };

  // Ensure fundService -> adapter -> shared scope reader sees the patched base reader.
  delete require.cache[modulePath('src/services/delivery/CanonicalDeliveryFinancialScopeReader.js')];
  delete require.cache[modulePath('src/services/delivery/CanonicalDeliveryFinancialScopeAdapter.js')];
  delete require.cache[modulePath('src/services/fundService.js')];
  const fundService = require(modulePath('src/services/fundService.js'));

  try {
    const preview = await fundService.buildDeliverySubmissionDraft({
      deliveryDate: '2026-08-05',
      deliveryStaffCode: 'ghth'
    });

    assert.equal(preview.error, undefined);
    assert.equal(preview.orders.length, 36, 'Fund preview must not be constrained by stale masterOrders child refs');
    assert.equal(preview.draft.orderIds.length, 36);
    assert.equal(preview.draft.reportCurrentOrderCashAmount, 54903962);
    assert.equal(preview.draft.reportCurrentOrderBankAmount, 6484000);
    assert.equal(preview.draft.reportCashAmount, 54903962);
    assert.equal(preview.draft.reportBankAmount, 6484000);
    assert.equal(preview.draft.reportOldDebtCashAmount, 0);
    assert.equal(preview.draft.reportOldDebtBankAmount, 0);
    assert.ok(preview.orders.some((row) => row.orderCode === 'PARITY-36'));
    assert.equal(legacyReaderCalls, 0, 'Fund preview must never fall back to masterOrders-first delivery reader');
    assert.equal(canonicalReaderCalls, 1, 'Fund preview must resolve the scope through the canonical orders-first reader');
  } finally {
    canonicalReader.listSalesOrders = originalListSalesOrders;
    clearRuntimeModules();
    restores.reverse().forEach((fn) => fn());
  }
});
