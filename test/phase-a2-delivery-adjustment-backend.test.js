'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function resolved(relativePath) {
  return require.resolve(path.join(ROOT, relativePath));
}

function installStub(relativePath, exportsValue) {
  const filename = resolved(relativePath);
  const previous = require.cache[filename];
  require.cache[filename] = { id: filename, filename, loaded: true, exports: exportsValue };
  return () => {
    if (previous) require.cache[filename] = previous;
    else delete require.cache[filename];
  };
}

function queryResult(value) {
  return {
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean() { return this; },
    session() { return this; },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

function createHarness({
  orderOverrides = {},
  allocationOverrides = {},
  returnOrders = [],
  orderWriteResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
} = {}) {
  const counters = {
    correctionFind: 0,
    correctionWrite: 0,
    orderWrite: 0,
    returnRead: 0,
    returnWrite: 0,
    arAdjustmentWrite: 0,
    allocationWrite: 0,
    eventWrite: 0
  };
  const corrections = new Map();
  const returnWrites = [];
  const orderWrites = [];

  const order = {
    id: 'SO-B0040961',
    code: 'B0040961',
    orderCode: 'B0040961',
    customerCode: '4501436',
    customerName: 'Chị Bình Lợn',
    status: 'delivered',
    accountingStatus: 'pending',
    accountingConfirmed: false,
    version: 7,
    updatedAt: '2026-08-04T03:00:00.000Z',
    totalAmount: 1931784,
    cashAmount: 1932000,
    bankAmount: 0,
    rewardAmount: 0,
    returnAmount: 1931784,
    debtAmount: -1932000,
    deliveryCloseout: {
      status: 'draft',
      originalAmount: 1931784,
      cashAmount: 1932000,
      bankAmount: 0,
      rewardAmount: 0,
      returnAmount: 1931784,
      finalDebtAmount: -1932000
    },
    items: [
      { productCode: 'SP01', productName: 'Sản phẩm 1', quantity: 10, deliveredQty: 10, unitPrice: 100 }
    ],
    ...orderOverrides
  };

  const allocation = {
    id: 'OPA-B0040961',
    allocationCode: 'OPA-B0040961',
    orderId: order.id,
    orderCode: order.code,
    salesOrderId: order.id,
    salesOrderCode: order.code,
    status: 'posted',
    active: true,
    sourceVersion: 0,
    receivableAmount: 1931784,
    cashAmount: 1932000,
    bankAmount: 0,
    rewardAmount: 0,
    returnAmount: 1931784,
    debtAmount: -1932000,
    ...allocationOverrides
  };

  const SalesOrder = {
    async updateOne(filter, update) {
      counters.orderWrite += 1;
      orderWrites.push({ filter, update });
      return { ...orderWriteResult };
    }
  };

  const ReturnOrder = {
    find() {
      counters.returnRead += 1;
      return queryResult(returnOrders.map((row) => ({ ...row })));
    }
  };

  const DeliveryCloseoutCorrection = {
    findOne(filter) {
      counters.correctionFind += 1;
      return queryResult(corrections.get(filter.idempotencyKey) || null);
    },
    async findOneAndUpdate(filter, update) {
      counters.correctionWrite += 1;
      if (!corrections.has(filter.idempotencyKey)) {
        corrections.set(filter.idempotencyKey, { ...update.$setOnInsert });
      }
      return corrections.get(filter.idempotencyKey);
    },
    async updateOne() { return { matchedCount: 1, modifiedCount: 1 }; }
  };

  const DeliveryCloseoutVersion = {
    find() { return queryResult([]); },
    findOne() { return queryResult(null); },
    async findOneAndUpdate(_filter, update) { return update.$setOnInsert; }
  };

  const paymentStateModels = {
    DeliveryCloseoutVersion,
    OrderPaymentAllocation: {
      find() { return queryResult([allocation]); }
    }
  };

  const restores = [
    installStub('src/utils/transaction.util.js', {
      withOptionalMongoTransaction: async (_options, work) => work({ id: 'TEST-SESSION' })
    }),
    installStub('src/models/SalesOrder.js', SalesOrder),
    installStub('src/models/ReturnOrder.js', ReturnOrder),
    installStub('src/models/DeliveryCloseoutCorrection.js', DeliveryCloseoutCorrection),
    installStub('src/models/DeliveryCloseoutVersion.js', DeliveryCloseoutVersion),
    installStub('src/repositories/returnOrderRepository.js', {
      async upsert(payload) {
        counters.returnWrite += 1;
        returnWrites.push({ ...payload });
        return payload;
      }
    }),
    installStub('src/services/accounting/ArDebtAdjustmentPostingService.js', {
      async postAdjustment() {
        counters.arAdjustmentWrite += 1;
        return { posted: true };
      }
    }),
    installStub('src/services/accounting/OrderPaymentAllocationService.js', {
      buildAllocationFromCloseout() { return {}; },
      async postAllocation() {
        counters.allocationWrite += 1;
        return { allocation };
      }
    }),
    installStub('src/services/events/domainEventBus.js', {
      async emitDomainEventSafe() { counters.eventWrite += 1; }
    }),
    installStub('src/services/events/domainEventTypes.js', {
      EVENT_TYPES: { DELIVERY_CLOSEOUT_ADJUSTED: 'DELIVERY_CLOSEOUT_ADJUSTED' }
    }),
    installStub('src/domain/returns/ReturnMutationGuard.js', {
      async loadReturnMutationContext() { return {}; },
      assertReturnMutationAllowed() { return true; }
    })
  ];

  const servicePath = resolved('src/services/deliveryCloseoutCorrection.service.js');
  const previousService = require.cache[servicePath];
  delete require.cache[servicePath];
  const service = require(servicePath);

  function restore() {
    delete require.cache[servicePath];
    if (previousService) require.cache[servicePath] = previousService;
    restores.reverse().forEach((fn) => fn());
  }

  return {
    service,
    order,
    allocation,
    paymentStateModels,
    counters,
    corrections,
    returnWrites,
    orderWrites,
    restore
  };
}

function legacyLeakedPaymentPayload(extra = {}) {
  return {
    orderId: 'SO-B0040961',
    orderCode: 'B0040961',
    paymentCorrection: {
      correctedCashAmount: 0,
      correctedBankAmount: 0,
      correctedRewardAmount: 0
    },
    returnAdjustmentAmount: 1931784,
    returnAdjustmentItems: [
      {
        productCode: 'SP01',
        productName: 'Sản phẩm 1',
        oldReturnQty: 0,
        newReturnQty: 0,
        unitPrice: 100,
        adjustmentQty: 0,
        adjustmentAmount: 0
      }
    ],
    correctedReturnItems: [],
    reason: 'Sửa tiền mặt bị ghi thừa',
    ...extra
  };
}

test('A2 payment-only pre-closeout ignores legacy leaked return aggregate and writes no return/AR receipt', async (t) => {
  const h = createHarness();
  t.after(h.restore);

  const result = await h.service.createOpenOrderAdjustment(
    legacyLeakedPaymentPayload({ idempotencyKey: 'A2:B0040961:PAYMENT_ONLY' }),
    h.order,
    { paymentStateModels: h.paymentStateModels, now: '2026-08-04T04:00:00.000Z' }
  );

  assert.equal(result.success, true);
  assert.equal(result.preCloseoutAdjustment, true);
  assert.equal(result.correction.changeType, 'PAYMENT_ONLY');
  assert.equal(result.correction.operationIntent, 'PAYMENT_ONLY');
  assert.equal(result.correction.cashDeltaAmount, -1932000);
  assert.equal(result.correction.returnAdjustmentAmount, 0);
  assert.deepEqual(result.correction.returnAdjustmentItems, []);
  assert.equal(result.correction.newReturnAmount, 1931784);
  assert.equal(result.correction.newDebtAmount, 0);
  assert.equal(result.correction.metadata.ignoredLegacyReturnAggregate, true);
  assert.equal(result.correction.metadata.ignoredLegacyReturnAggregateAmount, 1931784);
  assert.equal(result.correction.metadata.doesNotPostArReceipt, true);
  assert.equal(h.counters.returnRead, 0, 'payment-only must not query returnOrders');
  assert.equal(h.counters.returnWrite, 0, 'payment-only must not update returnOrders');
  assert.equal(h.counters.arAdjustmentWrite, 0, 'pre-closeout payment correction must not post AR adjustment/receipt');
  assert.equal(h.counters.allocationWrite, 0);
  assert.equal(h.counters.correctionWrite, 1);
  assert.equal(h.counters.orderWrite, 1);
  assert.equal(h.orderWrites[0].update.$set.cashAmount, 0);
  assert.equal(h.orderWrites[0].update.$set.deliveryCloseout.returnAmount, 1931784);
  assert.equal(h.orderWrites[0].update.$set.deliveryCloseout.finalDebtAmount, 0);
  assert.deepEqual(h.orderWrites[0].update.$inc, { version: 1 });
});

test('A2 explicit PAYMENT_ONLY with forged return payload is rejected before any write', async (t) => {
  const h = createHarness({
    allocationOverrides: { returnAmount: 0, cashAmount: 1000, receivableAmount: 1000, debtAmount: 0 },
    orderOverrides: {
      totalAmount: 1000,
      cashAmount: 1000,
      returnAmount: 0,
      deliveryCloseout: { status: 'draft', originalAmount: 1000, cashAmount: 1000, returnAmount: 0 }
    }
  });
  t.after(h.restore);

  await assert.rejects(
    () => h.service.createOpenOrderAdjustment({
      orderCode: 'B0040961',
      changeType: 'PAYMENT_ONLY',
      paymentCorrection: { correctedCashAmount: 0, correctedBankAmount: 0, correctedRewardAmount: 0 },
      returnAdjustmentAmount: 100,
      returnAdjustmentItems: [{ productCode: 'SP01', oldReturnQty: 0, newReturnQty: 1, unitPrice: 100 }]
    }, h.order, { paymentStateModels: h.paymentStateModels }),
    (error) => error && error.code === 'PAYMENT_ONLY_CONTAINS_RETURN_MUTATION' && error.status === 400
  );

  assert.equal(h.counters.correctionWrite, 0);
  assert.equal(h.counters.orderWrite, 0);
  assert.equal(h.counters.returnWrite, 0);
  assert.equal(h.counters.arAdjustmentWrite, 0);
});

test('A2 valid RETURN_ONLY uses canonical quantity/price, keeps payment unchanged, and writes return once', async (t) => {
  const h = createHarness({
    allocationOverrides: { receivableAmount: 1000, cashAmount: 1000, returnAmount: 0, debtAmount: 0 },
    orderOverrides: {
      totalAmount: 1000,
      cashAmount: 1000,
      returnAmount: 0,
      deliveryCloseout: { status: 'draft', originalAmount: 1000, cashAmount: 1000, returnAmount: 0 },
      items: [{ productCode: 'SP01', productName: 'Sản phẩm 1', deliveredQty: 10, quantity: 10, unitPrice: 100 }]
    }
  });
  t.after(h.restore);

  const result = await h.service.createOpenOrderAdjustment({
    orderCode: 'B0040961',
    changeType: 'RETURN_ONLY',
    returnAdjustmentAmount: 100,
    returnAdjustmentItems: [{
      productCode: 'SP01',
      productName: 'Sản phẩm 1',
      oldReturnQty: 999,
      newReturnQty: 1,
      unitPrice: 999999
    }],
    reason: 'Xác nhận trả một sản phẩm'
  }, h.order, { paymentStateModels: h.paymentStateModels, now: '2026-08-04T04:00:00.000Z' });

  assert.equal(result.correction.changeType, 'RETURN_ONLY');
  assert.equal(result.correction.cashDeltaAmount, 0);
  assert.equal(result.correction.bankDeltaAmount, 0);
  assert.equal(result.correction.rewardDeltaAmount, 0);
  assert.equal(result.correction.returnAdjustmentAmount, 100, 'server must use canonical price 100, not forged client price');
  assert.equal(result.correction.returnAdjustmentItems[0].oldReturnQty, 0, 'server must use canonical current return qty');
  assert.equal(result.correction.returnAdjustmentItems[0].unitPrice, 100);
  assert.equal(result.correction.newReturnAmount, 100);
  assert.equal(h.counters.returnWrite, 1);
  assert.equal(h.returnWrites[0].totalAmount, 100);
  assert.equal(h.orderWrites[0].update.$set.cashAmount, 1000);
  assert.equal(h.orderWrites[0].update.$set.deliveryCloseout.returnAmount, 100);
});

test('A2 server rejects client return total mismatch against canonical line calculation', async (t) => {
  const h = createHarness({
    allocationOverrides: { receivableAmount: 1000, cashAmount: 1000, returnAmount: 0, debtAmount: 0 },
    orderOverrides: {
      totalAmount: 1000,
      cashAmount: 1000,
      returnAmount: 0,
      deliveryCloseout: { status: 'draft', originalAmount: 1000, cashAmount: 1000, returnAmount: 0 }
    }
  });
  t.after(h.restore);

  await assert.rejects(
    () => h.service.createOpenOrderAdjustment({
      orderCode: 'B0040961',
      changeType: 'RETURN_ONLY',
      returnAdjustmentAmount: 999,
      returnAdjustmentItems: [{ productCode: 'SP01', oldReturnQty: 0, newReturnQty: 1, unitPrice: 999999 }]
    }, h.order, { paymentStateModels: h.paymentStateModels }),
    (error) => {
      assert.equal(error.code, 'RETURN_TOTAL_MISMATCH');
      assert.equal(error.status, 400);
      assert.equal(error.data.expectedReturnAdjustmentAmount, 100);
      assert.equal(error.data.receivedReturnAdjustmentAmounts[0].value, 999);
      return true;
    }
  );
  assert.equal(h.counters.correctionWrite, 0);
  assert.equal(h.counters.returnWrite, 0);
  assert.equal(h.counters.orderWrite, 0);
});

test('A2 retry with the same idempotency key returns prior correction and creates no duplicate writes', async (t) => {
  const h = createHarness();
  t.after(h.restore);
  const input = legacyLeakedPaymentPayload({ idempotencyKey: 'A2:IDEMPOTENT:B0040961' });

  const first = await h.service.createOpenOrderAdjustment(input, h.order, {
    paymentStateModels: h.paymentStateModels,
    now: '2026-08-04T04:00:00.000Z'
  });
  const second = await h.service.createOpenOrderAdjustment(input, h.order, {
    paymentStateModels: h.paymentStateModels,
    now: '2026-08-04T04:00:01.000Z'
  });

  assert.equal(first.idempotent, undefined);
  assert.equal(second.idempotent, true);
  assert.equal(second.correction.idempotencyKey, 'A2:IDEMPOTENT:B0040961');
  assert.equal(h.counters.correctionWrite, 1);
  assert.equal(h.counters.orderWrite, 1);
  assert.equal(h.counters.returnWrite, 0);
  assert.equal(h.counters.arAdjustmentWrite, 0);
});

test('A2 stale expectedVersion is rejected before any write', async (t) => {
  const h = createHarness();
  t.after(h.restore);

  await assert.rejects(
    () => h.service.createOpenOrderAdjustment(
      legacyLeakedPaymentPayload({ expectedVersion: '6', idempotencyKey: 'A2:STALE:B0040961' }),
      h.order,
      { paymentStateModels: h.paymentStateModels }
    ),
    (error) => error && error.code === 'STALE_ADJUSTMENT_VERSION' && error.status === 409
  );
  assert.equal(h.counters.correctionWrite, 0);
  assert.equal(h.counters.orderWrite, 0);
  assert.equal(h.counters.returnWrite, 0);
});

test('A2 post-closeout policy remains active only for confirmed scope', () => {
  const {
    calculateCorrectionDebtDelta,
    assertCorrectionDebtDeltaPolicy
  } = require('../src/domain/accounting/correctionDebtDelta');
  const deltaInput = { cashDelta: -200, bankDelta: 0, rewardDelta: 0, returnDelta: 100 };
  const debtDelta = calculateCorrectionDebtDelta(deltaInput);
  assert.equal(debtDelta, 100);

  assert.equal(
    assertCorrectionDebtDeltaPolicy(deltaInput, { debtDelta, closeoutConfirmed: false }),
    100,
    'pre-closeout must not emit POST_CLOSEOUT error'
  );
  assert.throws(
    () => assertCorrectionDebtDeltaPolicy(deltaInput, { debtDelta, closeoutConfirmed: true }),
    (error) => error && error.code === 'POST_CLOSEOUT_RETURN_CANNOT_INCREASE_DEBT' && error.status === 409
  );
});


test('A2 invalid command intent is rejected with stable error contract before any write', async (t) => {
  const h = createHarness();
  t.after(h.restore);

  await assert.rejects(
    () => h.service.createOpenOrderAdjustment({
      orderCode: 'B0040961',
      changeType: 'PAYMENT_AND_MAGIC',
      paymentCorrection: { correctedCashAmount: 0 }
    }, h.order, { paymentStateModels: h.paymentStateModels }),
    (error) => error && error.code === 'INVALID_ADJUSTMENT_INTENT' && error.status === 400
  );
  assert.equal(h.counters.correctionWrite, 0);
  assert.equal(h.counters.orderWrite, 0);
  assert.equal(h.counters.returnWrite, 0);
});

test('A2 POST_CLOSEOUT_CORRECTION intent is rejected for an open order', async (t) => {
  const h = createHarness();
  t.after(h.restore);

  await assert.rejects(
    () => h.service.createOpenOrderAdjustment({
      orderCode: 'B0040961',
      changeType: 'POST_CLOSEOUT_CORRECTION',
      paymentCorrection: { correctedCashAmount: 0 }
    }, h.order, { paymentStateModels: h.paymentStateModels }),
    (error) => error && error.code === 'INVALID_ADJUSTMENT_INTENT' && error.status === 400
  );
  assert.equal(h.counters.correctionWrite, 0);
  assert.equal(h.counters.orderWrite, 0);
});

test('A2 reuse of one idempotency key with a different payment state is rejected', async (t) => {
  const h = createHarness();
  t.after(h.restore);
  const key = 'A2:IDEMPOTENCY-CONFLICT:B0040961';

  await h.service.createOpenOrderAdjustment(
    legacyLeakedPaymentPayload({ idempotencyKey: key }),
    h.order,
    { paymentStateModels: h.paymentStateModels }
  );

  await assert.rejects(
    () => h.service.createOpenOrderAdjustment(
      legacyLeakedPaymentPayload({
        idempotencyKey: key,
        paymentCorrection: {
          correctedCashAmount: 100,
          correctedBankAmount: 0,
          correctedRewardAmount: 0
        }
      }),
      h.order,
      { paymentStateModels: h.paymentStateModels }
    ),
    (error) => error && error.code === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' && error.status === 409
  );
  assert.equal(h.counters.correctionWrite, 1);
  assert.equal(h.counters.orderWrite, 1);
  assert.equal(h.counters.returnWrite, 0);
});

test('A2 optimistic write conflict is mapped to STALE_ADJUSTMENT_VERSION', async (t) => {
  const h = createHarness({
    orderWriteResult: { acknowledged: true, matchedCount: 0, modifiedCount: 0 }
  });
  t.after(h.restore);

  await assert.rejects(
    () => h.service.createOpenOrderAdjustment(
      legacyLeakedPaymentPayload({ idempotencyKey: 'A2:OPTIMISTIC-STALE:B0040961' }),
      h.order,
      { paymentStateModels: h.paymentStateModels }
    ),
    (error) => error && error.code === 'STALE_ADJUSTMENT_VERSION' && error.status === 409
  );
  assert.equal(h.counters.orderWrite, 1);
  assert.equal(h.counters.returnWrite, 0);
  assert.equal(h.counters.arAdjustmentWrite, 0);
});

test('A2 return-only rejects a product absent from canonical order/return rows', async (t) => {
  const h = createHarness({
    allocationOverrides: { receivableAmount: 1000, cashAmount: 1000, returnAmount: 0, debtAmount: 0 },
    orderOverrides: {
      totalAmount: 1000,
      cashAmount: 1000,
      returnAmount: 0,
      deliveryCloseout: { status: 'draft', originalAmount: 1000, cashAmount: 1000, returnAmount: 0 }
    }
  });
  t.after(h.restore);

  await assert.rejects(
    () => h.service.createOpenOrderAdjustment({
      orderCode: 'B0040961',
      changeType: 'RETURN_ONLY',
      returnAdjustmentAmount: 100,
      returnAdjustmentItems: [{ productCode: 'FORGED-SKU', oldReturnQty: 0, newReturnQty: 1, unitPrice: 100 }]
    }, h.order, { paymentStateModels: h.paymentStateModels }),
    (error) => error && error.code === 'RETURN_ADJUSTMENT_PRODUCT_NOT_IN_ORDER' && error.status === 400
  );
  assert.equal(h.counters.correctionWrite, 0);
  assert.equal(h.counters.returnWrite, 0);
  assert.equal(h.counters.orderWrite, 0);
});

test('A3 minimal PAYMENT_ONLY payload is accepted end-to-end by the Phase A2 backend contract', async (t) => {
  const h = createHarness();
  t.after(h.restore);

  const result = await h.service.createOpenOrderAdjustment({
    orderCode: 'B0040961',
    changeType: 'PAYMENT_ONLY',
    expectedVersion: '7',
    paymentCorrection: {
      correctedCashAmount: 0,
      correctedBankAmount: 0,
      correctedRewardAmount: 0
    },
    reason: '',
    note: 'Phase A3 minimal frontend payload'
  }, h.order, {
    paymentStateModels: h.paymentStateModels,
    now: '2026-08-04T04:30:00.000Z'
  });

  assert.equal(result.success, true);
  assert.equal(result.correction.changeType, 'PAYMENT_ONLY');
  assert.equal(result.correction.cashDeltaAmount, -1932000);
  assert.equal(result.correction.returnAdjustmentAmount, 0);
  assert.equal(result.correction.newDebtAmount, 0);
  assert.equal(h.counters.returnRead, 0);
  assert.equal(h.counters.returnWrite, 0);
  assert.equal(h.counters.arAdjustmentWrite, 0);
  assert.equal(h.counters.orderWrite, 1);
});
