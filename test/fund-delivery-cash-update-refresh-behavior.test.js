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
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports: exportsValue
  };
  return () => {
    if (previous) require.cache[filename] = previous;
    else delete require.cache[filename];
  };
}

test('sửa phiếu đồng bộ lại reportCash/reportBank và chênh lệch từ đơn giao hiện tại', async () => {
  const current = {
    id: 'NQGH_TEST_ID',
    code: 'NQGH-20260617-ghth',
    deliveryDate: '2026-06-17',
    deliveryStaffCode: 'ghth',
    deliveryStaffName: 'Thành GH Tiền hải',
    reportCashAmount: 31944000,
    reportBankAmount: 1777000,
    submittedCashAmount: 45441000,
    submittedBankAmount: 1777000,
    differenceCashAmount: 13497000,
    differenceBankAmount: 0,
    status: 'pending',
    fundPosted: false,
    createdBy: 'admin',
    createdAt: '2026-06-17T01:00:00.000Z'
  };

  let persisted = null;
  const deliveryRepo = {
    findByIdOrCode: async (identity) => {
      if (identity === current.code || identity === current.id) return { ...current };
      return null;
    },
    patchByIdOrCode: async (identity, patch) => {
      assert.equal(identity, current.code);
      persisted = { ...patch };
      return persisted;
    },
    upsert: async () => {
      throw new Error('update must patch the existing voucher, not upsert a second row');
    },
    findAll: async () => []
  };

  const restore = [
    installStub('src/utils/transaction.util.js', { withMongoTransaction: async (work) => work(null) }),
    installStub('src/repositories/fundLedgerRepository.js', {}),
    installStub('src/repositories/deliveryCashSubmissionRepository.js', deliveryRepo),
    installStub('src/repositories/expenseVoucherRepository.js', {}),
    installStub('src/repositories/fundTransferRepository.js', {}),
    installStub('src/services/master-order/masterOrderDelivery.service.js', {
      listDeliveryTodayOrdersCompact: async () => ({
        orders: [
          {
            id: 'ORDER_1',
            orderCode: 'BO037672',
            deliveryStaffCode: 'ghth',
            deliveryStaffName: 'Thành GH Tiền hải',
            cashAmount: 45390773,
            bankAmount: 1777000
          }
        ],
        summary: { totalOrders: 1 }
      })
    })
  ];

  const servicePath = modulePath('src/services/fundService.js');
  const previousService = require.cache[servicePath];
  delete require.cache[servicePath];

  try {
    const fundService = require(servicePath);
    const result = await fundService.updateDeliveryCashSubmission(current.code, {
      deliveryDate: '2026-06-17',
      deliveryStaffCode: 'ghth',
      submittedCashAmount: 45441000,
      submittedBankAmount: 1777000,
      note: 'Đối chiếu lại'
    });

    assert.equal(result.error, undefined);
    assert.ok(persisted);
    assert.equal(persisted.reportCashAmount, 45390773);
    assert.equal(persisted.reportBankAmount, 1777000);
    assert.equal(persisted.submittedCashAmount, 45441000);
    assert.equal(persisted.submittedBankAmount, 1777000);
    assert.equal(persisted.differenceCashAmount, 50227);
    assert.equal(persisted.differenceBankAmount, 0);
    assert.deepEqual(persisted.orderCodes, ['BO037672']);
    assert.deepEqual(persisted.orderIds, ['ORDER_1']);
    assert.equal(persisted.createdAt, current.createdAt);
    assert.equal(persisted.status, 'pending');
    assert.equal(result.orders.length, 1);
  } finally {
    delete require.cache[servicePath];
    if (previousService) require.cache[servicePath] = previousService;
    restore.reverse().forEach((fn) => fn());
  }
});
