'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function aggregateStub(rows) {
  return () => ({ allowDiskUse: () => ({ exec: async () => rows }) });
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../models/ArLedger') return { aggregate: aggregateStub([]) };
  if (request === '../models/FundLedger') return { aggregate: aggregateStub([]) };
  if (request === '../models/Inventory') return { aggregate: aggregateStub([]) };
  if (request === '../models/MasterOrder') return { aggregate: aggregateStub([]) };
  if (request === '../models/ImportOrder') return { aggregate: aggregateStub([]) };
  return originalLoad.apply(this, arguments);
};

const dashboardAggregate = require('../src/services/dashboardAggregate.service');
Module._load = originalLoad;

const {
  buildTodaySalesPipeline,
  buildOpenDebtPipeline,
  buildCollectedTodayPipeline,
  buildReturnTodayPipeline,
  buildNegativeStockPipeline,
  buildPendingDeliveryPipeline,
  normalizeDashboardAggregateRows
} = dashboardAggregate;

test('dashboard aggregate pipelines use Mongo group/project instead of app-level reduce', () => {
  assert.ok(buildTodaySalesPipeline({ date: '2026-06-10' }).some((stage) => stage.$group));
  assert.ok(buildOpenDebtPipeline().some((stage) => stage.$project && stage.$project.balance));
  assert.ok(buildCollectedTodayPipeline({ date: '2026-06-10' }).some((stage) => stage.$group));
  assert.ok(buildReturnTodayPipeline({ date: '2026-06-10' }).some((stage) => stage.$match && stage.$match.type === 'AR-RETURN'));
  assert.ok(buildNegativeStockPipeline().some((stage) => stage.$match && stage.$match.qty.$lt === 0));
  assert.ok(buildPendingDeliveryPipeline({}).some((stage) => stage.$group));
});

test('dashboard aggregate returns legacy-compatible empty summary', () => {
  const result = normalizeDashboardAggregateRows({});
  assert.equal(result.source, 'mongo_aggregate_dashboard');
  assert.equal(result.dashboard.sales.totalAmount, 0);
  assert.equal(result.dashboard.debts.totalDebt, 0);
  assert.equal(result.dashboard.finance.totalReceipts, 0);
  assert.equal(result.dashboard.finance.totalReturns, 0);
  assert.equal(result.dashboard.stock.negativeStockCount, 0);
  assert.equal(result.dashboard.delivery.tripCount, 0);
  assert.equal(result.dashboard.kpi.todaySales, 0);
  assert.equal(result.dashboard.kpi.openDebt, 0);
  assert.equal(result.dashboard.kpi.collectedToday, 0);
  assert.equal(result.dashboard.kpi.returnToday, 0);
  assert.equal(result.dashboard.kpi.negativeStockCount, 0);
  assert.equal(result.dashboard.kpi.pendingDeliveryOrders, 0);
});

test('dashboard aggregate maps KPI rows to old dashboard contract', () => {
  const result = normalizeDashboardAggregateRows({
    sales: [{ total: 1000000, count: 3 }],
    debt: [{ total: 650000, customers: 2, totalDebit: 1000000, totalCredit: 350000 }],
    collected: [{ total: 250000, count: 2 }],
    returns: [{ total: 100000, count: 1 }],
    negativeStock: [{ count: 4, totalNegativeQty: -12 }],
    pendingDelivery: [{ count: 5, amount: 800000, orderCount: 9, collectedAmount: 200000 }],
    imports: [{ importCount: 2, totalImportAmount: 300000 }]
  });

  assert.deepEqual(result.dashboard.sales, { orderCount: 3, totalAmount: 1000000, paidAmount: 0, debtAmount: 0 });
  assert.equal(result.dashboard.debts.totalDebt, 650000);
  assert.equal(result.dashboard.finance.totalReceipts, 250000);
  assert.equal(result.dashboard.finance.totalReturns, 100000);
  assert.equal(result.dashboard.stock.negativeStockCount, 4);
  assert.equal(result.dashboard.delivery.tripCount, 5);
  assert.equal(result.dashboard.imports.importCount, 2);
  assert.equal(result.dashboard.kpi.pendingDeliveryAmount, 800000);
});
