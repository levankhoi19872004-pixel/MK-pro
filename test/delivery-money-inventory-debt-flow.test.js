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

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function valueMatches(actual, expected) {
  if (expected instanceof RegExp) return expected.test(String(actual || ''));
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if (Object.prototype.hasOwnProperty.call(expected, '$in')) {
      return (expected.$in || []).some((value) => valueMatches(actual, value));
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$nin')) {
      return !(expected.$nin || []).some((value) => valueMatches(actual, value));
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$exists')) {
      const exists = actual !== undefined;
      return Boolean(expected.$exists) ? exists : !exists;
    }
    if (Object.prototype.hasOwnProperty.call(expected, '$ne')) {
      return actual !== expected.$ne;
    }
  }
  return actual === expected;
}

function matches(row = {}, filter = {}) {
  if (!filter) return true;
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return (expected || []).some((child) => matches(row, child));
    if (key === '$and') return (expected || []).every((child) => matches(row, child));
    return valueMatches(row[key], expected);
  });
}

function queryResult(value) {
  return {
    select() { return this; },
    sort() { return this; },
    skip() { return this; },
    limit() { return this; },
    session() { return this; },
    allowDiskUse() { return this; },
    exec: async () => clone(value),
    lean: async () => clone(value),
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
  };
}

function createMemoryModel(initialRows = []) {
  const rows = initialRows.map((row) => clone(row));
  return {
    rows,
    find(filter = {}) {
      return queryResult(rows.filter((row) => matches(row, filter)));
    },
    findOne(filter = {}) {
      return queryResult(rows.find((row) => matches(row, filter)) || null);
    },
    async findOneAndUpdate(filter = {}, update = {}, _options = {}) {
      const row = rows.find((candidate) => matches(candidate, filter));
      if (!row) return null;
      if (update.$set) Object.assign(row, clone(update.$set));
      if (update.$inc) {
        for (const [field, value] of Object.entries(update.$inc)) {
          row[field] = Number(row[field] || 0) + Number(value || 0);
        }
      }
      return clone(row);
    },
    upsertByIdOrCode(doc = {}) {
      const id = String(doc.id || '').trim();
      const code = String(doc.code || '').trim();
      const index = rows.findIndex((row) => (id && row.id === id) || (code && row.code === code));
      if (index >= 0) rows[index] = { ...rows[index], ...clone(doc) };
      else rows.push(clone(doc));
      return clone(index >= 0 ? rows[index] : rows[rows.length - 1]);
    }
  };
}

function salesOrderFixture(overrides = {}) {
  return {
    id: overrides.id || 'SO-FLOW-1',
    code: overrides.code || overrides.id || 'SO-FLOW-1',
    salesOrderId: overrides.salesOrderId || overrides.id || 'SO-FLOW-1',
    salesOrderCode: overrides.salesOrderCode || overrides.code || overrides.id || 'SO-FLOW-1',
    customerCode: overrides.customerCode || 'C-FLOW',
    customerName: overrides.customerName || 'Khách kiểm chứng luồng giao hàng',
    deliveryDate: overrides.deliveryDate || '2026-06-21',
    salesStaffCode: overrides.salesStaffCode || 'NVBH01',
    salesStaffName: overrides.salesStaffName || 'Nhân viên bán hàng 01',
    deliveryStaffCode: overrides.deliveryStaffCode || 'GH01',
    deliveryStaffName: overrides.deliveryStaffName || 'Nhân viên giao hàng 01',
    masterOrderId: overrides.masterOrderId || 'MO-FLOW',
    masterOrderCode: overrides.masterOrderCode || 'MO-FLOW',
    totalAmount: overrides.totalAmount ?? 100000,
    deliveryStatus: overrides.deliveryStatus || 'assigned',
    status: overrides.status || 'assigned',
    version: overrides.version ?? 0,
    items: overrides.items || [
      { productCode: 'P-FLOW', productName: 'Sản phẩm kiểm chứng', quantity: 10, price: 10000, salePrice: 10000 }
    ],
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z'
  };
}

