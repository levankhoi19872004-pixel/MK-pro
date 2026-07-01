'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const debtNewService = require('../src/services/v2/debtNew.service');
const deliveryTodayNewService = require('../src/services/v2/deliveryTodayNew.service');
const { normalizeDebtAmount, calculateDeliveryDebtAmount, DEBT_ZERO_TOLERANCE } = require('../src/constants/finance.constants');
const DeliveryCloseoutService = require('../src/services/accounting/DeliveryCloseoutService');

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


test('Delivery Today New backend returns guarded empty result when no user search criteria is provided', async () => {
  let deliveryListCalled = false;
  let salesOrderFindCalled = false;
  deliveryTodayNewService.setDeliveryListServiceForTest({
    async listDeliveryToday() {
      deliveryListCalled = true;
      return { orders: [{ id: 'SHOULD-NOT-LOAD' }] };
    }
  });
  deliveryTodayNewService.setModelsForTest({
    SalesOrder: { find() { salesOrderFindCalled = true; throw new Error('SalesOrder.find must not be used without criteria'); } },
    ReturnOrder: { find() { throw new Error('ReturnOrder.find must not be used without criteria'); } },
    DeliveryCloseoutVersion: { find() { throw new Error('DeliveryCloseoutVersion.find must not be used without criteria'); } }
  });

  const result = await deliveryTodayNewService.listOrders({ date: '2026-06-30', deliveryDateChangedByUser: '0' });
  assert.equal(deliveryTodayNewService.hasSearchCriteria({ date: '2026-06-30', deliveryDateChangedByUser: '0' }), false);
  assert.equal(deliveryTodayNewService.hasSearchCriteria({ date: '2026-06-30', deliveryDateChangedByUser: '1' }), true);
  assert.equal(deliveryTodayNewService.hasSearchCriteria({ delivery: 'ghkx' }), true);
  assert.equal(deliveryListCalled, false);
  assert.equal(salesOrderFindCalled, false);
  assert.equal(result.rows.length, 0);
  assert.equal(result.summary.orderCount, 0);
  assert.equal(result.diagnostics.searchCriteriaRequired, true);

  deliveryTodayNewService.setDeliveryListServiceForTest(null);
  deliveryTodayNewService.setModelsForTest(null);
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

  const result = await deliveryTodayNewService.listOrders({ date: '2026-06-30', deliveryDateChangedByUser: '1' });
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


test('Delivery Today New UI requires explicit user search before loading results', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');
  assert.match(source, /hasValidSearchCriteria/);
  assert.match(source, /deliveryDateTouched/);
  assert.match(source, /deliveryDateChangedByUser/);
  assert.match(source, /resetResultsState/);
  assert.match(source, /deliveryTodayNewEmptyState/);
  assert.match(source, /Vui lòng nhập ít nhất một điều kiện tìm kiếm/);
  const initBody = source.slice(source.indexOf('function initWhenTabActive'), source.indexOf('document.addEventListener', source.indexOf('function initWhenTabActive')));
  assert.doesNotMatch(initBody, /load\(\)/);
  const resetStart = source.indexOf('function resetFiltersToEmptyState');
  const resetBody = source.slice(resetStart, source.indexOf('function hasValidSearchCriteria', resetStart));
  assert.match(resetBody, /state\.deliveryDateTouched\s*=\s*false/);
  assert.doesNotMatch(resetBody, /load\(\)/);
});

test('Debt New backend returns guarded empty result when no user search criteria is provided', async () => {
  let arFindCalled = false;
  debtNewService.setModelsForTest({
    ArLedger: {
      find() {
        arFindCalled = true;
        throw new Error('ArLedger.find must not be used without search criteria');
      }
    }
  });

  const result = await debtNewService.listCustomers({ status: 'open' });
  assert.equal(debtNewService.hasSearchCriteria({ status: 'open' }), false);
  assert.equal(debtNewService.hasSearchCriteria({ q: 'B0038496', status: 'open' }), true);
  assert.equal(debtNewService.hasSearchCriteria({ salesman: '39534' }), true);
  assert.equal(debtNewService.hasSearchCriteria({ delivery: 'ghkx' }), true);
  assert.equal(arFindCalled, false);
  assert.equal(result.customers.length, 0);
  assert.equal(result.summary.customerCount, 0);
  assert.equal(result.diagnostics.searchCriteriaRequired, true);

  debtNewService.setModelsForTest(null);
});

test('Debt New UI requires explicit user search and exposes debt collection workflow', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/92-debt-new.js'), 'utf8');
  assert.match(source, /hasValidSearchCriteria/);
  assert.match(source, /debtNewEmptyState/);
  assert.match(source, /resetResultsState/);
  assert.match(source, /Vui lòng nhập ít nhất một điều kiện tìm kiếm/);
  assert.match(source, /Tạo phiếu thu chờ xác nhận/);
  assert.match(source, /submitted/);
  assert.match(source, /AR-DEBT-PAYMENT/);
  assert.match(source, /debtNewSubmitCollection/);
  assert.match(source, /\/api\/new\/debt\/collections/);
  const initBody = source.slice(source.indexOf('function initWhenTabActive'), source.indexOf('document.addEventListener', source.indexOf('function initWhenTabActive')));
  assert.doesNotMatch(initBody, /load\(\)/);
  const resetStart = source.indexOf('function resetFiltersToEmptyState');
  const resetBody = source.slice(resetStart, source.indexOf('function applySummary', resetStart));
  assert.doesNotMatch(resetBody, /load\(\)/);
});

