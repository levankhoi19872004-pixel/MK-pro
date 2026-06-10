'use strict';

const dateUtil = require('../utils/date.util');
const ArLedger = require('../models/ArLedger');
const FundLedger = require('../models/FundLedger');
const InventorySnapshot = require('../models/Inventory');
const MasterOrder = require('../models/MasterOrder');
const ImportOrder = require('../models/ImportOrder');

const INACTIVE_STATUSES = ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled'];
const DEBT_ZERO_TOLERANCE = 1000;

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function activeMatch(extra = {}) {
  return {
    status: { $nin: INACTIVE_STATUSES },
    ...extra
  };
}

function buildDateMatch(query = {}, fields = ['date'], options = {}) {
  const exactDate = dateUtil.toDateOnly(query.date || query.targetDate || '');
  const dateFrom = dateUtil.toDateOnly(query.dateFrom || query.from || '');
  const dateTo = dateUtil.toDateOnly(query.dateTo || query.to || '');
  const defaultToday = options.defaultToday !== false;
  const target = exactDate || (!dateFrom && !dateTo && defaultToday ? dateUtil.todayVN() : '');

  if (!target && !dateFrom && !dateTo) return {};

  const fieldConditions = [];
  for (const field of fields) {
    if (target) {
      fieldConditions.push({ [field]: target });
      continue;
    }
    const range = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lte = dateTo;
    fieldConditions.push({ [field]: range });
  }

  return fieldConditions.length === 1 ? fieldConditions[0] : { $or: fieldConditions };
}

function buildTodaySalesPipeline(query = {}) {
  return [
    { $match: activeMatch({ type: 'AR-SALE', ...buildDateMatch(query, ['date']) }) },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$debit', '$amount'] } }, count: { $sum: 1 } } }
  ];
}

function buildOpenDebtPipeline() {
  return [
    { $match: activeMatch({}) },
    {
      $group: {
        _id: { customerId: '$customerId', customerCode: '$customerCode', customerName: '$customerName' },
        debit: { $sum: { $ifNull: ['$debit', 0] } },
        credit: { $sum: { $ifNull: ['$credit', 0] } }
      }
    },
    { $project: { debit: 1, credit: 1, balance: { $subtract: ['$debit', '$credit'] } } },
    { $match: { balance: { $gt: DEBT_ZERO_TOLERANCE } } },
    { $group: { _id: null, total: { $sum: '$balance' }, customers: { $sum: 1 }, totalDebit: { $sum: '$debit' }, totalCredit: { $sum: '$credit' } } }
  ];
}

function buildCollectedTodayPipeline(query = {}) {
  return [
    {
      $match: activeMatch({
        ...buildDateMatch(query, ['date', 'deliveryDate']),
        $or: [
          { type: { $in: ['CASH_RECEIPT', 'BANK_RECEIPT'] } },
          { sourceType: { $in: ['AR_RECEIPT', 'RECEIPT', 'MOBILE_RECEIPT'] } },
          { refType: { $in: ['AR_RECEIPT', 'RECEIPT', 'MOBILE_RECEIPT'] } },
          { direction: 'in' }
        ]
      })
    },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } }, count: { $sum: 1 } } }
  ];
}

function buildReturnTodayPipeline(query = {}) {
  return [
    { $match: activeMatch({ type: 'AR-RETURN', ...buildDateMatch(query, ['date']) }) },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$credit', '$amount'] } }, count: { $sum: 1 } } }
  ];
}

function buildNegativeStockPipeline() {
  return [
    {
      $project: {
        qty: { $ifNull: ['$qty', { $ifNull: ['$quantity', { $ifNull: ['$onHand', '$availableQty'] }] }] }
      }
    },
    { $match: { qty: { $lt: 0 } } },
    { $group: { _id: null, count: { $sum: 1 }, totalNegativeQty: { $sum: '$qty' } } }
  ];
}

function buildPendingDeliveryPipeline(query = {}) {
  return [
    {
      $match: activeMatch({
        ...buildDateMatch(query, ['deliveryDate', 'date'], { defaultToday: false }),
        status: { $in: ['assigned', 'pending', 'ready', 'shipping', 'active'] },
        deliveryStatus: { $nin: ['delivered', 'completed', 'done', 'cancelled', 'canceled'] }
      })
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        amount: { $sum: { $ifNull: ['$totalAmount', { $ifNull: ['$amount', 0] }] } },
        orderCount: { $sum: { $ifNull: ['$orderCount', { $size: { $ifNull: ['$childOrders', []] } }] } },
        collectedAmount: { $sum: { $ifNull: ['$collectedAmount', '$paidAmount'] } }
      }
    }
  ];
}