function createDeliveryHarness(orderRows = [], returnRows = []) {
  const SalesOrder = createMemoryModel(orderRows);
  const ReturnOrder = createMemoryModel(returnRows);
  const restoreLifecycle = installStub('src/domain/lifecycle/ReturnLifecycleService.js', {
    async createPendingReturn(patch = {}) {
      return ReturnOrder.upsertByIdOrCode({
        ...patch,
        createdAt: patch.createdAt || '2026-06-21T00:00:00.000Z'
      });
    }
  });
  const { DeliveryEngine } = require('../src/engines/delivery.engine');
  const engine = new DeliveryEngine({
    SalesOrder,
    ReturnOrder,
    MasterOrder: null,
    StockTransaction: {},
    ArLedger: {},
    User: null
  });
  return {
    engine,
    SalesOrder,
    ReturnOrder,
    restore: restoreLifecycle,
    actor: {
      actorDeliveryStaffCode: 'GH01',
      actorStaffCode: 'GH01',
      enforceDeliveryOwnership: true,
      deliveryStaffCode: 'GH01',
      deliveryStaffName: 'Nhân viên giao hàng 01'
    }
  };
}

function returnLine(qty) {
  return [{ productCode: 'P-FLOW', productName: 'Sản phẩm kiểm chứng', returnQty: qty, quantity: qty, price: 10000, salePrice: 10000 }];
}

test('case 1: giao đủ hàng + thu đủ tiền đưa đơn về delivered, debt=0 và không sinh returnOrders', async () => {
  const h = createDeliveryHarness([salesOrderFixture({ id: 'SO-FULL-CASH', code: 'SO-FULL-CASH' })]);
  try {
    const payment = await h.engine.savePayment({ ...h.actor, orderId: 'SO-FULL-CASH', cashAmount: 100000 });
    assert.equal(payment.order.amounts.receivable, 100000);
    assert.equal(payment.order.amounts.cash, 100000);
    assert.equal(payment.order.amounts.returnAmount, 0);
    assert.equal(payment.order.amounts.debt, 0);
    assert.equal(h.ReturnOrder.rows.length, 0);

    const confirmed = await h.engine.confirm({ ...h.actor, orderId: 'SO-FULL-CASH', deliveryStatus: 'delivered' });
    assert.equal(confirmed.order.status.deliveryStatus, 'delivered');
    assert.equal(confirmed.order.status.paymentStatus, 'paid');
    assert.equal(confirmed.order.reconciliation.balanced, true);
  } finally {
    h.restore();
  }
});

test('case 2: trả một phần tạo returnOrders, giảm đúng công nợ và vẫn cho giao phần còn lại', async () => {
  const h = createDeliveryHarness([salesOrderFixture({ id: 'SO-PARTIAL-RETURN', code: 'SO-PARTIAL-RETURN' })]);
  try {
    const savedReturn = await h.engine.saveReturn({ ...h.actor, orderId: 'SO-PARTIAL-RETURN', items: returnLine(3) });
    assert.equal(h.ReturnOrder.rows.length, 1);
    assert.equal(savedReturn.returnOrder.salesOrderCode, 'SO-PARTIAL-RETURN');
    assert.equal(savedReturn.returnOrder.totalAmount, 30000);
    assert.equal(savedReturn.returnOrder.status, 'waiting_receive');

    const payment = await h.engine.savePayment({ ...h.actor, orderId: 'SO-PARTIAL-RETURN', cashAmount: 50000 });
    assert.equal(payment.order.amounts.returnAmount, 30000);
    assert.equal(payment.order.amounts.cash, 50000);
    assert.equal(payment.order.amounts.debt, 20000);
    assert.equal(payment.order.status.paymentStatus, 'partial');

    const confirmed = await h.engine.confirm({ ...h.actor, orderId: 'SO-PARTIAL-RETURN', deliveryStatus: 'delivered' });
    assert.equal(confirmed.order.status.deliveryStatus, 'delivered');
    assert.equal(confirmed.order.amounts.debt, 20000);
    assert.equal(confirmed.order.reconciliation.balanced, true);
  } finally {
    h.restore();
  }
});

test('case 3: trả hết hàng đưa debt về 0, không duplicate return và net-sales/VAT/SSE loại toàn bộ đơn', async () => {
  const h = createDeliveryHarness([salesOrderFixture({ id: 'SO-FULL-RETURN', code: 'SO-FULL-RETURN' })]);
  try {
    await h.engine.saveReturn({ ...h.actor, orderId: 'SO-FULL-RETURN', items: returnLine(10), returnType: 'full' });
    await h.engine.saveReturn({ ...h.actor, orderId: 'SO-FULL-RETURN', items: returnLine(10), returnType: 'full' });
    assert.equal(h.ReturnOrder.rows.length, 1, 'returnOrders phải upsert theo RO-orderCode, không tạo trùng');

    const confirmed = await h.engine.confirm({ ...h.actor, orderId: 'SO-FULL-RETURN', deliveryStatus: 'failed', status: 'failed' });
    assert.equal(confirmed.order.amounts.returnAmount, 100000);
    assert.equal(confirmed.order.amounts.debt, 0);
    assert.equal(confirmed.order.reconciliation.balanced, true);

    const netSale = require('../src/services/invoiceNetSales.service');
    const net = netSale.buildNetSaleDataset({
      orders: [{
        id: 'SO-FULL-RETURN',
        code: 'SO-FULL-RETURN',
        orderDate: '2026-06-21',
        status: 'delivered',
        items: [{ productCode: 'P-FLOW', quantity: 10, priceAfterPromotion: 10000 }]
      }],
      returnOrders: h.ReturnOrder.rows,
      isEligibleReturnOrder: () => true
    });
    assert.equal(net.orders[0].fullyReturned, true);
    assert.equal(net.orders[0].exportableLines.length, 0);
  } finally {
    h.restore();
  }
});