test('Debt New routes expose collection submit confirm and reject under /api/new', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const route = fs.readFileSync(path.join(__dirname, '..', 'src/routes/newOperationsRoutes.js'), 'utf8');
  assert.match(route, /DebtCollectionService/);
  assert.match(route, /debt\/collections/);
  assert.match(route, /submitDebtCollection/);
  assert.match(route, /confirmDebtCollection/);
  assert.match(route, /rejectDebtCollection/);
  assert.match(route, /writeRoles/);
});

test('Debt New suggestion API is guarded and limited', async () => {
  let arFindCalled = false;
  debtNewService.setModelsForTest({
    ArLedger: {
      find() {
        arFindCalled = true;
        throw new Error('ArLedger.find must not be used when suggestion q is too short');
      }
    }
  });

  const result = await debtNewService.suggestions({ type: 'customerOrder', q: 'B', limit: 99 });
  assert.equal(arFindCalled, false);
  assert.equal(result.items.length, 0);
  assert.equal(result.diagnostics.searchCriteriaRequired, true);
  assert.equal(result.diagnostics.minQueryLength, 2);
  assert.equal(debtNewService._private.suggestionLimit(99), 10);

  debtNewService.setModelsForTest(null);
});

test('Debt New compact filter UI wires autocomplete without breaking search gate', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/92-debt-new.js'), 'utf8');
  assert.match(source, /debt-new-filter-card/);
  assert.match(source, /debt-new-filter-grid/);
  assert.match(source, /debt-new-source-badge/);
  assert.match(source, /debtNewSearchSuggestions/);
  assert.match(source, /debtNewSalesmanSuggestions/);
  assert.match(source, /debtNewDeliverySuggestions/);
  assert.match(source, /fetch\('\/api\/new\/debt\/suggestions\?/);
  assert.match(source, /value\.length < 2/);
  assert.match(source, /limit: '10'/);
  assert.match(source, /resetSelectedFilters\(\)/);
  assert.match(source, /closeAllSuggestions\(\)/);
  assert.match(source, /customerCode/);
  assert.match(source, /orderCode/);
  assert.match(source, /salesStaffCode/);
  assert.match(source, /deliveryStaffCode/);
  assert.doesNotMatch(source.slice(source.indexOf('function chooseSuggestion'), source.indexOf('function moveSuggestionActive')), /load\(\)/);
});

test('Debt New suggestion route is scoped and authenticated', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const route = fs.readFileSync(path.join(__dirname, '..', 'src/routes/newOperationsRoutes.js'), 'utf8');
  assert.match(route, /router\.get\('\/debt\/suggestions'/);
  assert.match(route, /debtNewService\.suggestions/);
  assert.match(route, /requireAuth, readRoles/);
  assert.match(route, /canonicalRoute: '\/api\/new\/debt\/suggestions'/);
});

test('Debt New suggestions return customer order and staff items from AR-DEBT read rows', async () => {
  const rows = [
    {
      account: 'AR', category: 'AR-DEBT-OPEN', ledgerType: 'AR-DEBT-OPEN', debit: 1858440, credit: 0, amount: 1858440,
      customerCode: 'B0038496', customerName: 'An Bình', sourceId: 'SO1', sourceCode: 'SO178-AB', orderCode: 'SO178-AB',
      salesStaffCode: '39534', salesStaffName: 'Lương Thị Kiều', deliveryStaffCode: 'ghkx', deliveryStaffName: 'Thành GH Kiến Xương',
      active: true, accountingConfirmed: true, accountingStatus: 'confirmed', direction: 'debit', amountField: 'debit'
    }
  ];
  debtNewService.setModelsForTest({
    ArLedger: {
      find() {
        return {
          sort() { return this; },
          limit() { return this; },
          lean() { return this; },
          then(resolve) { return Promise.resolve(resolve(rows)); }
        };
      }
    }
  });

  const customerResult = await debtNewService.suggestions({ type: 'customerOrder', q: 'B003', limit: 10 });
  assert.equal(customerResult.items.some((item) => item.type === 'customer' && item.code === 'B0038496'), true);
  assert.equal(customerResult.items.some((item) => item.type === 'order' && item.orderCode === 'SO178-AB'), true);

  const staffResult = await debtNewService.suggestions({ type: 'salesman', q: 'Kiều', limit: 10 });
  assert.equal(staffResult.items.length, 1);
  assert.equal(staffResult.items[0].code, '39534');
  assert.match(staffResult.items[0].label, /Lương Thị Kiều/);

  debtNewService.setModelsForTest(null);
});


test('Debt zero tolerance normalizes delivery debt between -1000 and 1000 to zero', () => {
  assert.equal(DEBT_ZERO_TOLERANCE, 1000);
  assert.equal(normalizeDebtAmount(999), 0);
  assert.equal(normalizeDebtAmount(1000), 0);
  assert.equal(normalizeDebtAmount(1001), 1001);
  assert.equal(normalizeDebtAmount(-999), 0);
  assert.equal(normalizeDebtAmount(-1000), 0);
  assert.equal(normalizeDebtAmount(-1001), -1001);
});

test('Delivery Today New backend summary uses normalized debt amount', () => {
  const rowA = deliveryTodayNewService.summarizeOrder({
    id: 'SO-TOLERANCE-1', code: 'SO-TOLERANCE-1', customerCode: 'KH1', customerName: 'Khach 1', totalAmount: 1000000,
    deliveryCloseout: { collectedAmount: 999500, status: 'draft' }
  }, new Map(), new Map());
  assert.equal(rowA.rawFinalDebtAmount, 500);
  assert.equal(rowA.finalDebtAmount, 0);

  const rowB = deliveryTodayNewService.summarizeOrder({
    id: 'SO-TOLERANCE-2', code: 'SO-TOLERANCE-2', customerCode: 'KH2', customerName: 'Khach 2', totalAmount: 1000000,
    deliveryCloseout: { collectedAmount: 998999, status: 'draft' }
  }, new Map(), new Map());
  assert.equal(rowB.finalDebtAmount, 1001);

  const summary = deliveryTodayNewService.summarizeRows([rowA, rowB]);
  assert.equal(summary.finalDebtAmount, 1001);
});

test('Delivery Today New closeout UI has compact KPI and closeout action', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/app/new/91-delivery-today-new.js'), 'utf8');
  assert.match(source, /deliveryTodayNewCloseout/);
  assert.match(source, /Chốt sổ giao hàng/);
  assert.match(source, /deliveryTodayNewCloseoutModal/);
  assert.match(source, /renderSelectedSalesmanCompactSummary/);
  assert.match(source, /Tổng theo NVBH đã chọn/);
  assert.match(source, /\/api\/new\/delivery-today\/closeout/);
  assert.match(source, /Đã chốt sổ/);
  assert.doesNotMatch(source, /delivery-new-salesman-kpis/);
  assert.doesNotMatch(source, /renderSalesmanKpis/);
});