function buildImportsPipeline(query = {}) {
  return [
    { $match: activeMatch(buildDateMatch(query, ['date', 'documentDate', 'createdAt'], { defaultToday: false })) },
    { $group: { _id: null, importCount: { $sum: 1 }, totalImportAmount: { $sum: { $ifNull: ['$totalAmount', { $ifNull: ['$amount', 0] }] } } } }
  ];
}

async function runAggregate(Model, pipeline) {
  const result = Model.aggregate(pipeline);
  if (result && typeof result.allowDiskUse === 'function') {
    const withDisk = result.allowDiskUse(true);
    if (withDisk && typeof withDisk.exec === 'function') return withDisk.exec();
    return withDisk;
  }
  if (result && typeof result.exec === 'function') return result.exec();
  return result;
}

function first(rows = []) {
  return Array.isArray(rows) && rows.length ? rows[0] : {};
}

function normalizeDashboardAggregateRows(parts = {}) {
  const sales = first(parts.sales);
  const debt = first(parts.debt);
  const collected = first(parts.collected);
  const returns = first(parts.returns);
  const negativeStock = first(parts.negativeStock);
  const pendingDelivery = first(parts.pendingDelivery);
  const imports = first(parts.imports);

  const salesSummary = {
    orderCount: toNumber(sales.count),
    totalAmount: toNumber(sales.total),
    paidAmount: 0,
    debtAmount: 0
  };
  const debtSummary = {
    customerCount: toNumber(debt.customers),
    totalDebit: toNumber(debt.totalDebit),
    totalCredit: toNumber(debt.totalCredit),
    totalDebt: toNumber(debt.total),
    totalPositiveDebt: toNumber(debt.total),
    debtZeroTolerance: DEBT_ZERO_TOLERANCE,
    optimized: true,
    aggregateDashboard: true
  };
  const financeSummary = {
    receiptCount: toNumber(collected.count),
    totalReceipts: toNumber(collected.total),
    cashIn: toNumber(collected.total),
    cashOut: 0,
    cashBalance: toNumber(collected.total),
    bankIn: 0,
    bankOut: 0,
    bankBalance: 0,
    returnCount: toNumber(returns.count),
    totalReturns: toNumber(returns.total)
  };
  const stockSummary = {
    productCount: toNumber(negativeStock.count),
    negativeStockCount: toNumber(negativeStock.count),
    negativeStockQty: toNumber(negativeStock.totalNegativeQty),
    totalQty: toNumber(negativeStock.totalNegativeQty),
    sourceOfTruth: 'inventorySnapshots'
  };
  const deliverySummary = {
    tripCount: toNumber(pendingDelivery.count),
    orderCount: toNumber(pendingDelivery.orderCount || pendingDelivery.count),
    totalAmount: toNumber(pendingDelivery.amount),
    collectedAmount: toNumber(pendingDelivery.collectedAmount)
  };

  return {
    source: 'mongo_aggregate_dashboard',
    dashboard: {
      sales: salesSummary,
      debts: debtSummary,
      stock: stockSummary,
      finance: financeSummary,
      delivery: deliverySummary,
      imports: {
        importCount: toNumber(imports.importCount),
        totalImportAmount: toNumber(imports.totalImportAmount)
      },
      kpi: {
        todaySales: salesSummary.totalAmount,
        openDebt: debtSummary.totalDebt,
        openDebtCustomers: debtSummary.customerCount,
        collectedToday: financeSummary.totalReceipts,
        returnToday: financeSummary.totalReturns,
        negativeStockCount: stockSummary.negativeStockCount,
        negativeStockQty: stockSummary.negativeStockQty,
        pendingDeliveryOrders: deliverySummary.tripCount,
        pendingDeliveryAmount: deliverySummary.totalAmount
      }
    }
  };
}

async function getDashboardSummaryAggregate(filters = {}) {
  const [sales, debt, collected, returns, negativeStock, pendingDelivery, imports] = await Promise.all([
    runAggregate(ArLedger, buildTodaySalesPipeline(filters)),
    runAggregate(ArLedger, buildOpenDebtPipeline(filters)),
    runAggregate(FundLedger, buildCollectedTodayPipeline(filters)),
    runAggregate(ArLedger, buildReturnTodayPipeline(filters)),
    runAggregate(InventorySnapshot, buildNegativeStockPipeline(filters)),
    runAggregate(MasterOrder, buildPendingDeliveryPipeline(filters)),
    runAggregate(ImportOrder, buildImportsPipeline(filters))
  ]);

  return normalizeDashboardAggregateRows({ sales, debt, collected, returns, negativeStock, pendingDelivery, imports });
}

module.exports = {
  getDashboardSummaryAggregate,
  normalizeDashboardAggregateRows,
  buildTodaySalesPipeline,
  buildOpenDebtPipeline,
  buildCollectedTodayPipeline,
  buildReturnTodayPipeline,
  buildNegativeStockPipeline,
  buildPendingDeliveryPipeline,
  buildImportsPipeline
};