test('case 4: thu thiếu giữ phần còn lại trên công nợ và không đánh dấu đã thanh toán đủ', async () => {
  const h = createDeliveryHarness([salesOrderFixture({ id: 'SO-SHORT-PAY', code: 'SO-SHORT-PAY' })]);
  try {
    const payment = await h.engine.savePayment({ ...h.actor, orderId: 'SO-SHORT-PAY', cashAmount: 60000 });
    assert.equal(payment.order.amounts.cash, 60000);
    assert.equal(payment.order.amounts.debt, 40000);
    assert.equal(payment.order.status.paymentStatus, 'partial');
    assert.equal(payment.order.reconciliation.balanced, true);

    const confirmed = await h.engine.confirm({ ...h.actor, orderId: 'SO-SHORT-PAY', deliveryStatus: 'delivered' });
    assert.equal(confirmed.order.status.deliveryStatus, 'delivered');
    assert.equal(confirmed.order.status.paymentStatus, 'partial');
    assert.equal(confirmed.order.amounts.debt, 40000);
  } finally {
    h.restore();
  }
});

function makeDebtDoc(row, collectionRows) {
  return {
    ...row,
    async save() {
      const idx = collectionRows.findIndex((item) => item.id === this.id || item.code === this.code);
      const saved = { ...this };
      delete saved.save;
      if (idx >= 0) collectionRows[idx] = saved;
      else collectionRows.push(saved);
      return this;
    }
  };
}

