'use strict';

const SalesOrder = require('../../models/SalesOrder');
const ReturnOrder = require('../../models/ReturnOrder');
const FundLedger = require('../../models/FundLedger');
const SalesTargetService = require('./SalesTargetService');
const DashboardCacheService = require('./DashboardCacheService');
const DashboardDailyStatsService = require('./DashboardDailyStatsService');
const dateUtil = require('../../utils/date.util');
const {
  activeDocumentFilter,
  accountingConfirmedFilter,
  returnConfirmedFilter,
  businessDateStages,
  numberExpression
} = require('./DashboardMongoExpressions');

function text(value) {
  return String(value || '').trim();
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function normalizeCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function calculateRate(actual, target) {
  const safeActual = Number(actual || 0);
  const safeTarget = Number(target || 0);
  if (!Number.isFinite(safeActual) || !Number.isFinite(safeTarget) || safeTarget <= 0) return 0;
  return Number(((safeActual / safeTarget) * 100).toFixed(2));
}

function parseMonth(month) {
  const period = SalesTargetService.assertPeriod(month || dateUtil.todayVN().slice(0, 7));
  const [year, monthNumber] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dateFrom = `${period}-01`;
  const dateTo = `${period}-${String(lastDay).padStart(2, '0')}`;
  return { period, dateFrom, dateTo, today: dateUtil.todayVN() };
}

function datePrefilter(dateFrom, dateTo, fields = []) {
  const fromText = text(dateFrom).slice(0, 10);
  const toText = text(dateTo).slice(0, 10);
  if (!fromText || !toText) return null;
  const startDate = new Date(`${fromText}T00:00:00.000Z`);
  const endExclusive = new Date(`${toText}T00:00:00.000Z`);
  if (Number.isFinite(endExclusive.getTime())) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const uniqueFields = [...new Set([...fields, 'createdAt'].filter(Boolean))];
  const clauses = [];
  for (const field of uniqueFields) {
    clauses.push({ [field]: { $gte: fromText, $lte: toText } });
    if (Number.isFinite(startDate.getTime()) && Number.isFinite(endExclusive.getTime())) {
      clauses.push({ [field]: { $gte: startDate, $lt: endExclusive } });
    }
  }
  return clauses.length ? { $or: clauses } : null;
}

function rootSalesAmountExpression() {
  return numberExpression([
    'afterPromoAmount',
    'totalAfterPromotion',
    'goodsAmountAfterPromotion',
    'netAmount',
    'totalAmount',
    'grandTotal',
    'amount',
    'total'
  ], 0);
}

function rootReturnAmountExpression() {
  return numberExpression(['returnAmount', 'totalReturnAmount', 'totalAmount', 'amount', 'debtReduction'], 0);
}

function accountingScopeFilter(scope) {
  if (scope === 'confirmed') return accountingConfirmedFilter();
  if (scope === 'pending') return { $nor: [accountingConfirmedFilter()] };
  return null;
}

async function aggregateSalesRoot(dateFrom, dateTo, scope = 'active') {
  const filters = [activeDocumentFilter()];
  const prefilter = datePrefilter(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']);
  if (prefilter) filters.push(prefilter);
  const scopeFilter = accountingScopeFilter(scope);
  if (scopeFilter) filters.push(scopeFilter);

  const result = await SalesOrder.aggregate([
    { $match: { $and: filters } },
    {
      $project: {
        orderDate: 1,
        date: 1,
        documentDate: 1,
        createdAt: 1,
        status: 1,
        lifecycleStatus: 1,
        deliveryStatus: 1,
        accountingStatus: 1,
        accountingConfirmed: 1,
        arStatus: 1,
        arPosted: 1,
        afterPromoAmount: 1,
        totalAfterPromotion: 1,
        goodsAmountAfterPromotion: 1,
        netAmount: 1,
        totalAmount: 1,
        grandTotal: 1,
        amount: 1,
        total: 1
      }
    },
    ...businessDateStages(dateFrom, dateTo, ['orderDate', 'date', 'documentDate']),
    {
      $group: {
        _id: null,
        orderCount: { $sum: 1 },
        salesAmount: { $sum: rootSalesAmountExpression() }
      }
    }
  ]).option({ comment: `dashboard.overview.sales-root.${scope}` }).allowDiskUse(true).exec();
  const row = result?.[0] || {};
  return {
    orderCount: normalizeCount(row.orderCount),
    salesAmount: normalizeMoney(row.salesAmount)
  };
}

async function aggregateReturnsRoot(dateFrom, dateTo) {
  const filters = [activeDocumentFilter(), returnConfirmedFilter()];
  const prefilter = datePrefilter(dateFrom, dateTo, ['returnDate', 'documentDate', 'date', 'deliveryDate']);
  if (prefilter) filters.push(prefilter);
  const result = await ReturnOrder.aggregate([
    { $match: { $and: filters } },
    {
      $project: {
        returnDate: 1,
        documentDate: 1,
        date: 1,
        deliveryDate: 1,
        createdAt: 1,
        status: 1,
        returnStatus: 1,
        returnState: 1,
        accountingStatus: 1,
        accountingConfirmed: 1,
        arPosted: 1,
        returnAmount: 1,
        totalReturnAmount: 1,
        totalAmount: 1,
        amount: 1,
        debtReduction: 1
      }
    },
    ...businessDateStages(dateFrom, dateTo, ['returnDate', 'documentDate', 'date', 'deliveryDate']),
    { $group: { _id: null, returnCount: { $sum: 1 }, returnAmount: { $sum: rootReturnAmountExpression() } } }
  ]).option({ comment: 'dashboard.overview.returns-root' }).allowDiskUse(true).exec();
  const row = result?.[0] || {};
  return {
    returnCount: normalizeCount(row.returnCount),
    returnAmount: normalizeMoney(row.returnAmount)
  };
}

async function aggregateDeliveryToday(date) {
  const filters = [activeDocumentFilter()];
  const prefilter = datePrefilter(date, date, ['deliveryDate', 'date', 'orderDate']);
  if (prefilter) filters.push(prefilter);
  const delivered = ['delivered', 'success', 'completed', 'done', 'paid', 'accounting_confirmed'];
  const failed = ['failed', 'cancelled', 'canceled', 'returned', 'delivery_failed'];
  const result = await SalesOrder.aggregate([
    { $match: { $and: filters } },
    { $project: { deliveryDate: 1, date: 1, orderDate: 1, createdAt: 1, deliveryStatus: 1, status: 1, totalAmount: 1, amount: 1, grandTotal: 1 } },
    ...businessDateStages(date, date, ['deliveryDate', 'date', 'orderDate']),
    {
      $group: {
        _id: null,
        assignedCount: { $sum: 1 },
        deliveredCount: { $sum: { $cond: [{ $in: [{ $toLower: { $convert: { input: { $ifNull: ['$deliveryStatus', '$status'] }, to: 'string', onError: '', onNull: '' } } }, delivered] }, 1, 0] } },
        failedCount: { $sum: { $cond: [{ $in: [{ $toLower: { $convert: { input: { $ifNull: ['$deliveryStatus', '$status'] }, to: 'string', onError: '', onNull: '' } } }, failed] }, 1, 0] } }
      }
    }
  ]).option({ comment: 'dashboard.overview.delivery-today' }).allowDiskUse(true).exec();
  const row = result?.[0] || {};
  const assignedCount = normalizeCount(row.assignedCount);
  const deliveredCount = normalizeCount(row.deliveredCount);
  const failedCount = normalizeCount(row.failedCount);
  return {
    assignedCount,
    deliveredCount,
    pendingCount: Math.max(0, assignedCount - deliveredCount - failedCount),
    failedCount
  };
}

async function aggregateCashToday(date) {
  const result = await FundLedger.aggregate([
    {
      $match: {
        $and: [
          { isDeleted: { $ne: true }, deletedAt: { $in: [null, ''] } },
          { date: { $gte: date, $lte: date } }
        ]
      }
    },
    { $project: { direction: 1, type: 1, amount: 1, status: 1 } },
    {
      $group: {
        _id: null,
        todayCollected: {
          $sum: {
            $cond: [
              { $in: [{ $toLower: { $convert: { input: { $ifNull: ['$direction', '$type'] }, to: 'string', onError: '', onNull: '' } } }, ['in', 'thu', 'receipt', 'income']] },
              numberExpression(['amount'], 0),
              0
            ]
          }
        },
        todayPaidOut: {
          $sum: {
            $cond: [
              { $in: [{ $toLower: { $convert: { input: { $ifNull: ['$direction', '$type'] }, to: 'string', onError: '', onNull: '' } } }, ['out', 'chi', 'payment', 'expense']] },
              numberExpression(['amount'], 0),
              0
            ]
          }
        }
      }
    }
  ]).option({ comment: 'dashboard.overview.cash-today' }).allowDiskUse(true).exec();
  const row = result?.[0] || {};
  return {
    todayCollected: normalizeMoney(row.todayCollected),
    todayPaidOut: normalizeMoney(row.todayPaidOut)
  };
}

async function getOverview({ month, force = false } = {}) {
  const range = parseMonth(month);
  const cacheKey = `overview:${range.period}:${range.today}`;
  const cacheVersion = await DashboardCacheService.freshnessVersion();
  if (!force) {
    const cached = DashboardCacheService.read(cacheKey, cacheVersion);
    if (cached && cached.meta?.source !== 'fallback-live-query') return { ...cached, cacheHit: true };
  }

  const targets = await SalesTargetService.listByPeriod(range.period);
  const readModel = await DashboardDailyStatsService.buildOverviewDashboard({ range, targets });
  if (readModel) {
    DashboardCacheService.write(cacheKey, cacheVersion, readModel);
    return readModel;
  }

  const startedAt = Date.now();
  const [confirmedSales, pendingSales, todaySales, returns, deliveryToday, cash] = await Promise.all([
    aggregateSalesRoot(range.dateFrom, range.dateTo, 'confirmed'),
    aggregateSalesRoot(range.dateFrom, range.dateTo, 'pending'),
    aggregateSalesRoot(range.today, range.today, 'active'),
    aggregateReturnsRoot(range.dateFrom, range.dateTo),
    aggregateDeliveryToday(range.today),
    aggregateCashToday(range.today)
  ]);

  const targetAmount = normalizeMoney(targets.reduce((sum, row) => sum + Number(row.targetAmount || 0), 0));
  const summary = {
    targetAmount,
    orderCount: confirmedSales.orderCount,
    salesAmount: confirmedSales.salesAmount,
    pendingOrderCount: pendingSales.orderCount,
    pendingSalesAmount: pendingSales.salesAmount,
    promotionValue: 0,
    returnCount: returns.returnCount,
    returnAmount: returns.returnAmount,
    netSalesAmount: Math.max(0, confirmedSales.salesAmount - returns.returnAmount),
    debtAmount: 0,
    todayOrderCount: todaySales.orderCount,
    todaySalesAmount: todaySales.salesAmount,
    totalSalesAmount: confirmedSales.salesAmount + pendingSales.salesAmount,
    achievementRate: calculateRate(Math.max(0, confirmedSales.salesAmount - returns.returnAmount), targetAmount),
    status: targetAmount > 0 ? 'overview' : 'no_target'
  };

  const result = {
    enabled: true,
    mode: 'overview',
    period: {
      month: range.period,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      today: range.today,
      timezone: dateUtil.VIETNAM_TIME_ZONE
    },
    overview: {
      date: range.today,
      sales: {
        todayRevenue: todaySales.salesAmount,
        todayOrderCount: todaySales.orderCount,
        monthRevenue: confirmedSales.salesAmount,
        monthOrderCount: confirmedSales.orderCount,
        pendingRevenue: pendingSales.salesAmount,
        pendingOrderCount: pendingSales.orderCount
      },
      delivery: {
        pendingCount: deliveryToday.pendingCount,
        deliveredCount: deliveryToday.deliveredCount,
        failedCount: deliveryToday.failedCount,
        assignedCount: deliveryToday.assignedCount,
        returnCount: returns.returnCount
      },
      accounting: {
        waitingConfirmCount: pendingSales.orderCount,
        confirmedCount: confirmedSales.orderCount
      },
      cash,
      alerts: []
    },
    summary,
    salesByStaff: null,
    deliveryMonth: null,
    deliveryToday: null,
    dataQuality: {
      warnings: ['Dashboard Phase37 đang hiển thị overview nhẹ; bảng chi tiết được tải riêng để tránh block màn đầu.']
    },
    sources: {
      sales: 'mongo:orders:root-summary',
      returns: 'mongo:returnOrders:root-summary',
      cash: 'mongo:fundLedgers:today-summary',
      dashboardStats: 'fallback-live-query',
      snapshot: false
    },
    metrics: {
      durationMs: Date.now() - startedAt,
      strategy: 'phase38-fallback-live-query'
    },
    meta: {
      source: 'fallback-live-query',
      reason: 'dashboardDailyStats_missing_or_incomplete'
    },
    generatedAt: new Date().toISOString(),
    cacheHit: false,
    cacheEnabled: DashboardCacheService.enabled()
  };
  DashboardCacheService.write(cacheKey, cacheVersion, result);
  return result;
}

module.exports = {
  getOverview,
  parseMonth,
  datePrefilter
};