test('Delivery Today New closeout route is authenticated and uses accounting closeout service', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const route = fs.readFileSync(path.join(__dirname, '..', 'src/routes/newOperationsRoutes.js'), 'utf8');
  assert.match(route, /router\.post\('\/delivery-today\/closeout'/);
  assert.match(route, /closeoutRoles = requireRole\(\['admin', 'accountant'\]\)/);
  assert.match(route, /requireAuth, closeoutRoles/);
  assert.match(route, /AccountingCloseoutService\.confirmDeliveryAccounting/);
  assert.match(route, /DELIVERY_CLOSEOUT_REASON_REQUIRED/);
  assert.match(route, /debtLedgerCreated/);
  assert.match(route, /skippedZeroDebt/);
  assert.match(route, /totalDebtPosted/);
  assert.match(route, /canonicalRoute: '\/api\/new\/delivery-today\/closeout'/);
});

test('AR-DEBT-OPEN posting source applies debt zero tolerance before creating ledger', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/accounting/ArDebtOpenPostingService.js'), 'utf8');
  assert.match(source, /normalizeDebtAmount/);
  assert.match(source, /const amount = normalizeDebtAmount\(closeout\.finalDebtAmount\)/);
  assert.match(source, /amount < 0/);
  assert.match(source, /overpayment_final_debt_negative/);
  assert.match(source, /amount === 0/);
  assert.match(source, /zero_final_debt/);
  assert.match(source, /category: 'AR-DEBT-OPEN'/);
  assert.match(source, /ledgerType: 'AR-DEBT-OPEN'/);
  assert.match(source, /entryType: 'normal'/);
  assert.match(source, /active: true/);
  assert.match(source, /reversed: false/);
  assert.match(source, /idempotencyKey: `AR-DEBT-OPEN:\$\{sourceId\}`/);
});

