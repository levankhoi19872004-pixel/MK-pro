'use strict';

const FundBalanceReadService = require('./FundBalanceReadService');
const DeliveryCashInTransitReportService = require('../../domain/settlement/DeliveryCashInTransitReportService');
const DeliveryCashSubmission = require('../../models/DeliveryCashSubmission');
const DeliveryCashShortage = require('../../models/DeliveryCashShortage');
const fundLedgerRepository = require('../../repositories/fundLedgerRepository');
const dateUtil = require('../../utils/date.util');

const CONTRACT_VERSION = 'fund-dashboard-v1';
const DEFAULT_TIMEZONE = dateUtil.VIETNAM_TIME_ZONE || 'Asia/Ho_Chi_Minh';
const DEFAULT_RECENT_LIMIT = 10;
const DEFAULT_CASH_IN_TRANSIT_LIMIT = 20;

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeDashboardQuery(query = {}) {
  const asOf = dateUtil.toDateOnly(query.asOf || query.dateTo || query.to || query.date || '', dateUtil.todayVN());
  if (!asOf) {
    const error = new Error('Ngày dữ liệu quỹ không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_FUND_DASHBOARD_AS_OF';
    throw error;
  }
  return {
    asOf,
    timezone: text(query.timezone || DEFAULT_TIMEZONE) || DEFAULT_TIMEZONE,
    recentLimit: clampInt(query.recentLimit || query.limit, 1, 50, DEFAULT_RECENT_LIMIT),
    cashInTransitLimit: clampInt(query.cashInTransitLimit, 1, 100, DEFAULT_CASH_IN_TRANSIT_LIMIT),
    tenantId: text(query.tenantId || '')
  };
}

function dayDiff(fromDate, toDate) {
  const from = dateUtil.toDateOnly(fromDate, '');
  const to = dateUtil.toDateOnly(toDate, '');
  if (!from || !to) return 0;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.max(0, Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / (24 * 60 * 60 * 1000)));
}

function balanceStatus(closing) {
  if (number(closing) < 0) return 'negative';
  return 'normal';
}

function mapBalance(bucket = {}) {
  const closing = number(bucket.endingBalance);
  return {
    opening: number(bucket.openingBalance),
    inflow: number(bucket.inPeriod),
    outflow: number(bucket.outPeriod),
    closing,
    status: balanceStatus(closing)
  };
}

async function loadBalances(filters = {}) {
  const summary = await FundBalanceReadService.getFundBalanceSummary({
    dateFrom: filters.asOf,
    dateTo: filters.asOf,
    timezone: filters.timezone,
    tenantId: filters.tenantId
  });
  return {
    cash: mapBalance(summary.cash),
    bank: mapBalance(summary.bank),
    total: mapBalance(summary.total),
    source: 'fundLedgers',
    queryCount: 1
  };
}

function activeSubmissionMatch(asOf) {
  return {
    deliveryDate: { $lte: asOf },
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted'] },
    $or: [
      { fundPosted: { $ne: true } },
      { hasPostedLines: { $ne: true } },
      { 'remittanceLines.status': { $nin: ['confirmed', 'cancelled', 'reversed'] } }
    ]
  };
}

async function loadPendingRemittances(filters = {}) {
  const rows = await DeliveryCashSubmission.aggregate([
    { $match: activeSubmissionMatch(filters.asOf) },
    {
      $project: {
        deliveryDate: 1,
        code: 1,
        remittanceLines: { $ifNull: ['$remittanceLines', []] },
        legacyPendingAmount: {
          $add: [
            { $ifNull: ['$submittedCashAmount', 0] },
            { $ifNull: ['$submittedBankAmount', 0] }
          ]
        }
      }
    },
    {
      $project: {
        deliveryDate: 1,
        code: 1,
        pendingLines: {
          $filter: {
            input: '$remittanceLines',
            as: 'line',
            cond: {
              $and: [
                { $gt: [{ $ifNull: ['$$line.amount', 0] }, 0] },
                { $not: [{ $in: [{ $toLower: { $ifNull: ['$$line.status', 'draft'] } }, ['confirmed', 'cancelled', 'canceled', 'reversed']]}] }
              ]
            }
          }
        },
        legacyPendingAmount: 1
      }
    },
    {
      $project: {
        deliveryDate: 1,
        code: 1,
        lineCount: { $size: '$pendingLines' },
        amount: {
          $cond: [
            { $gt: [{ $size: '$pendingLines' }, 0] },
            { $sum: '$pendingLines.amount' },
            '$legacyPendingAmount'
          ]
        }
      }
    },
    { $match: { amount: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        amount: { $sum: '$amount' },
        oldestDate: { $min: '$deliveryDate' }
      }
    }
  ]);
  const row = rows[0] || {};
  return {
    count: number(row.count),
    amount: number(row.amount),
    oldestAgeDays: row.oldestDate ? dayDiff(row.oldestDate, filters.asOf) : 0
  };
}

