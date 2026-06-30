'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const debtNewService = require('../src/services/v2/debtNew.service');
const deliveryTodayNewService = require('../src/services/v2/deliveryTodayNew.service');

test('Debt New read model only counts AR-DEBT-* categories and excludes legacy AR categories', () => {
  const rows = [
    { account: 'AR', category: 'AR-DEBT-OPEN', ledgerType: 'AR-DEBT-OPEN', debit: 10000, credit: 0, customerCode: 'KH1', customerName: 'Khach 1', sourceId: 'SO1', active: true, accountingConfirmed: true },
    { account: 'AR', category: 'AR-DEBT-ADJUSTMENT', ledgerType: 'AR-DEBT-ADJUSTMENT', debit: 0, credit: 2000, customerCode: 'KH1', customerName: 'Khach 1', sourceId: 'SO1', active: true, accountingConfirmed: true },
    { account: 'AR', category: 'AR-SALE', ledgerType: 'AR-SALE', debit: 999999, credit: 0, customerCode: 'KH1', customerName: 'Khach 1', sourceId: 'SO1', active: true, accountingConfirmed: true },
    { account: 'AR', category: 'AR-RETURN', ledgerType: 'AR-RETURN', debit: 0, credit: 999999, customerCode: 'KH1', customerName: 'Khach 1', sourceId: 'SO1', active: true, accountingConfirmed: true }
  ];
  const result = debtNewService.groupLedgers(rows, { status: 'all' });
  assert.equal(result.ledgers.length, 2);
  assert.deepEqual(result.ledgers.map((row) => row.category).sort(), ['AR-DEBT-ADJUSTMENT', 'AR-DEBT-OPEN']);
  assert.equal(result.summary.totalDebt, 8000);
  assert.equal(result.customers[0].debt, 8000);
});

test('Delivery Today New summarizes original, returnOrders, collected and final debt without mutating confirmed closeout', () => {
  const order = {
    id: 'SO1',
    code: 'SO1',
    customerCode: 'KH1',
    customerName: 'Khach 1',
    totalAmount: 1000000,
    paidAmount: 300000,
    deliveryCloseout: {
      status: 'accounting_confirmed',
      finalDebtAmount: 600000,
      version: 1,
      versions: [{ status: 'accounting_confirmed', version: 1 }]
    }
  };
  const returnsByKey = new Map([['SO1', [{ id: 'RO1', amount: 100000 }]]]);
  const row = deliveryTodayNewService.summarizeOrder(order, returnsByKey);
  assert.equal(row.originalAmount, 1000000);
  assert.equal(row.returnedAmount, 100000);
  assert.equal(row.collectedAmount, 300000);
  assert.equal(row.finalDebtAmount, 600000);
  assert.equal(row.accountingConfirmed, true);
  assert.equal(row.correctionRequired, true);
});

test('Delivery Today New exposes returnOrders details and item rows for business UI', () => {
  const normalized = deliveryTodayNewService._private.normalizeReturn({
    id: 'RO1',
    code: 'RO-SO1',
    salesOrderId: 'SO1',
    salesOrderCode: 'B0001',
    customerCode: 'KH1',
    customerName: 'Khach 1',
    returnDate: '2026-06-30',
    status: 'confirmed',
    note: 'Hàng móp',
    items: [
      {
        productCode: '0864',
        productName: 'SP 0864',
        unit: 'gói',
        returnQty: 2,
        unitPrice: 50000
      }
    ]
  });
  const order = {
    id: 'SO1',
    code: 'B0001',
    customerCode: 'KH1',
    customerName: 'Khach 1',
    totalAmount: 200000,
    deliveryCloseout: { status: 'accounting_confirmed', finalDebtAmount: 100000, version: 1 }
  };
  const row = deliveryTodayNewService.summarizeOrder(order, new Map([['SO1', [normalized]]]));
  assert.equal(row.returnOrderCount, 1);
  assert.deepEqual(row.returnOrderCodes, ['RO-SO1']);
  assert.equal(row.latestReturnDate, '2026-06-30');
  assert.equal(row.returnOrders[0].code, 'RO-SO1');
  assert.equal(row.returnOrders[0].totalAmount, 100000);
  assert.equal(row.returnOrders[0].items[0].productCode, '0864');
  assert.equal(row.returnOrders[0].items[0].returnQty, 2);
});