test('Delivery closeout route requires explicit selected orderIds', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const route = fs.readFileSync(path.join(__dirname, '..', 'src/routes/newOperationsRoutes.js'), 'utf8');
  assert.match(route, /ORDER_SELECTION_REQUIRED/);
  assert.match(route, /Array\.isArray\(body\.orderIds\)/);
  assert.match(route, /Vui lòng chọn ít nhất một đơn để chốt sổ/);
  assert.match(route, /AccountingCloseoutService\.confirmDeliveryAccounting/);
});

test('Accounting closeout validates selected order scope before posting AR-DEBT', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/accounting/AccountingCloseoutService.js'), 'utf8');
  assert.match(source, /function validateSelectedOrderScope/);
  assert.match(source, /ORDER_SELECTION_REQUIRED/);
  assert.match(source, /ORDER_SELECTION_NOT_FOUND/);
  assert.match(source, /ORDER_SELECTION_DATE_MISMATCH/);
  assert.match(source, /ORDER_SELECTION_DELIVERY_STAFF_MISMATCH/);
  assert.match(source, /ORDER_SELECTION_SALES_STAFF_MISMATCH/);
  assert.match(source, /validateSelectedOrderScope\(orders, body, selectedOrderIds\)/);
});


test('Delivery debt formula subtracts cash bank reward and returns before tolerance', () => {
  let result = calculateDeliveryDebtAmount({ receivableAmount: 1562192, cashAmount: 942000, bankAmount: 0, rewardAmount: 0, returnAmount: 619646 });
  assert.equal(result.rawDebtAmount, 546);
  assert.equal(result.debtAmount, 0);

  result = calculateDeliveryDebtAmount({ receivableAmount: 1562192, cashAmount: 0, bankAmount: 942000, rewardAmount: 0, returnAmount: 619646 });
  assert.equal(result.rawDebtAmount, 546);
  assert.equal(result.debtAmount, 0);

  result = calculateDeliveryDebtAmount({ receivableAmount: 1562192, cashAmount: 500000, bankAmount: 442000, rewardAmount: 0, returnAmount: 619646 });
  assert.equal(result.rawDebtAmount, 546);
  assert.equal(result.debtAmount, 0);

  result = calculateDeliveryDebtAmount({ receivableAmount: 1562192, cashAmount: 0, bankAmount: 0, rewardAmount: 0, returnAmount: 619646 });
  assert.equal(result.rawDebtAmount, 942546);
  assert.equal(result.debtAmount, 942546);
});