async function loadUnclassifiedShortages(filters = {}) {
  const rows = await DeliveryCashShortage.aggregate([
    {
      $match: {
        deliveryDate: { $lte: filters.asOf },
        status: { $in: ['open', 'partial', 'disputed', 'pending_reconciliation'] },
        outstandingAmount: { $gt: 0 }
      }
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        amount: { $sum: '$outstandingAmount' },
        oldestDate: { $min: '$deliveryDate' }
      }
    }
  ]);
  const row = rows[0] || {};
  return {
    count: number(row.count),
    amount: number(row.amount),
    oldestAgeDays: row.oldestDate ? dayDiff(row.oldestDate, filters.asOf) : 0
  };
}

function normalizeCashInTransitRow(row = {}, asOf = '') {
  const difference = number(row.difference);
  return {
    deliveryStaffCode: text(row.deliveryStaffCode),
    deliveryStaffName: text(row.deliveryStaffName || row.deliveryStaffCode),
    deliveryDate: dateUtil.toDateOnly(row.date || row.deliveryDate || '', ''),
    requiredAmount: number(row.collectedCash),
    submittedAmount: number(row.submittedCash),
    remainingAmount: Math.max(0, difference),
    difference,
    ageDays: dayDiff(row.date || row.deliveryDate, asOf),
    status: text(row.status || (difference > 0 ? 'pending' : 'settled')),
    masterOrderCodes: Array.isArray(row.masterOrderCodes) ? row.masterOrderCodes.filter(Boolean) : [],
    submissionCodes: Array.isArray(row.submissionCodes) ? row.submissionCodes.filter(Boolean) : []
  };
}

async function loadCashInTransit(filters = {}) {
  const result = await DeliveryCashInTransitReportService.listDeliveryCashInTransit({
    dateTo: filters.asOf,
    status: 'pending'
  });
  const allItems = (result.rows || [])
    .map((row) => normalizeCashInTransitRow(row, filters.asOf))
    .filter((row) => row.remainingAmount > 0)
    .sort((a, b) => b.ageDays - a.ageDays || b.remainingAmount - a.remainingAmount || a.deliveryStaffCode.localeCompare(b.deliveryStaffCode));
  const items = allItems.slice(0, filters.cashInTransitLimit);
  const totalAmount = allItems.reduce((sum, row) => sum + row.remainingAmount, 0);
  return {
    totalAmount,
    staffCount: new Set(allItems.map((row) => row.deliveryStaffCode).filter(Boolean)).size,
    totalRows: allItems.length,
    items,
    truncated: allItems.length > items.length
  };
}

function recentProjection() {
  return {
    id: 1,
    code: 1,
    date: 1,
    accountingDate: 1,
    createdAt: 1,
    fundType: 1,
    direction: 1,
    account: 1,
    amount: 1,
    sourceType: 1,
    sourceId: 1,
    sourceCode: 1,
    sourceLineId: 1,
    refType: 1,
    refCode: 1,
    referenceType: 1,
    referenceCode: 1,
    counterpartyCode: 1,
    counterpartyName: 1,
    deliveryStaffCode: 1,
    deliveryStaffName: 1,
    receiverCode: 1,
    receiverName: 1,
    confirmedBy: 1,
    createdBy: 1,
    status: 1,
    accountingStatus: 1,
    note: 1
  };
}

function mapRecentLedger(row = {}) {
  const direction = text(row.direction).toLowerCase() === 'out' ? 'out' : 'in';
  const amount = number(row.amount);
  return {
    id: text(row.id || row._id),
    code: text(row.code || row.id || row._id),
    accountingDate: dateUtil.toDateOnly(row.accountingDate || row.date || '', ''),
    date: dateUtil.toDateOnly(row.date || row.accountingDate || '', ''),
    fundType: text(row.fundType).toLowerCase() === 'bank' ? 'bank' : 'cash',
    account: text(row.account || (text(row.fundType).toLowerCase() === 'bank' ? 'BANK' : 'CASH')),
    direction,
    amount,
    inAmount: direction === 'in' ? amount : 0,
    outAmount: direction === 'out' ? amount : 0,
    sourceType: text(row.sourceType || row.refType || row.referenceType),
    sourceCode: text(row.sourceCode || row.refCode || row.referenceCode),
    sourceId: text(row.sourceId || row.refId || row.referenceId),
    sourceLineId: text(row.sourceLineId),
    counterparty: text(row.counterpartyName || row.deliveryStaffName || row.receiverName || row.counterpartyCode || row.deliveryStaffCode || row.receiverCode),
    status: text(row.accountingStatus || row.status || 'confirmed'),
    note: text(row.note),
    confirmedBy: text(row.confirmedBy || row.createdBy)
  };
}

