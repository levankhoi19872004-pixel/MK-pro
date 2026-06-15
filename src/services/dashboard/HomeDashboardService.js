'use strict';

const User = require('../../models/User');
const dateUtil = require('../../utils/date.util');
const { DEBT_ZERO_TOLERANCE } = require('../../constants/finance.constants');
const SalesTargetService = require('./SalesTargetService');
const SalesDashboardQuery = require('./SalesDashboardQuery');
const DebtDashboardQuery = require('./DebtDashboardQuery');
const DeliveryDashboardQuery = require('./DeliveryDashboardQuery');
const DashboardCacheService = require('./DashboardCacheService');
const { firstValidDateExpression } = require('./DashboardMongoExpressions');

const DELIVERED_STATUSES = DeliveryDashboardQuery.DELIVERED_STATUSES;
const FAILED_DELIVERY_STATUSES = DeliveryDashboardQuery.FAILED_DELIVERY_STATUSES;
const DELIVERING_STATUSES = DeliveryDashboardQuery.DELIVERING_STATUSES;
const CACHE_TTL_MS = DashboardCacheService.CACHE_TTL_MS;

function dashboardEnabled() {
  return String(process.env.FEATURE_HOME_DASHBOARD ?? 'true').trim().toLowerCase() !== 'false';
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
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

function resolveDeliveryBucket(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (DELIVERED_STATUSES.includes(normalized)) return 'delivered';
  if (FAILED_DELIVERY_STATUSES.includes(normalized)) return 'failed';
  if (DELIVERING_STATUSES.includes(normalized)) return 'delivering';
  return 'pending';
}

function parseMonth(month) {
  const period = SalesTargetService.assertPeriod(month || dateUtil.todayVN().slice(0, 7));
  const [year, monthNumber] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const dateFrom = `${period}-01`;
  const dateTo = `${period}-${String(lastDay).padStart(2, '0')}`;
  return {
    period,
    dateFrom,
    dateTo,
    from: `${dateFrom}T00:00:00+07:00`,
    toExclusive: new Date(Date.UTC(year, monthNumber, 1)).toISOString()
  };
}

/**
 * Tương thích export cũ. Bộ lọc mới chọn đúng field ngày ưu tiên rồi mới
 * fallback createdAt; không dùng $or giữa ngày nghiệp vụ và createdAt.
 */
function buildDateRangeFilter(dateFrom, dateTo, fields = []) {
  const businessDate = firstValidDateExpression(fields, 'createdAt');
  return {
    $expr: {
      $and: [
        { $gte: [businessDate, dateFrom] },
        { $lte: [businessDate, dateTo] }
      ]
    }
  };
}

function userCode(user = {}, type = 'sales') {
  if (type === 'delivery') {
    return String(user.deliveryStaffCode || user.staffCode || user.employeeCode || user.code || '').trim();
  }
  return SalesTargetService.userStaffCode(user);
}

function userName(user = {}, type = 'sales') {
  if (type === 'delivery') {
    return String(user.deliveryStaffName || user.fullName || user.name || '').trim();
  }
  return SalesTargetService.userStaffName(user);
}

async function listActiveStaff() {
  const users = await User.find({
    role: { $in: ['sales', 'delivery'] },
    isActive: { $ne: false }
  }).select({
    username: 1,
    fullName: 1,
    name: 1,
    code: 1,
    staffCode: 1,
    employeeCode: 1,
    salesStaffCode: 1,
    salesStaffName: 1,
    deliveryStaffCode: 1,
    deliveryStaffName: 1,
    role: 1
  }).lean();

  return {
    sales: users
      .filter((user) => user.role === 'sales')
      .map((user) => ({ salesStaffCode: userCode(user, 'sales'), salesStaffName: userName(user, 'sales') }))
      .filter((user) => user.salesStaffCode || user.salesStaffName),
    delivery: users
      .filter((user) => user.role === 'delivery')
      .map((user) => ({ deliveryStaffCode: userCode(user, 'delivery'), deliveryStaffName: userName(user, 'delivery') }))
      .filter((user) => user.deliveryStaffCode || user.deliveryStaffName)
  };
}

function staffKey(code, name) {
  const normalizedCode = String(code || '').trim();
  if (normalizedCode) return `code:${normalizedCode}`;
  return `name:${String(name || '').trim().toLowerCase()}`;
}

function normalizeStaffIdentity(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildStaffIndex(activeStaff = [], type = 'sales') {
  const byCode = new Map();
  const nameCandidates = new Map();
  const codeField = type === 'delivery' ? 'deliveryStaffCode' : 'salesStaffCode';
  const nameField = type === 'delivery' ? 'deliveryStaffName' : 'salesStaffName';

  for (const source of activeStaff) {
    const code = String(source?.[codeField] || '').trim();
    const name = String(source?.[nameField] || '').trim();
    if (!code && !name) continue;
    const canonical = { [codeField]: code, [nameField]: name };
    const normalizedCode = normalizeStaffIdentity(code);
    const normalizedName = normalizeStaffIdentity(name);
    if (normalizedCode) byCode.set(normalizedCode, canonical);
    if (normalizedName) {
      const candidates = nameCandidates.get(normalizedName) || [];
      candidates.push(canonical);
      nameCandidates.set(normalizedName, candidates);
    }
  }

  const byUniqueName = new Map();
  for (const [name, candidates] of nameCandidates.entries()) {
    if (candidates.length === 1) byUniqueName.set(name, candidates[0]);
  }
  return { byCode, byUniqueName, codeField, nameField };
}

function buildSalesStaffIndex(activeStaff = []) {
  return buildStaffIndex(activeStaff, 'sales');
}

function resolveCanonicalStaff(source = {}, staffIndex = {}) {
  const code = String(source?.[staffIndex.codeField] || '').trim();
  const name = String(source?.[staffIndex.nameField] || '').trim();
  if (code) return staffIndex.byCode?.get(normalizeStaffIdentity(code)) || null;
  if (name) return staffIndex.byUniqueName?.get(normalizeStaffIdentity(name)) || null;
  return null;
}

function resolveCanonicalSalesStaff(source = {}, staffIndex = {}) {
  const normalizedIndex = staffIndex.codeField ? staffIndex : {
    ...staffIndex,
    codeField: 'salesStaffCode',
    nameField: 'salesStaffName'
  };
  return resolveCanonicalStaff(source, normalizedIndex);
}

function resolveCanonicalDeliveryStaff(source = {}, staffIndex = {}) {
  const normalizedIndex = staffIndex.codeField ? staffIndex : {
    ...staffIndex,
    codeField: 'deliveryStaffCode',
    nameField: 'deliveryStaffName'
  };
  return resolveCanonicalStaff(source, normalizedIndex);
}

function mergeSalesRows({ activeStaff = [], targets = [], monthlySales = [], monthlyReturns = [], currentDebt = [], todaySales = [] }) {
  const rows = new Map();
  const staffIndex = buildSalesStaffIndex(activeStaff);
  const ensureCanonical = (source = {}) => {
    const code = String(source.salesStaffCode || '').trim();
    const name = String(source.salesStaffName || '').trim();
    const key = staffKey(code, name);
    if (!code && !name) return null;
    if (!rows.has(key)) {
      rows.set(key, {
        salesStaffCode: code,
        salesStaffName: name,
        targetAmount: 0,
        orderCount: 0,
        salesAmount: 0,
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
  const resolveRow = (source = {}) => {
    const canonical = resolveCanonicalSalesStaff(source, staffIndex);
    return canonical ? ensureCanonical(canonical) : null;
  };

  activeStaff.forEach(ensureCanonical);
  targets.forEach((source) => {
    const row = resolveRow(source);
    if (row) row.targetAmount = normalizeMoney(source.targetAmount);
  });
  monthlySales.forEach((source) => {
    const row = resolveRow(source);
    if (!row) return;
    row.orderCount += normalizeMoney(source.orderCount);
    row.salesAmount += normalizeMoney(source.salesAmount);
  });
  monthlyReturns.forEach((source) => {
    const row = resolveRow(source);
    if (!row) return;
    row.returnCount += normalizeMoney(source.returnCount);
    row.returnAmount += normalizeMoney(source.returnAmount);
  });
  currentDebt.forEach((source) => {
    const row = resolveRow(source);
    if (row) row.debtAmount += normalizeMoney(source.debtAmount);
  });
  todaySales.forEach((source) => {
    const row = resolveRow(source);
    if (!row) return;
    row.todayOrderCount += normalizeMoney(source.orderCount);
    row.todaySalesAmount += normalizeMoney(source.salesAmount);
  });

  return Array.from(rows.values()).map((row) => {
    row.netSalesAmount = row.salesAmount - row.returnAmount;
    row.achievementRate = calculateRate(row.netSalesAmount, row.targetAmount);
    row.status = resolveTargetStatus(row.achievementRate, row.targetAmount);
    return row;
  }).sort((left, right) => String(left.salesStaffName || left.salesStaffCode).localeCompare(String(right.salesStaffName || right.salesStaffCode), 'vi'));
}

function mergeDeliveryRows(activeStaff = [], deliveryRows = [], returnRows = []) {
  const rows = new Map();
  const staffIndex = buildStaffIndex(activeStaff, 'delivery');
  const ensureCanonical = (source = {}) => {
    const code = String(source.deliveryStaffCode || '').trim();
    const name = String(source.deliveryStaffName || '').trim();
    if (!code && !name) return null;
    const key = staffKey(code, name);
    if (!rows.has(key)) {
      rows.set(key, {
        deliveryStaffCode: code,
        deliveryStaffName: name,
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
  const resolveRow = (source = {}) => {
    const canonical = resolveCanonicalDeliveryStaff(source, staffIndex);
    return canonical ? ensureCanonical(canonical) : null;
  };

  activeStaff.forEach(ensureCanonical);
  deliveryRows.forEach((source) => {
    const row = resolveRow(source);
    if (!row) return;
    row.tripCount += normalizeMoney(source.tripCount);
    row.salesStaffCount = Math.max(row.salesStaffCount, normalizeMoney(source.salesStaffCount));
    row.assignedOrders += normalizeMoney(source.assignedOrders);
    row.deliveredOrders += normalizeMoney(source.deliveredOrders);
    row.deliveringOrders += normalizeMoney(source.deliveringOrders);
    row.pendingOrders += normalizeMoney(source.pendingOrders);
    row.failedOrders += normalizeMoney(source.failedOrders);
    row.assignedAmount += normalizeMoney(source.assignedAmount);
    row.deliveredAmount += normalizeMoney(source.deliveredAmount);
    row.returnAmount += normalizeMoney(source.returnAmount);
  });
  returnRows.forEach((source) => {
    const row = resolveRow(source);
    if (row) row.returnAmount += normalizeMoney(source.returnAmount);
  });

  return Array.from(rows.values()).map((row) => {
    row.completionRate = calculateRate(row.deliveredOrders, row.assignedOrders);
    return row;
  }).sort((left, right) => right.assignedOrders - left.assignedOrders || String(left.deliveryStaffName || left.deliveryStaffCode).localeCompare(String(right.deliveryStaffName || right.deliveryStaffCode), 'vi'));
}

function unresolvedMetric(rows = [], staffIndex, type, options = {}) {
  const countField = options.countField || '';
  const amountField = options.amountField || '';
  const unresolved = rows.filter((row) => {
    return type === 'delivery'
      ? !resolveCanonicalDeliveryStaff(row, staffIndex)
      : !resolveCanonicalSalesStaff(row, staffIndex);
  });
  return {
    rowCount: unresolved.length,
    documentCount: unresolved.reduce((sum, row) => sum + normalizeMoney(row[countField]), 0),
    amount: unresolved.reduce((sum, row) => sum + normalizeMoney(row[amountField]), 0),
    identities: unresolved.slice(0, 20).map((row) => ({
      code: String(row[staffIndex.codeField] || '').trim(),
      name: String(row[staffIndex.nameField] || '').trim()
    }))
  };
}

function buildDataQuality({ activeStaff, monthlySales, todaySales, monthlyReturns, currentDebt, deliveryMonthRaw, deliveryTodayRaw }) {
  const salesIndex = buildSalesStaffIndex(activeStaff.sales);
  const deliveryIndex = buildStaffIndex(activeStaff.delivery, 'delivery');
  const unmapped = {
    monthlySales: unresolvedMetric(monthlySales, salesIndex, 'sales', { countField: 'orderCount', amountField: 'salesAmount' }),
    todaySales: unresolvedMetric(todaySales, salesIndex, 'sales', { countField: 'orderCount', amountField: 'salesAmount' }),
    monthlyReturns: unresolvedMetric(monthlyReturns, salesIndex, 'sales', { countField: 'returnCount', amountField: 'returnAmount' }),
    currentDebt: unresolvedMetric(currentDebt, salesIndex, 'sales', { countField: 'debtDocumentCount', amountField: 'debtAmount' }),
    deliveryMonth: unresolvedMetric(deliveryMonthRaw, deliveryIndex, 'delivery', { countField: 'assignedOrders', amountField: 'assignedAmount' }),
    deliveryToday: unresolvedMetric(deliveryTodayRaw, deliveryIndex, 'delivery', { countField: 'assignedOrders', amountField: 'assignedAmount' })
  };
  const warnings = [];
  if (unmapped.monthlySales.documentCount > 0) warnings.push(`${unmapped.monthlySales.documentCount} đơn bán tháng chưa map được NVBH`);
  if (unmapped.todaySales.documentCount > 0) warnings.push(`${unmapped.todaySales.documentCount} đơn hôm nay chưa map được NVBH`);
  if (unmapped.monthlyReturns.documentCount > 0) warnings.push(`${unmapped.monthlyReturns.documentCount} phiếu trả chưa map được NVBH`);
  if (unmapped.currentDebt.amount > 0) warnings.push(`Có ${unmapped.currentDebt.amount} đồng công nợ chưa map được NVBH`);
  if (unmapped.deliveryMonth.documentCount > 0) warnings.push(`${unmapped.deliveryMonth.documentCount} đơn giao tháng chưa map được NVGH`);
  if (unmapped.deliveryToday.documentCount > 0) warnings.push(`${unmapped.deliveryToday.documentCount} đơn giao hôm nay chưa map được NVGH`);
  return { unmapped, warnings };
}

function buildSummary(salesByStaff = [], canonicalTotals = {}) {
  const staffTotals = salesByStaff.reduce((result, row) => {
    result.targetAmount += normalizeMoney(row.targetAmount);
    result.orderCount += normalizeMoney(row.orderCount);
    result.salesAmount += normalizeMoney(row.salesAmount);
    result.returnAmount += normalizeMoney(row.returnAmount);
    result.netSalesAmount += normalizeMoney(row.netSalesAmount);
    result.debtAmount += normalizeMoney(row.debtAmount);
    result.todayOrderCount += normalizeMoney(row.todayOrderCount);
    result.todaySalesAmount += normalizeMoney(row.todaySalesAmount);
    return result;
  }, {
    targetAmount: 0,
    orderCount: 0,
    salesAmount: 0,
    returnAmount: 0,
    netSalesAmount: 0,
    debtAmount: 0,
    todayOrderCount: 0,
    todaySalesAmount: 0,
    achievementRate: 0
  });

  const summary = {
    ...staffTotals,
    orderCount: canonicalTotals.sales?.orderCount ?? staffTotals.orderCount,
    salesAmount: canonicalTotals.sales?.salesAmount ?? staffTotals.salesAmount,
    returnAmount: canonicalTotals.returns?.returnAmount ?? staffTotals.returnAmount,
    debtAmount: canonicalTotals.debt?.debtAmount ?? staffTotals.debtAmount,
    todayOrderCount: canonicalTotals.todaySales?.orderCount ?? staffTotals.todayOrderCount,
    todaySalesAmount: canonicalTotals.todaySales?.salesAmount ?? staffTotals.todaySalesAmount
  };
  summary.netSalesAmount = summary.salesAmount - summary.returnAmount;
  summary.achievementRate = calculateRate(summary.netSalesAmount, summary.targetAmount);
  return summary;
}

function invalidateDashboardCache(period = '') {
  DashboardCacheService.invalidate(period);
}

async function getHomeDashboard({ month, force = false } = {}) {
  const range = parseMonth(month);
  const today = dateUtil.todayVN();
  const cacheKey = `${range.period}:${today}`;
  const cacheVersion = await DashboardCacheService.freshnessVersion();
  if (!force) {
    const cached = DashboardCacheService.read(cacheKey, cacheVersion);
    if (cached) return { ...cached, cacheHit: true };
  }

  const queryDurationMs = {};
  const timed = async (name, factory) => {
    const startedAt = Date.now();
    try {
      return await factory();
    } finally {
      queryDurationMs[name] = Date.now() - startedAt;
    }
  };

  const [
    activeStaff,
    targets,
    monthlySalesResult,
    todaySalesResult,
    monthlyReturnsResult,
    currentDebtResult,
    deliveryMonthResult,
    deliveryTodayResult,
    deliveryMonthReturns,
    deliveryTodayReturns
  ] = await Promise.all([
    timed('activeStaff', () => listActiveStaff()),
    timed('targets', () => SalesTargetService.listByPeriod(range.period)),
    timed('monthlySales', () => SalesDashboardQuery.aggregateSales(range.dateFrom, range.dateTo)),
    timed('todaySales', () => SalesDashboardQuery.aggregateSales(today, today, { requireAccountingConfirmed: false })),
    timed('monthlyReturns', () => SalesDashboardQuery.aggregateReturns(range.dateFrom, range.dateTo)),
    timed('currentDebt', () => DebtDashboardQuery.aggregateCurrentDebt()),
    timed('deliveryMonth', () => DeliveryDashboardQuery.aggregateDeliveryMonth(range.dateFrom, range.dateTo)),
    timed('deliveryToday', () => DeliveryDashboardQuery.aggregateDeliveryToday(today)),
    timed('deliveryMonthReturns', () => DeliveryDashboardQuery.aggregateDeliveryReturns(range.dateFrom, range.dateTo)),
    timed('deliveryTodayReturns', () => DeliveryDashboardQuery.aggregateDeliveryReturns(today, today))
  ]);

  const salesByStaff = mergeSalesRows({
    activeStaff: activeStaff.sales,
    targets,
    monthlySales: monthlySalesResult.rows,
    monthlyReturns: monthlyReturnsResult.rows,
    currentDebt: currentDebtResult.rows,
    todaySales: todaySalesResult.rows
  });
  const deliveryMonth = mergeDeliveryRows(activeStaff.delivery, deliveryMonthResult.rows, deliveryMonthReturns);
  const deliveryToday = mergeDeliveryRows(activeStaff.delivery, deliveryTodayResult.rows, deliveryTodayReturns);
  const dataQuality = buildDataQuality({
    activeStaff,
    monthlySales: monthlySalesResult.rows,
    todaySales: todaySalesResult.rows,
    monthlyReturns: monthlyReturnsResult.rows,
    currentDebt: currentDebtResult.rows,
    deliveryMonthRaw: deliveryMonthResult.rows,
    deliveryTodayRaw: deliveryTodayResult.rows
  });
  dataQuality.catalogPricing = {
    monthlySales: monthlySalesResult.dataQuality || {},
    todaySales: todaySalesResult.dataQuality || {},
    monthlyReturns: monthlyReturnsResult.dataQuality || {}
  };
  const catalogWarningSources = [
    ['đơn bán tháng', monthlySalesResult.dataQuality],
    ['đơn bán hôm nay', todaySalesResult.dataQuality],
    ['hàng trả tháng', monthlyReturnsResult.dataQuality]
  ];
  catalogWarningSources.forEach(([label, quality = {}]) => {
    const missingCount = normalizeMoney(quality.missingProductItemCount);
    const zeroPriceCount = normalizeMoney(quality.zeroSalePriceItemCount);
    if (missingCount > 0) {
      dataQuality.warnings.push(`${missingCount} dòng ${label} không tìm thấy mã sản phẩm nên chưa tính theo giá danh mục`);
    }
    if (zeroPriceCount > 0) {
      dataQuality.warnings.push(`${zeroPriceCount} dòng ${label} có giá bán sản phẩm bằng 0 nên doanh số đang bằng 0`);
    }
  });
  const generatedAt = new Date().toISOString();

  const result = {
    enabled: dashboardEnabled(),
    period: {
      month: range.period,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      today,
      timezone: dateUtil.VIETNAM_TIME_ZONE
    },
    summary: buildSummary(salesByStaff, {
      sales: monthlySalesResult.totals,
      todaySales: todaySalesResult.totals,
      returns: monthlyReturnsResult.totals,
      debt: currentDebtResult.totals
    }),
    salesByStaff,
    deliveryMonth,
    deliveryToday,
    dataQuality,
    sources: {
      sales: monthlySalesResult.source,
      returns: monthlyReturnsResult.source,
      debt: currentDebtResult.source,
      deliveryMonth: deliveryMonthResult.source,
      deliveryToday: deliveryTodayResult.source,
      snapshot: false
    },
    metrics: {
      queryDurationMs,
      deliveryMonth: deliveryMonthResult.perf || null,
      deliveryToday: deliveryTodayResult.perf || null
    },
    debtZeroTolerance: DEBT_ZERO_TOLERANCE,
    generatedAt,
    cacheHit: false,
    cacheEnabled: DashboardCacheService.enabled()
  };

  DashboardCacheService.write(cacheKey, cacheVersion, result);
  return result;
}

module.exports = {
  CACHE_TTL_MS,
  dashboardEnabled,
  normalizeMoney,
  calculateRate,
  resolveTargetStatus,
  resolveDeliveryBucket,
  parseMonth,
  buildDateRangeFilter,
  buildSalesStaffIndex,
  resolveCanonicalSalesStaff,
  mergeSalesRows,
  mergeDeliveryRows,
  buildDataQuality,
  buildSummary,
  invalidateDashboardCache,
  getHomeDashboard
};
