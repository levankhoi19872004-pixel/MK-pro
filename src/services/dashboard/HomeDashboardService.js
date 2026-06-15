'use strict';

const SalesOrder = require('../../models/SalesOrder');
const ReturnOrder = require('../../models/ReturnOrder');
const ArLedger = require('../../models/ArLedger');
const User = require('../../models/User');
const dateUtil = require('../../utils/date.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount } = require('../../constants/finance.constants');
const SalesTargetService = require('./SalesTargetService');

const INACTIVE_STATUSES = ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled'];
const ACCOUNTING_CONFIRMED_STATUSES = ['confirmed', 'accounting_confirmed', 'posted', 'completed'];
const DELIVERED_STATUSES = ['delivered', 'success', 'completed', 'done', 'paid', 'accounting_confirmed'];
const FAILED_DELIVERY_STATUSES = ['failed', 'cancelled', 'canceled', 'returned', 'delivery_failed'];
const DELIVERING_STATUSES = ['delivering', 'in_progress', 'on_route', 'shipping'];
const CACHE_TTL_MS = Math.max(5_000, Number(process.env.HOME_DASHBOARD_CACHE_TTL_MS || 45_000));
const dashboardCache = new Map();

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

function stringExpression(field) {
  return {
    $trim: {
      input: {
        $convert: {
          input: `$${field}`,
          to: 'string',
          onError: '',
          onNull: ''
        }
      }
    }
  };
}

function firstNonBlankExpression(fields = [], fallback = '') {
  return fields.reduceRight((next, field) => ({
    $let: {
      vars: { current: stringExpression(field) },
      in: {
        $cond: [
          { $gt: [{ $strLenCP: '$$current' }, 0] },
          '$$current',
          next
        ]
      }
    }
  }), fallback);
}

function numberExpression(fields = [], fallback = 0) {
  const source = fields.reduceRight((next, field) => ({ $ifNull: [`$${field}`, next] }), fallback);
  return {
    $convert: {
      input: source,
      to: 'double',
      onError: 0,
      onNull: 0
    }
  };
}

function buildDateRangeFilter(dateFrom, dateTo, fields = []) {
  const clauses = fields.map((field) => ({
    [field]: { $gte: dateFrom, $lte: dateTo }
  }));

  const start = new Date(`${dateFrom}T00:00:00+07:00`);
  const end = new Date(`${dateTo}T00:00:00+07:00`);
  end.setDate(end.getDate() + 1);
  clauses.push({ createdAt: { $gte: start, $lt: end } });

  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

function activeFilter() {
  return { status: { $nin: INACTIVE_STATUSES } };
}

function accountingConfirmedFilter() {
  return {
    $or: [
      { accountingConfirmed: true },
      { accountingStatus: { $in: ACCOUNTING_CONFIRMED_STATUSES } },
      { lifecycleStatus: { $in: ACCOUNTING_CONFIRMED_STATUSES } },
      { arStatus: { $in: ['posted', 'confirmed', 'accounting_confirmed'] } },
      { status: 'accounting_confirmed' }
    ]
  };
}

function returnConfirmedFilter() {
  return {
    $or: [
      { arPosted: true },
      { accountingConfirmed: true },
      { accountingStatus: { $in: ACCOUNTING_CONFIRMED_STATUSES } },
      { returnState: { $in: ['accounting_confirmed', 'posted_to_ar'] } },
      { status: { $in: ['accounting_confirmed', 'posted_to_ar'] } }
    ]
  };
}

function salesStaffCodeExpression() {
  return firstNonBlankExpression(['salesStaffCode', 'salesmanCode', 'nvbhCode'], '');
}

function salesStaffNameExpression() {
  return firstNonBlankExpression(['salesStaffName', 'salesmanName', 'nvbhName'], '');
}

function deliveryStaffCodeExpression() {
  return firstNonBlankExpression(['deliveryStaffCode', 'deliveryCode', 'nvghCode'], '');
}

function deliveryStaffNameExpression() {
  return firstNonBlankExpression(['deliveryStaffName', 'deliveryName', 'nvghName'], '');
}

async function aggregateSales(dateFrom, dateTo) {
  const totalAmount = numberExpression(['totalAmount', 'amount', 'grandTotal', 'total', 'value'], 0);
  const result = await SalesOrder.aggregate([
    {
      $match: {
        $and: [
          activeFilter(),
          accountingConfirmedFilter(),
          buildDateRangeFilter(dateFrom, dateTo, ['orderDate', 'date', 'documentDate'])
        ]
      }
    },
    {
      $group: {
        _id: {
          code: salesStaffCodeExpression(),
          name: salesStaffNameExpression()
        },
        orderCount: { $sum: 1 },
        salesAmount: { $sum: totalAmount }
      }
    },
    { $sort: { '_id.name': 1, '_id.code': 1 } }
  ]).allowDiskUse(true).exec();

  return result.map((row) => ({
    salesStaffCode: String(row?._id?.code || '').trim(),
    salesStaffName: String(row?._id?.name || '').trim(),
    orderCount: normalizeMoney(row.orderCount),
    salesAmount: normalizeMoney(row.salesAmount)
  })).filter((row) => row.salesStaffCode || row.salesStaffName);
}

async function aggregateReturns(dateFrom, dateTo) {
  const returnAmount = numberExpression(['returnAmount', 'amount', 'totalAmount', 'debtReduction'], 0);
  const result = await ReturnOrder.aggregate([
    {
      $match: {
        $and: [
          activeFilter(),
          returnConfirmedFilter(),
          buildDateRangeFilter(dateFrom, dateTo, ['returnDate', 'date', 'documentDate', 'deliveryDate'])
        ]
      }
    },
    {
      $group: {
        _id: {
          code: salesStaffCodeExpression(),
          name: salesStaffNameExpression()
        },
        returnCount: { $sum: 1 },
        returnAmount: { $sum: returnAmount }
      }
    }
  ]).allowDiskUse(true).exec();

  return result.map((row) => ({
    salesStaffCode: String(row?._id?.code || '').trim(),
    salesStaffName: String(row?._id?.name || '').trim(),
    returnCount: normalizeMoney(row.returnCount),
    returnAmount: Math.max(0, normalizeMoney(row.returnAmount))
  })).filter((row) => row.salesStaffCode || row.salesStaffName);
}

async function aggregateCurrentDebt() {
  const debit = numberExpression(['debit', 'arDebit'], 0);
  const credit = numberExpression(['credit', 'arCredit'], 0);
  const amount = numberExpression(['amount'], 0);
  const type = { $toLower: firstNonBlankExpression(['type'], '') };
  const isSaleType = { $regexMatch: { input: type, regex: 'sale|external_debt' } };
  const orderKey = firstNonBlankExpression(
    ['orderCode', 'salesOrderCode', 'orderId', 'salesOrderId', 'refCode', 'refId'],
    { $concat: ['orphan:', { $toString: '$_id' }] }
  );

  // Công nợ phải nhóm theo đơn trước rồi mới nhóm theo NVBH. AR-RECEIPT/AR-RETURN
  // có thể không mang thông tin nhân viên; lấy nhân viên từ dòng AR-SALE để credit
  // vẫn giảm đúng công nợ của người phụ trách đơn.
  const result = await ArLedger.aggregate([
    {
      $match: {
        status: { $nin: [...INACTIVE_STATUSES, 'reversed'] },
        reversed: { $ne: true },
        refType: { $ne: 'AR_LEDGER_REVERSAL' },
        type: { $nin: ['ar_reversal', 'reversal', 'ar_void'] }
      }
    },
    {
      $group: {
        _id: orderKey,
        debit: {
          $sum: {
            $cond: [
              { $gt: [debit, 0] },
              debit,
              { $cond: [isSaleType, amount, 0] }
            ]
          }
        },
        credit: {
          $sum: {
            $cond: [
              { $gt: [credit, 0] },
              credit,
              { $cond: [isSaleType, 0, amount] }
            ]
          }
        },
        salesStaffCode: { $max: { $cond: [isSaleType, salesStaffCodeExpression(), ''] } },
        salesStaffName: { $max: { $cond: [isSaleType, salesStaffNameExpression(), ''] } }
      }
    },
    {
      $group: {
        _id: {
          code: '$salesStaffCode',
          name: '$salesStaffName'
        },
        debtAmount: { $sum: { $subtract: ['$debit', '$credit'] } }
      }
    }
  ]).allowDiskUse(true).exec();

  return result.map((row) => {
    const debtAmount = normalizeDebtAmount(normalizeMoney(row.debtAmount));
    const code = String(row?._id?.code || '').trim();
    const name = String(row?._id?.name || '').trim();
    return {
      salesStaffCode: code,
      salesStaffName: name || (!code && debtAmount > 0 ? 'Chưa gán' : ''),
      debtAmount: Math.max(0, normalizeMoney(debtAmount))
    };
  }).filter((row) => row.debtAmount > 0 || row.salesStaffCode || row.salesStaffName);
}

async function aggregateDelivery(dateFrom, dateTo) {
  const totalAmount = numberExpression(['totalAmount', 'amount', 'grandTotal', 'total', 'value'], 0);
  const rawStatus = firstNonBlankExpression(['deliveryStatus', 'status'], 'pending');
  const status = { $toLower: rawStatus };
  const deliveredCondition = { $in: [status, DELIVERED_STATUSES] };
  const failedCondition = { $in: [status, FAILED_DELIVERY_STATUSES] };
  const deliveringCondition = { $in: [status, DELIVERING_STATUSES] };

  const result = await SalesOrder.aggregate([
    {
      $match: {
        $and: [
          activeFilter(),
          buildDateRangeFilter(dateFrom, dateTo, ['deliveryDate', 'date', 'orderDate'])
        ]
      }
    },
    {
      $group: {
        _id: {
          code: deliveryStaffCodeExpression(),
          name: deliveryStaffNameExpression()
        },
        assignedOrders: { $sum: 1 },
        deliveredOrders: { $sum: { $cond: [deliveredCondition, 1, 0] } },
        failedOrders: { $sum: { $cond: [failedCondition, 1, 0] } },
        deliveringOrders: { $sum: { $cond: [deliveringCondition, 1, 0] } },
        pendingOrders: {
          $sum: {
            $cond: [
              { $or: [deliveredCondition, failedCondition, deliveringCondition] },
              0,
              1
            ]
          }
        },
        assignedAmount: { $sum: totalAmount },
        deliveredAmount: { $sum: { $cond: [deliveredCondition, totalAmount, 0] } },
        salesStaffCodes: { $addToSet: salesStaffCodeExpression() }
      }
    },
    { $sort: { assignedOrders: -1, '_id.name': 1 } }
  ]).allowDiskUse(true).exec();

  return result.map((row) => ({
    deliveryStaffCode: String(row?._id?.code || '').trim(),
    deliveryStaffName: String(row?._id?.name || '').trim(),
    assignedOrders: normalizeMoney(row.assignedOrders),
    deliveredOrders: normalizeMoney(row.deliveredOrders),
    failedOrders: normalizeMoney(row.failedOrders),
    deliveringOrders: normalizeMoney(row.deliveringOrders),
    pendingOrders: normalizeMoney(row.pendingOrders),
    assignedAmount: normalizeMoney(row.assignedAmount),
    deliveredAmount: normalizeMoney(row.deliveredAmount),
    salesStaffCount: Array.isArray(row.salesStaffCodes)
      ? row.salesStaffCodes.filter((code) => String(code || '').trim()).length
      : 0
  })).filter((row) => row.deliveryStaffCode || row.deliveryStaffName);
}

async function aggregateDeliveryReturns(dateFrom, dateTo) {
  const returnAmount = numberExpression(['returnAmount', 'amount', 'totalAmount', 'debtReduction'], 0);
  const result = await ReturnOrder.aggregate([
    {
      $match: {
        $and: [
          activeFilter(),
          buildDateRangeFilter(dateFrom, dateTo, ['deliveryDate', 'returnDate', 'date', 'documentDate'])
        ]
      }
    },
    {
      $group: {
        _id: {
          code: deliveryStaffCodeExpression(),
          name: deliveryStaffNameExpression()
        },
        returnAmount: { $sum: returnAmount }
      }
    }
  ]).allowDiskUse(true).exec();

  return result.map((row) => ({
    deliveryStaffCode: String(row?._id?.code || '').trim(),
    deliveryStaffName: String(row?._id?.name || '').trim(),
    returnAmount: Math.max(0, normalizeMoney(row.returnAmount))
  })).filter((row) => row.deliveryStaffCode || row.deliveryStaffName);
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

function buildSalesStaffIndex(activeStaff = []) {
  const byCode = new Map();
  const nameCandidates = new Map();

  for (const source of activeStaff) {
    const salesStaffCode = String(source?.salesStaffCode || '').trim();
    const salesStaffName = String(source?.salesStaffName || '').trim();
    if (!salesStaffCode && !salesStaffName) continue;

    const canonical = { salesStaffCode, salesStaffName };
    const normalizedCode = normalizeStaffIdentity(salesStaffCode);
    const normalizedName = normalizeStaffIdentity(salesStaffName);
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

  return { byCode, byUniqueName };
}

function resolveCanonicalSalesStaff(source = {}, staffIndex = {}) {
  const code = String(source.salesStaffCode || '').trim();
  const name = String(source.salesStaffName || '').trim();

  // Khi chứng từ đã có mã, chỉ chấp nhận mã thuộc users.role=sales.
  // Không fallback sang tên vì NVGH có thể trùng tên NVBH và làm sai công nợ.
  if (code) return staffIndex.byCode?.get(normalizeStaffIdentity(code)) || null;
  if (name) return staffIndex.byUniqueName?.get(normalizeStaffIdentity(name)) || null;
  return null;
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

  // Danh sách gốc chỉ được sinh từ tài khoản NVBH đang hoạt động.
  activeStaff.forEach(ensureCanonical);
  targets.forEach((source) => {
    const row = resolveRow(source);
    if (row) row.targetAmount = normalizeMoney(source.targetAmount);
  });
  monthlySales.forEach((source) => {
    const row = resolveRow(source);
    if (!row) return;
    row.orderCount = normalizeMoney(source.orderCount);
    row.salesAmount = normalizeMoney(source.salesAmount);
  });
  monthlyReturns.forEach((source) => {
    const row = resolveRow(source);
    if (!row) return;
    row.returnCount = normalizeMoney(source.returnCount);
    row.returnAmount = normalizeMoney(source.returnAmount);
  });
  currentDebt.forEach((source) => {
    const row = resolveRow(source);
    if (row) row.debtAmount = normalizeMoney(source.debtAmount);
  });
  todaySales.forEach((source) => {
    const row = resolveRow(source);
    if (!row) return;
    row.todayOrderCount = normalizeMoney(source.orderCount);
    row.todaySalesAmount = normalizeMoney(source.salesAmount);
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
  const ensure = (source = {}) => {
    const code = String(source.deliveryStaffCode || '').trim();
    const name = String(source.deliveryStaffName || '').trim();
    if (!code && !name) return null;
    const key = staffKey(code, name);
    if (!rows.has(key)) {
      rows.set(key, {
        deliveryStaffCode: code,
        deliveryStaffName: name,
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
    const row = rows.get(key);
    if (!row.deliveryStaffCode && code) row.deliveryStaffCode = code;
    if (!row.deliveryStaffName && name) row.deliveryStaffName = name;
    return row;
  };

  activeStaff.forEach(ensure);
  deliveryRows.forEach((source) => {
    const row = ensure(source);
    if (!row) return;
    Object.assign(row, {
      salesStaffCount: normalizeMoney(source.salesStaffCount),
      assignedOrders: normalizeMoney(source.assignedOrders),
      deliveredOrders: normalizeMoney(source.deliveredOrders),
      deliveringOrders: normalizeMoney(source.deliveringOrders),
      pendingOrders: normalizeMoney(source.pendingOrders),
      failedOrders: normalizeMoney(source.failedOrders),
      assignedAmount: normalizeMoney(source.assignedAmount),
      deliveredAmount: normalizeMoney(source.deliveredAmount)
    });
  });
  returnRows.forEach((source) => {
    const row = ensure(source);
    if (row) row.returnAmount = normalizeMoney(source.returnAmount);
  });

  return Array.from(rows.values()).map((row) => {
    row.completionRate = calculateRate(row.deliveredOrders, row.assignedOrders);
    return row;
  }).sort((left, right) => right.assignedOrders - left.assignedOrders || String(left.deliveryStaffName || left.deliveryStaffCode).localeCompare(String(right.deliveryStaffName || right.deliveryStaffCode), 'vi'));
}

function buildSummary(salesByStaff = []) {
  const summary = salesByStaff.reduce((result, row) => {
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
  summary.achievementRate = calculateRate(summary.netSalesAmount, summary.targetAmount);
  return summary;
}

function readCache(key) {
  const cached = dashboardCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    dashboardCache.delete(key);
    return null;
  }
  return cached.value;
}

function writeCache(key, value) {
  dashboardCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateDashboardCache(period = '') {
  const normalizedPeriod = String(period || '').trim();
  if (!normalizedPeriod) {
    dashboardCache.clear();
    return;
  }
  for (const key of dashboardCache.keys()) {
    if (key.startsWith(`${normalizedPeriod}:`)) dashboardCache.delete(key);
  }
}

async function getHomeDashboard({ month, force = false } = {}) {
  const range = parseMonth(month);
  const today = dateUtil.todayVN();
  const cacheKey = `${range.period}:${today}`;
  if (!force) {
    const cached = readCache(cacheKey);
    if (cached) return { ...cached, cacheHit: true };
  }

  const [activeStaff, targets, monthlySales, todaySales, monthlyReturns, currentDebt, deliveryMonthRaw, deliveryTodayRaw, deliveryMonthReturns, deliveryTodayReturns] = await Promise.all([
    listActiveStaff(),
    SalesTargetService.listByPeriod(range.period),
    aggregateSales(range.dateFrom, range.dateTo),
    aggregateSales(today, today),
    aggregateReturns(range.dateFrom, range.dateTo),
    aggregateCurrentDebt(),
    aggregateDelivery(range.dateFrom, range.dateTo),
    aggregateDelivery(today, today),
    aggregateDeliveryReturns(range.dateFrom, range.dateTo),
    aggregateDeliveryReturns(today, today)
  ]);

  const salesByStaff = mergeSalesRows({
    activeStaff: activeStaff.sales,
    targets,
    monthlySales,
    monthlyReturns,
    currentDebt,
    todaySales
  });
  const deliveryMonth = mergeDeliveryRows(activeStaff.delivery, deliveryMonthRaw, deliveryMonthReturns);
  const deliveryToday = mergeDeliveryRows(activeStaff.delivery, deliveryTodayRaw, deliveryTodayReturns);
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
    summary: buildSummary(salesByStaff),
    salesByStaff,
    deliveryMonth,
    deliveryToday,
    debtZeroTolerance: DEBT_ZERO_TOLERANCE,
    generatedAt,
    cacheHit: false
  };

  writeCache(cacheKey, result);
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
  buildSummary,
  invalidateDashboardCache,
  getHomeDashboard
};