async function loadRecentTransactions(filters = {}) {
  const match = FundBalanceReadService.fundLedgerCanonicalFilter({
    $or: [
      { accountingDate: { $lte: filters.asOf } },
      { date: { $lte: filters.asOf } }
    ]
  });
  const rows = await fundLedgerRepository.findAll(match, {
    projection: recentProjection(),
    sort: { accountingDate: -1, date: -1, createdAt: -1, _id: -1 },
    limit: filters.recentLimit
  });
  return (rows || []).map(mapRecentLedger);
}

function emptyUnsupportedBankQueue() {
  return {
    supported: false,
    count: null,
    amount: null,
    oldestAgeDays: null,
    message: 'Chưa hỗ trợ đối soát ngân hàng'
  };
}

async function optionalSection(section, code, message, loader, errors) {
  try {
    return await loader();
  } catch (error) {
    errors.push({ section, code, message, detail: process.env.NODE_ENV === 'production' ? undefined : error.message });
    return null;
  }
}

async function getFundDashboard(query = {}) {
  const filters = normalizeDashboardQuery(query);
  const balances = await loadBalances(filters);
  const errors = [];
  const [pendingRemittances, unclassifiedShortages, cashInTransit, recentTransactions] = await Promise.all([
    optionalSection('pendingRemittances', 'PENDING_REMITTANCES_LOAD_FAILED', 'Không tải được phiếu nộp quỹ chờ xác nhận', () => loadPendingRemittances(filters), errors),
    optionalSection('unclassifiedShortages', 'SHORTAGES_LOAD_FAILED', 'Không tải được khoản thiếu chưa xử lý', () => loadUnclassifiedShortages(filters), errors),
    optionalSection('cashInTransit', 'CASH_IN_TRANSIT_LOAD_FAILED', 'Không tải được tiền NVGH đang giữ', () => loadCashInTransit(filters), errors),
    optionalSection('recentTransactions', 'RECENT_FUND_LEDGER_LOAD_FAILED', 'Không tải được giao dịch quỹ gần đây', () => loadRecentTransactions(filters), errors)
  ]);

  const pending = pendingRemittances || { count: null, amount: null, oldestAgeDays: null };
  const shortages = unclassifiedShortages || { count: null, amount: null, oldestAgeDays: null };
  const transit = cashInTransit || { totalAmount: null, staffCount: null, items: [], totalRows: null };
  const overdueItems = Array.isArray(transit.items) ? transit.items.filter((row) => number(row.ageDays) > 1) : [];
  const overdueDeliveryCash = cashInTransit
    ? {
        count: overdueItems.length,
        amount: overdueItems.reduce((sum, row) => sum + number(row.remainingAmount), 0),
        oldestAgeDays: overdueItems.reduce((max, row) => Math.max(max, number(row.ageDays)), 0)
      }
    : { count: null, amount: null, oldestAgeDays: null };

  return {
    success: true,
    ok: true,
    status: errors.length ? 'partial' : 'ok',
    data: {
      contractVersion: CONTRACT_VERSION,
      asOf: filters.asOf,
      generatedAt: dateUtil.nowIso(),
      timezone: filters.timezone,
      balances: {
        cash: balances.cash,
        bank: balances.bank
      },
      workQueues: {
        pendingRemittances: pending,
        overdueDeliveryCash,
        unclassifiedShortages: shortages,
        unmatchedBankTransactions: emptyUnsupportedBankQueue()
      },
      cashInTransit: transit,
      recentTransactions: recentTransactions || [],
      limits: {
        recentLimit: filters.recentLimit,
        cashInTransitLimit: filters.cashInTransitLimit
      },
      source: {
        balances: 'fundLedgers via FundBalanceReadService',
        cashInTransit: 'DeliveryCashInTransitReportService',
        pendingRemittances: 'deliveryCashSubmissions.remittanceLines',
        shortages: 'deliveryCashShortages',
        recentTransactions: 'fundLedgers'
      }
    },
    errors
  };
}

module.exports = {
  CONTRACT_VERSION,
  normalizeDashboardQuery,
  getFundDashboard,
  _private: {
    dayDiff,
    mapBalance,
    loadPendingRemittances,
    loadUnclassifiedShortages,
    normalizeCashInTransitRow,
    mapRecentLedger
  }
};