test('DeliveryCloseoutService maps cash and bank aliases before posting AR-DEBT', () => {
  const order = {
    id: 'SO-B0038522',
    code: 'B0038522',
    customerCode: '4499944',
    customerName: 'Vân lý',
    totalAmount: 1562192,
    cashAmount: 942000,
    bankAmount: 0,
    deliveryStatus: 'delivered'
  };
  const closeout = DeliveryCloseoutService.buildCloseout(order, [
    { id: 'RO-B0038522', sourceOrderId: 'SO-B0038522', status: 'confirmed', inventoryPosted: true, totalReturnAmount: 619646 }
  ], [], { actor: 'KT' });
  assert.equal(closeout.originalAmount, 1562192);
  assert.equal(closeout.cashAmount, 942000);
  assert.equal(closeout.bankAmount, 0);
  assert.equal(closeout.returnedAmount, 619646);
  assert.equal(closeout.rawFinalDebtAmount, 546);
  assert.equal(closeout.finalDebtAmount, 0);
  assert.equal(closeout.collectedAmount, 942000);
  assert.equal(closeout.paymentRows.some((row) => row.method === 'cash' && row.amount === 942000), true);
  assert.equal(closeout.finalDebtAmount, 0);
});

test('DeliveryCloseoutService subtracts bank transfer aliases and mixed cash bank payments', () => {
  const base = { id: 'SO-BANK', code: 'B0038522-BANK', customerCode: '4499944', customerName: 'Vân lý', totalAmount: 1562192, deliveryStatus: 'delivered' };
  const returns = [{ id: 'RO-BANK', sourceOrderId: 'SO-BANK', status: 'confirmed', inventoryPosted: true, totalReturnAmount: 619646 }];
  const bankOnly = DeliveryCloseoutService.buildCloseout({ ...base, bankTransferAmount: 942000 }, returns, [], { actor: 'KT' });
  assert.equal(bankOnly.bankAmount, 942000);
  assert.equal(bankOnly.rawFinalDebtAmount, 546);
  assert.equal(bankOnly.finalDebtAmount, 0);

  const mixed = DeliveryCloseoutService.buildCloseout({ ...base, id: 'SO-MIXED', code: 'B0038522-MIXED', paymentCashAmount: 500000, paymentTransferAmount: 442000 }, [
    { id: 'RO-MIXED', sourceOrderId: 'SO-MIXED', status: 'confirmed', inventoryPosted: true, totalReturnAmount: 619646 }
  ], [], { actor: 'KT' });
  assert.equal(mixed.cashAmount, 500000);
  assert.equal(mixed.bankAmount, 442000);
  assert.equal(mixed.rawFinalDebtAmount, 546);
  assert.equal(mixed.finalDebtAmount, 0);
});

test('Closeout source code blocks PT minus HT debt formula and exposes diagnostics fields', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const closeoutSource = fs.readFileSync(path.join(__dirname, '..', 'src/services/accounting/DeliveryCloseoutService.js'), 'utf8');
  assert.match(closeoutSource, /calculateDeliveryDebtAmount/);
  assert.match(closeoutSource, /cashAmount/);
  assert.match(closeoutSource, /bankAmount/);
  assert.match(closeoutSource, /rewardAmount/);
  assert.match(closeoutSource, /returnAmount: returnSummary\.returnedAmount/);
  assert.doesNotMatch(closeoutSource, /rawFinalDebtAmount\s*=\s*money\(baseAmount\s*-\s*returnSummary\.returnedAmount/);

  const accountingSource = fs.readFileSync(path.join(__dirname, '..', 'src/services/accounting/AccountingCloseoutService.js'), 'utf8');
  assert.match(accountingSource, /buildCloseoutDiagnostic/);
  assert.match(accountingSource, /cashAmount/);
  assert.match(accountingSource, /bankAmount/);
  assert.match(accountingSource, /rawDebtAmount/);
  assert.match(accountingSource, /normalizedDebtAmount/);
  assert.match(accountingSource, /OVERPAID_OR_NEGATIVE_DEBT/);
});