test('Delivery Today New UI renders returnOrders business block without requiring correction flow', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');
  assert.match(source, /Phiếu trả hiện tại/);
  assert.match(source, /returnOrders/);
  assert.match(source, /returnOrders/);
  assert.match(source, /Mã SP/);
  assert.match(source, /SL trả đúng/);
  assert.match(source, /Hàng giao/);
  assert.match(source, /correctedReturnItems/);
  assert.match(source, /oldReturnQty/);
  assert.match(source, /newReturnQty/);
});

test('Delivery Today New listOrders uses delivery operational list instead of broad SalesOrder date scan', async () => {
  let salesOrderFindCalled = false;
  deliveryTodayNewService.setDeliveryListServiceForTest({
    async listDeliveryToday(query) {
      assert.equal(query.date, '2026-06-30');
      return {
        orders: [
          {
            id: 'SO-DELIVERY-1',
            code: 'B0001',
            salesOrderId: 'SO-DELIVERY-1',
            salesOrderCode: 'B0001',
            customerCode: 'KH1',
            customerName: 'Khach 1',
            deliveryDate: '2026-06-30',
            deliveryStaffCode: 'GH1',
            deliveryStaffName: 'Giao hang 1',
            salesStaffCode: 'NV1',
            salesStaffName: 'Ban hang 1',
            totalReceivable: 1000000,
            cashAmount: 200000,
            bankAmount: 50000,
            rewardAmount: 10000,
            accountingConfirmed: true,
            accountingStatus: 'accounting_confirmed'
          }
        ]
      };
    }
  });
  deliveryTodayNewService.setModelsForTest({
    SalesOrder: { find() { salesOrderFindCalled = true; throw new Error('SalesOrder.find must not be used by default'); } },
    ReturnOrder: { find() { return { lean: async () => [] }; } },
    DeliveryCloseoutVersion: { find() { return { sort() { return { lean: async () => [] }; } }; } }
  });

  const result = await deliveryTodayNewService.listOrders({ date: '2026-06-30' });
  assert.equal(salesOrderFindCalled, false);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].orderId, 'SO-DELIVERY-1');
  assert.equal(result.rows[0].cashAmount, 200000);
  assert.equal(result.rows[0].bankAmount, 50000);
  assert.equal(result.rows[0].rewardAmount, 10000);
  assert.equal(result.diagnostics.deliverySourceApplied, true);

  deliveryTodayNewService.setDeliveryListServiceForTest(null);
  deliveryTodayNewService.setModelsForTest(null);
});

test('Delivery Today New item-level return adjustment UI keeps Phase92 immutable correction contract', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');
  assert.match(source, /Điều chỉnh đơn giao/);
  assert.match(source, /không sửa bản cũ/);
  assert.doesNotMatch(source, /AR-RETURN/);
  assert.match(source, /correctedReturnItems/);
  assert.doesNotMatch(source, /fetch\([^)]*return-orders/i);
  assert.doesNotMatch(source, /\/api\/return-orders/);
});

test('Delivery Today New filter fields are wired with autocomplete suggestion boxes', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');
  assert.match(source, /deliveryTodayNewDeliverySuggestions/);
  assert.match(source, /deliveryTodayNewSalesmanSuggestions/);
  assert.match(source, /deliveryTodayNewSearchSuggestions/);
  assert.match(source, /bindFilterAutocomplete/);
  assert.match(source, /searchDeliveryStaff/);
  assert.match(source, /searchSalesStaff/);
  assert.match(source, /orderSearchSuggestions/);
  assert.match(source, /delivery-v46-filter-suggest/);
});