function freshDebtCollectionHarness() {
  const collectionRows = [];
  const arLedgers = [];
  const fundLedgers = [];
  let createCount = 0;

  const DebtCollection = {
    findOne(filter = {}) {
      const found = collectionRows.find((row) => matches(row, filter));
      const doc = found ? makeDebtDoc(found, collectionRows) : null;
      return {
        session() { return this; },
        lean: async () => clone(found || null),
        then(resolve, reject) { return Promise.resolve(doc).then(resolve, reject); }
      };
    },
    async create(rows = []) {
      createCount += rows.length;
      const docs = rows.map((row) => {
        const saved = clone(row);
        collectionRows.push(saved);
        return makeDebtDoc(saved, collectionRows);
      });
      return docs;
    },
    find(filter = {}) {
      return queryResult(collectionRows.filter((row) => matches(row, filter)));
    }
  };

  const restores = [
    installStub('src/models/DebtCollection.js', DebtCollection),
    installStub('src/models/DebtCollectionLock.js', { findOneAndUpdate: async () => ({}) }),
    installStub('src/models/ExternalDebtOrder.js', { findOneAndUpdate: async () => ({}) }),
    installStub('src/services/DebtReadService.js', {
      async checkAvailableDebt({ customerCode, customerId, allocations }) {
        const normalized = allocations.map((row) => ({
          salesOrderId: row.salesOrderId || row.orderId || 'SO-OLD-DEBT',
          salesOrderCode: row.salesOrderCode || row.orderCode || 'SO-OLD-DEBT',
          orderType: row.orderType || 'sales_order',
          beforeDebt: 70000,
          allocatedAmount: Number(row.allocatedAmount ?? row.amount ?? row.paymentAmount ?? 0),
          salesStaffCode: 'NVBH01',
          salesStaffName: 'Nhân viên bán hàng 01',
          deliveryStaffCode: 'GH01',
          deliveryStaffName: 'Nhân viên giao hàng 01'
        }));
        return {
          ok: true,
          customerId: customerId || 'C-OLD',
          customerCode: customerCode || 'C-OLD',
          customerName: 'Khách nợ cũ',
          salesStaffCode: 'NVBH01',
          salesStaffName: 'Nhân viên bán hàng 01',
          deliveryStaffCode: 'GH01',
          deliveryStaffName: 'Nhân viên giao hàng 01',
          allocations: normalized
        };
      }
    }),
    installStub('src/domain/posting/ArPostingService.js', {
      async postReceipt(receipt = {}) {
        const amount = (receipt.allocations || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
        const row = { id: `AR-RECEIPT-${receipt.code}`, type: 'ar_receipt', credit: amount, debit: 0, refType: 'debtCollection', refCode: receipt.code };
        arLedgers.push(row);
        return row;
      }
    }),
    installStub('src/domain/posting/FundPostingService.js', {
      async postCashIn(input = {}) {
        const row = { id: `FL-${input.sourceCode}`, direction: 'in', sourceType: 'debtCollection', amount: Number(input.amount || 0), sourceCode: input.sourceCode };
        fundLedgers.push(row);
        return row;
      }
    }),
    installStub('src/utils/transaction.util.js', { withMongoTransaction: async (work) => work(null) })
  ];

  const servicePath = modulePath('src/services/DebtCollectionService.js');
  const previousService = require.cache[servicePath];
  delete require.cache[servicePath];
  const service = require(servicePath);

  return {
    service,
    collectionRows,
    arLedgers,
    fundLedgers,
    get createCount() { return createCount; },
    restore() {
      delete require.cache[servicePath];
      if (previousService) require.cache[servicePath] = previousService;
      restores.reverse().forEach((restore) => restore());
    }
  };
}

test('case 5: thu nợ cũ qua app giao hàng chỉ tạo submitted, idempotent; kế toán xác nhận mới post AR/Fund', async () => {
  const h = freshDebtCollectionHarness();
  try {
    const body = {
      customerCode: 'C-OLD',
      customerName: 'Khách nợ cũ',
      amount: 40000,
      paymentMethod: 'cash',
      idempotencyKey: 'GH01-C-OLD-40000-20260621',
      allocations: [{ salesOrderId: 'SO-OLD-DEBT', salesOrderCode: 'SO-OLD-DEBT', allocatedAmount: 40000 }]
    };
    const mobileUser = { id: 'U-GH01', role: 'delivery', staffCode: 'GH01', fullName: 'Nhân viên giao hàng 01' };

    const submitted = await h.service.submitDebtCollection({ body, mobileUser });
    assert.equal(submitted.statusCode, 201);
    assert.equal(submitted.body.collection.status, 'submitted');
    assert.equal(h.collectionRows.length, 1);
    assert.equal(h.arLedgers.length, 0, 'submit chưa được post AR-RECEIPT');
    assert.equal(h.fundLedgers.length, 0, 'submit chưa được ghi fundLedgers');

    const replayed = await h.service.submitDebtCollection({ body, mobileUser });
    assert.equal(replayed.body.collection.id, submitted.body.collection.id);
    assert.equal(h.createCount, 1, 'idempotencyKey phải chặn double submit');
    assert.equal(h.collectionRows.length, 1);

    const confirmed = await h.service.confirmDebtCollection(submitted.body.collection.code, { accountingUserName: 'Kế toán' });
    assert.equal(confirmed.body.collection.status, 'accounting_confirmed');
    assert.equal(h.arLedgers.length, 1);
    assert.equal(h.arLedgers[0].type, 'ar_receipt');
    assert.equal(h.arLedgers[0].credit, 40000);
    assert.equal(h.fundLedgers.length, 1);
    assert.equal(h.fundLedgers[0].direction, 'in');
    assert.equal(h.fundLedgers[0].amount, 40000);
  } finally {
    h.restore();
  }
});

test('return stock posting remains behind lifecycle receiving/accounting boundary, not DeliveryEngine direct write', () => {
  const { readSource } = require('./helpers/sourceBundle.util');
  const engineSource = readSource(path.join(ROOT, 'src/engines/delivery.legacy.engine.js'));
  const lifecycleSource = readSource(path.join(ROOT, 'src/domain/lifecycle/ReturnLifecycleService.js'));
  const saveReturnStart = engineSource.indexOf('async saveReturn');
  const saveReturnEnd = engineSource.indexOf('async savePayment', saveReturnStart);
  const saveReturnBlock = engineSource.slice(saveReturnStart, saveReturnEnd);

  assert.match(lifecycleSource, /InventoryPostingService\.postReturnIn\(returnOrder, options\)/);
  assert.doesNotMatch(saveReturnBlock, /postReturnIn|postReturnStock|InventoryPostingService/);
});
