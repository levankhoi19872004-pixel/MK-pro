'use strict';

const DashboardDailyStat = require('../../models/DashboardDailyStat');
const SalesTargetService = require('./SalesTargetService');
const DashboardCacheService = require('./DashboardCacheService');
const dateUtil = require('../../utils/date.util');

function text(value) {
  return String(value || '').trim();
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
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

function resolveTargetStatus(rate, targetAmount = 0) {
  if (Number(targetAmount || 0) <= 0) return 'no_target';
  if (Number(rate || 0) >= 100) return 'achieved';
  if (Number(rate || 0) >= 80) return 'near_target';
  return 'below_target';
}

function parseYmd(value) {
  const match = text(value).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function minYmd(left, right) {
  return text(left) <= text(right) ? text(left) : text(right);
}

function enumerateDates(dateFrom, dateTo, today = dateUtil.todayVN()) {
  const from = parseYmd(dateFrom);
  const rawTo = minYmd(dateTo, today);
  const to = parseYmd(rawTo);
  if (!from || !to || from > to) return [];
  const values = [];
  const cursor = new Date(from.getTime());
  while (cursor <= to && values.length <= 370) {
    values.push(formatYmd(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return values;
}

function latestUpdatedAt(docs = []) {
  return docs.reduce((latest, doc) => {
    const candidate = text(doc.updatedAt || doc.generatedAt);
    return candidate && candidate > latest ? candidate : latest;
  }, '');
}

async function listCompleteRange({ dateFrom, dateTo, today }) {
  const expectedDates = enumerateDates(dateFrom, dateTo, today);
  if (!expectedDates.length) return null;
  const docs = await DashboardDailyStat.find({
    date: { $gte: expectedDates[0], $lte: expectedDates[expectedDates.length - 1] }
  }).select({
    date: 1,
    month: 1,
    sales: 1,
    delivery: 1,
    cash: 1,
    returns: 1,
    staff: 1,
    dataQuality: 1,
    source: 1,
    generatedAt: 1,
    updatedAt: 1
  }).sort({ date: 1 }).lean();

  const byDate = new Map(docs.map((doc) => [text(doc.date), doc]));
  const missingDates = expectedDates.filter((date) => !byDate.has(date));
  if (missingDates.length) {
    return { complete: false, expectedDates, missingDates, docs };
  }
  return { complete: true, expectedDates, missingDates: [], docs };
}

async function readDaily(date) {
  const key = text(date).slice(0, 10);
  if (!key) return null;
  return DashboardDailyStat.findOne({ date: key }).lean();
}

async function upsertDailyStat(stat = {}) {
  const date = text(stat.date).slice(0, 10);
  if (!date) throw new Error('DashboardDailyStat.date is required');
  const month = text(stat.month || date.slice(0, 7));
  const now = new Date().toISOString();
  const payload = {
    tenantId: text(stat.tenantId),
    date,
    month,
    sales: stat.sales || {},
    delivery: stat.delivery || {},
    cash: stat.cash || {},
    returns: stat.returns || {},
    staff: stat.staff || { sales: [], delivery: [] },
    dataQuality: stat.dataQuality || {},
    source: text(stat.source || 'rebuild'),
    generatedAt: text(stat.generatedAt || now),
    updatedAt: text(stat.updatedAt || now)
  };
  return DashboardDailyStat.findOneAndUpdate(
    { date },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

function sumDocValue(docs, section, fields = []) {
  return docs.reduce((sum, doc) => {
    const source = doc?.[section] || {};
    const value = fields.reduce((result, field) => result || source[field], 0);
    return sum + normalizeMoney(value);
  }, 0);
}

function salesStaffKey(row = {}) {
  const code = text(row.salesStaffCode || row.staffCode || row.code);
  if (code) return `code:${code}`;
  return `name:${text(row.salesStaffName || row.staffName || row.name).toLowerCase()}`;
}

function deliveryStaffKey(row = {}) {
  const code = text(row.deliveryStaffCode || row.staffCode || row.code);
  if (code) return `code:${code}`;
  return `name:${text(row.deliveryStaffName || row.staffName || row.name).toLowerCase()}`;
}

function addMoney(target, field, value) {
  target[field] = normalizeMoney(target[field]) + normalizeMoney(value);
}

function targetMap(targets = []) {
  const map = new Map();
  targets.forEach((target) => {
    const code = text(target.salesStaffCode || target.staffCode || target.code);
    if (code) map.set(`code:${code}`, target);
    const name = text(target.salesStaffName || target.staffName || target.name).toLowerCase();
    if (name && !map.has(`name:${name}`)) map.set(`name:${name}`, target);
  });
  return map;
}

function combineSalesStaff(docs = [], todayDoc = null, targets = []) {
  const rows = new Map();
  const ensure = (source = {}) => {
    const key = salesStaffKey(source);
    if (!key || key === 'name:') return null;
    if (!rows.has(key)) {
      rows.set(key, {
        salesStaffCode: text(source.salesStaffCode || source.staffCode || source.code),
        salesStaffName: text(source.salesStaffName || source.staffName || source.name),
        targetAmount: 0,
        orderCount: 0,
        salesAmount: 0,
        pendingOrderCount: 0,
        pendingSalesAmount: 0,
        totalSalesAmount: 0,
        promotionValue: 0,
        returnCount: 0,
        returnAmount: 0,
        netSalesAmount: 0,
        debtAmount: 0,
        todayOrderCount: 0,
        todaySalesAmount: 0,
        achievementRate: 0,
        status: 'no_target'
      });
    }
    return rows.get(key);
  };

  docs.forEach((doc) => {
    const isTodayDoc = todayDoc && text(doc.date) === text(todayDoc.date);
    const salesRows = Array.isArray(doc?.staff?.sales) ? doc.staff.sales : [];
    salesRows.forEach((source) => {
      const row = ensure(source);
      if (!row) return;
      addMoney(row, 'orderCount', source.orderCount);
      addMoney(row, 'salesAmount', source.salesAmount ?? source.revenue);
      addMoney(row, 'pendingOrderCount', source.pendingOrderCount);
      addMoney(row, 'pendingSalesAmount', source.pendingSalesAmount ?? source.pendingRevenue);
      addMoney(row, 'promotionValue', source.promotionValue);
      addMoney(row, 'returnCount', source.returnCount);
      addMoney(row, 'returnAmount', source.returnAmount);
      if (isTodayDoc) {
        row.todayOrderCount = normalizeMoney(source.todayOrderCount ?? source.activeOrderCount ?? source.orderCount);
        row.todaySalesAmount = normalizeMoney(source.todaySalesAmount ?? source.activeRevenue ?? source.salesAmount ?? source.revenue);
      }
      if (isTodayDoc || normalizeMoney(source.debtAmount) > 0) {
        row.debtAmount = normalizeMoney(source.debtAmount);
      }
    });
  });

  const targetsByKey = targetMap(targets);
  targets.forEach((target) => ensure({ salesStaffCode: target.salesStaffCode, salesStaffName: target.salesStaffName }));
  rows.forEach((row, key) => {
    const target = targetsByKey.get(key) || targetsByKey.get(`code:${row.salesStaffCode}`) || targetsByKey.get(`name:${text(row.salesStaffName).toLowerCase()}`);
    row.targetAmount = normalizeMoney(target?.targetAmount || row.targetAmount);
    row.totalSalesAmount = normalizeMoney(row.salesAmount) + normalizeMoney(row.pendingSalesAmount);
    row.netSalesAmount = normalizeMoney(row.salesAmount) - normalizeMoney(row.returnAmount);
    row.achievementRate = calculateRate(row.netSalesAmount, row.targetAmount);
    row.status = resolveTargetStatus(row.achievementRate, row.targetAmount);
  });

  return Array.from(rows.values()).sort((left, right) => text(left.salesStaffName || left.salesStaffCode).localeCompare(text(right.salesStaffName || right.salesStaffCode), 'vi'));
}

function combineDeliveryStaff(docs = []) {
  const rows = new Map();
  const ensure = (source = {}) => {
    const key = deliveryStaffKey(source);
    if (!key || key === 'name:') return null;
    if (!rows.has(key)) {
      rows.set(key, {
        deliveryStaffCode: text(source.deliveryStaffCode || source.staffCode || source.code),
        deliveryStaffName: text(source.deliveryStaffName || source.staffName || source.name),
        tripCount: 0,
        salesStaffCount: 0,
        assignedOrders: 0,
        deliveredOrders: 0,
        deliveringOrders: 0,
        pendingOrders: 0,
        failedOrders: 0,
        assignedAmount: 0,
        deliveredAmount: 0,
        returnAmount: 0,
        completionRate: 0
      });
    }
    return rows.get(key);
  };
  docs.forEach((doc) => {
    const deliveryRows = Array.isArray(doc?.staff?.delivery) ? doc.staff.delivery : [];
    deliveryRows.forEach((source) => {
      const row = ensure(source);
      if (!row) return;
      addMoney(row, 'tripCount', source.tripCount);
      row.salesStaffCount = Math.max(normalizeMoney(row.salesStaffCount), normalizeMoney(source.salesStaffCount));
      addMoney(row, 'assignedOrders', source.assignedOrders ?? source.assignedCount);
      addMoney(row, 'deliveredOrders', source.deliveredOrders ?? source.deliveredCount);
      addMoney(row, 'deliveringOrders', source.deliveringOrders ?? source.deliveringCount);
      addMoney(row, 'pendingOrders', source.pendingOrders ?? source.pendingCount);
      addMoney(row, 'failedOrders', source.failedOrders ?? source.failedCount);
      addMoney(row, 'assignedAmount', source.assignedAmount);
      addMoney(row, 'deliveredAmount', source.deliveredAmount);
      addMoney(row, 'returnAmount', source.returnAmount);
    });
  });
  rows.forEach((row) => {
    row.completionRate = calculateRate(row.deliveredOrders, row.assignedOrders);
  });
  return Array.from(rows.values()).sort((left, right) => normalizeMoney(right.assignedOrders) - normalizeMoney(left.assignedOrders) || text(left.deliveryStaffName || left.deliveryStaffCode).localeCompare(text(right.deliveryStaffName || right.deliveryStaffCode), 'vi'));
}

function buildSummary({ docs = [], todayDoc = null, salesByStaff = [], targets = [] }) {
  const targetAmount = normalizeMoney(targets.reduce((sum, row) => sum + Number(row.targetAmount || 0), 0));
  const salesAmount = sumDocValue(docs, 'sales', ['revenue', 'salesAmount']);
  const pendingSalesAmount = sumDocValue(docs, 'sales', ['pendingRevenue', 'pendingSalesAmount']);
  const returnAmount = sumDocValue(docs, 'returns', ['returnAmount']);
  const orderCount = sumDocValue(docs, 'sales', ['orderCount']);
  const pendingOrderCount = sumDocValue(docs, 'sales', ['pendingOrderCount']);
  const todaySalesAmount = normalizeMoney(todayDoc?.sales?.activeRevenue ?? todayDoc?.sales?.todaySalesAmount ?? todayDoc?.sales?.revenue);
  const todayOrderCount = normalizeMoney(todayDoc?.sales?.activeOrderCount ?? todayDoc?.sales?.todayOrderCount ?? todayDoc?.sales?.orderCount);
  const promotionValue = sumDocValue(docs, 'sales', ['promotionValue']);
  const debtAmount = salesByStaff.reduce((sum, row) => sum + normalizeMoney(row.debtAmount), 0);
  const netSalesAmount = salesAmount - returnAmount;
  return {
    targetAmount,
    orderCount,
    salesAmount,
    pendingOrderCount,
    pendingSalesAmount,
    totalSalesAmount: salesAmount + pendingSalesAmount,
    promotionValue,
    returnAmount,
    netSalesAmount,
    debtAmount,
    todayOrderCount,
    todaySalesAmount,
    achievementRate: calculateRate(netSalesAmount, targetAmount),
    status: resolveTargetStatus(calculateRate(netSalesAmount, targetAmount), targetAmount)
  };
}

function readModelMeta(rangeInfo = {}) {
  return {
    source: 'dashboardDailyStats',
    updatedAt: latestUpdatedAt(rangeInfo.docs || []),
    expectedDates: rangeInfo.expectedDates || [],
    missingDates: []
  };
}

function fallbackMeta(rangeInfo = {}) {
  return {
    source: 'fallback-live-query',
    expectedDates: rangeInfo.expectedDates || [],
    missingDates: rangeInfo.missingDates || [],
    reason: 'dashboardDailyStats_missing_or_incomplete'
  };
}

async function buildOverviewDashboard({ range, targets = [] }) {
  const rangeInfo = await listCompleteRange({ dateFrom: range.dateFrom, dateTo: range.dateTo, today: range.today });
  if (!rangeInfo?.complete) return null;
  const docs = rangeInfo.docs || [];
  const todayDoc = docs.find((doc) => text(doc.date) === text(range.today)) || docs[docs.length - 1] || null;
  const salesByStaff = combineSalesStaff(docs, todayDoc, targets);
  const summary = buildSummary({ docs, todayDoc, salesByStaff, targets });
  const meta = readModelMeta(rangeInfo);
  return {
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
        todayRevenue: summary.todaySalesAmount,
        todayOrderCount: summary.todayOrderCount,
        monthRevenue: summary.salesAmount,
        monthOrderCount: summary.orderCount,
        pendingRevenue: summary.pendingSalesAmount,
        pendingOrderCount: summary.pendingOrderCount
      },
      delivery: {
        pendingCount: normalizeMoney(todayDoc?.delivery?.pendingCount),
        deliveredCount: normalizeMoney(todayDoc?.delivery?.deliveredCount),
        failedCount: normalizeMoney(todayDoc?.delivery?.failedCount),
        assignedCount: normalizeMoney(todayDoc?.delivery?.assignedCount),
        returnCount: normalizeMoney(todayDoc?.returns?.returnOrderCount)
      },
      accounting: {
        waitingConfirmCount: summary.pendingOrderCount,
        confirmedCount: summary.orderCount
      },
      cash: {
        todayCollected: normalizeMoney(todayDoc?.cash?.collectedAmount ?? todayDoc?.cash?.todayCollected),
        todayPaidOut: normalizeMoney(todayDoc?.cash?.paidOutAmount ?? todayDoc?.cash?.todayPaidOut)
      },
      alerts: []
    },
    summary,
    salesByStaff: null,
    deliveryMonth: null,
    deliveryToday: null,
    dataQuality: {
      warnings: [],
      readModel: meta
    },
    sources: {
      dashboardStats: 'dashboardDailyStats',
      snapshot: false
    },
    metrics: {
      strategy: 'phase38-read-model',
      readModelDateCount: docs.length
    },
    meta,
    generatedAt: new Date().toISOString(),
    cacheHit: false,
    cacheEnabled: DashboardCacheService.enabled()
  };
}

async function buildSalesStaffDashboard({ range, targets = [] }) {
  const rangeInfo = await listCompleteRange({ dateFrom: range.dateFrom, dateTo: range.dateTo, today: range.today });
  if (!rangeInfo?.complete) return null;
  const docs = rangeInfo.docs || [];
  const todayDoc = docs.find((doc) => text(doc.date) === text(range.today)) || docs[docs.length - 1] || null;
  const salesByStaff = combineSalesStaff(docs, todayDoc, targets);
  const summary = buildSummary({ docs, todayDoc, salesByStaff, targets });
  const meta = readModelMeta(rangeInfo);
  return {
    enabled: true,
    mode: 'sales-staff',
    period: {
      month: range.period,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      today: range.today,
      timezone: dateUtil.VIETNAM_TIME_ZONE
    },
    summary,
    salesByStaff,
    dataQuality: { warnings: [], readModel: meta },
    sources: { dashboardStats: 'dashboardDailyStats', snapshot: false },
    metrics: { strategy: 'phase38-read-model', readModelDateCount: docs.length },
    meta,
    generatedAt: new Date().toISOString(),
    cacheHit: false,
    cacheEnabled: DashboardCacheService.enabled()
  };
}

async function buildDeliveryDashboard({ range }) {
  const rangeInfo = await listCompleteRange({ dateFrom: range.dateFrom, dateTo: range.dateTo, today: range.today });
  if (!rangeInfo?.complete) return null;
  const docs = rangeInfo.docs || [];
  const todayDoc = docs.find((doc) => text(doc.date) === text(range.today)) || docs[docs.length - 1] || null;
  const deliveryMonth = combineDeliveryStaff(docs);
  const deliveryToday = combineDeliveryStaff(todayDoc ? [todayDoc] : []);
  const meta = readModelMeta(rangeInfo);
  return {
    enabled: true,
    mode: 'delivery-summary',
    period: {
      month: range.period,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      today: range.today,
      timezone: dateUtil.VIETNAM_TIME_ZONE
    },
    deliveryMonth,
    deliveryToday,
    sources: { dashboardStats: 'dashboardDailyStats', snapshot: false },
    metrics: { strategy: 'phase38-read-model', readModelDateCount: docs.length },
    meta,
    generatedAt: new Date().toISOString(),
    cacheHit: false,
    cacheEnabled: DashboardCacheService.enabled()
  };
}

module.exports = {
  readDaily,
  upsertDailyStat,
  listCompleteRange,
  buildOverviewDashboard,
  buildSalesStaffDashboard,
  buildDeliveryDashboard,
  fallbackMeta,
  combineSalesStaff,
  combineDeliveryStaff,
  enumerateDates
};
