'use strict';

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const FundLedger = require('../src/models/FundLedger');
const SalesDashboardQuery = require('../src/services/dashboard/SalesDashboardQuery');
const DebtDashboardQuery = require('../src/services/dashboard/DebtDashboardQuery');
const DeliveryDashboardQuery = require('../src/services/dashboard/DeliveryDashboardQuery');
const HomeDashboardService = require('../src/services/dashboard/HomeDashboardService');
const DashboardDailyStatsService = require('../src/services/dashboard/DashboardDailyStatsService');
const dateUtil = require('../src/utils/date.util');

function argValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

function parseYmd(value) {
  const match = String(value || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function dateRange(from, to) {
  const start = parseYmd(from);
  const end = parseYmd(to);
  if (!start || !end || start > end) throw new Error('Ngày rebuild dashboardDailyStats không hợp lệ. Dùng --date=YYYY-MM-DD hoặc --from=YYYY-MM-DD --to=YYYY-MM-DD');
  const values = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end && values.length <= 370) {
    values.push(formatYmd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function sumRows(rows = [], field) {
  return rows.reduce((sum, row) => sum + normalizeMoney(row?.[field]), 0);
}

async function aggregateCashForDate(date) {
  const rows = await FundLedger.aggregate([
    {
      $match: {
        $and: [
          { isDeleted: { $ne: true }, deletedAt: { $in: [null, ''] } },
          { date: { $gte: date, $lte: date } }
        ]
      }
    },
    { $project: { direction: 1, type: 1, amount: 1 } },
    {
      $group: {
        _id: null,
        collectedAmount: {
          $sum: {
            $cond: [
              { $in: [{ $toLower: { $convert: { input: { $ifNull: ['$direction', '$type'] }, to: 'string', onError: '', onNull: '' } } }, ['in', 'thu', 'receipt', 'income']] },
              { $convert: { input: '$amount', to: 'double', onError: 0, onNull: 0 } },
              0
            ]
          }
        },
        paidOutAmount: {
          $sum: {
            $cond: [
              { $in: [{ $toLower: { $convert: { input: { $ifNull: ['$direction', '$type'] }, to: 'string', onError: '', onNull: '' } } }, ['out', 'chi', 'payment', 'expense']] },
              { $convert: { input: '$amount', to: 'double', onError: 0, onNull: 0 } },
              0
            ]
          }
        }
      }
    }
  ]).option({ comment: 'dashboardDailyStats.rebuild.cash' }).allowDiskUse(true).exec();
  const row = rows?.[0] || {};
  return {
    collectedAmount: normalizeMoney(row.collectedAmount),
    paidOutAmount: normalizeMoney(row.paidOutAmount)
  };
}

function deliveryTotals(rows = []) {
  return {
    assignedCount: sumRows(rows, 'assignedOrders'),
    deliveredCount: sumRows(rows, 'deliveredOrders'),
    deliveringCount: sumRows(rows, 'deliveringOrders'),
    pendingCount: sumRows(rows, 'pendingOrders'),
    failedCount: sumRows(rows, 'failedOrders'),
    assignedAmount: sumRows(rows, 'assignedAmount'),
    deliveredAmount: sumRows(rows, 'deliveredAmount'),
    returnAmount: sumRows(rows, 'returnAmount')
  };
}

async function rebuildDate(date) {
  const activeStaff = await HomeDashboardService.listActiveStaff();
  const [confirmedSales, pendingSales, activeSales, returns, cash, deliveryRaw, deliveryReturns] = await Promise.all([
    SalesDashboardQuery.aggregateSales(date, date, { accountingScope: 'confirmed' }),
    SalesDashboardQuery.aggregateSales(date, date, { accountingScope: 'pending' }),
    SalesDashboardQuery.aggregateSales(date, date, { accountingScope: 'active' }),
    SalesDashboardQuery.aggregateReturns(date, date),
    aggregateCashForDate(date),
    DeliveryDashboardQuery.aggregateDeliveryToday(date),
    DeliveryDashboardQuery.aggregateDeliveryReturns(date, date)
  ]);

  const today = dateUtil.todayVN();
  const debtResult = date === today
    ? await DebtDashboardQuery.aggregateCurrentDebt()
    : { rows: [], totals: { debtAmount: 0 }, source: 'not_rebuilt_for_past_date' };

  const salesRows = HomeDashboardService.mergeSalesRows({
    activeStaff: activeStaff.sales,
    targets: [],
    monthlySales: confirmedSales.rows,
    monthlyPendingSales: pendingSales.rows,
    monthlyReturns: returns.rows,
    currentDebt: debtResult.rows,
    todaySales: activeSales.rows
  });
  const deliveryRows = HomeDashboardService.mergeDeliveryRows(activeStaff.delivery, deliveryRaw.rows, deliveryReturns);
  const delivery = deliveryTotals(deliveryRows);

  const stat = {
    date,
    month: date.slice(0, 7),
    sales: {
      orderCount: normalizeMoney(confirmedSales.totals?.orderCount),
      revenue: normalizeMoney(confirmedSales.totals?.salesAmount),
      netRevenue: Math.max(0, normalizeMoney(confirmedSales.totals?.salesAmount) - normalizeMoney(returns.totals?.returnAmount)),
      pendingOrderCount: normalizeMoney(pendingSales.totals?.orderCount),
      pendingRevenue: normalizeMoney(pendingSales.totals?.salesAmount),
      activeOrderCount: normalizeMoney(activeSales.totals?.orderCount),
      activeRevenue: normalizeMoney(activeSales.totals?.salesAmount),
      promotionValue: normalizeMoney(confirmedSales.totals?.promotionValue),
      debtAmount: normalizeMoney(debtResult.totals?.debtAmount),
      cancelledCount: 0
    },
    delivery: {
      ...delivery,
      waitingAccountingCount: normalizeMoney(pendingSales.totals?.orderCount),
      returnCount: normalizeMoney(returns.totals?.returnCount)
    },
    cash,
    returns: {
      returnOrderCount: normalizeMoney(returns.totals?.returnCount),
      returnAmount: normalizeMoney(returns.totals?.returnAmount)
    },
    staff: {
      sales: salesRows,
      delivery: deliveryRows
    },
    dataQuality: {
      sales: confirmedSales.dataQuality || {},
      pendingSales: pendingSales.dataQuality || {},
      activeSales: activeSales.dataQuality || {},
      returns: returns.dataQuality || {},
      debtSource: debtResult.source || ''
    },
    source: 'rebuild',
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const saved = await DashboardDailyStatsService.upsertDailyStat(stat);
  console.log(JSON.stringify({
    date,
    sales: stat.sales,
    delivery: stat.delivery,
    returns: stat.returns,
    cash: stat.cash,
    salesStaffRows: salesRows.length,
    deliveryStaffRows: deliveryRows.length,
    updatedAt: saved.updatedAt
  }));
  return saved;
}

async function main() {
  const singleDate = argValue('date');
  const from = argValue('from');
  const to = argValue('to');
  const dates = singleDate ? dateRange(singleDate, singleDate) : dateRange(from, to);
  await connectDB();
  for (const date of dates) {
    await rebuildDate(date);
  }
}

main().catch((error) => {
  console.error('❌ Không rebuild được dashboardDailyStats:', error);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState) await mongoose.disconnect();
});
