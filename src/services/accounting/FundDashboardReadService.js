'use strict';

const FundBalanceReadService = require('./FundBalanceReadService');
const DeliveryCashInTransitReportService = require('../../domain/settlement/DeliveryCashInTransitReportService');
const DeliveryCashSubmission = require('../../models/DeliveryCashSubmission');
const DeliveryCashShortage = require('../../models/DeliveryCashShortage');
const fundLedgerRepository = require('../../repositories/fundLedgerRepository');
const dateUtil = require('../../utils/date.util');
const {
  normalizeLines: normalizeRemittanceLines,
  linesFromLegacyAmounts,
  canonicalLineStatus,
  money: remittanceMoney
} = require('../../domain/fund/deliveryRemittanceLines');

const CONTRACT_VERSION = 'fund-dashboard-v1';
const DEFAULT_TIMEZONE = dateUtil.VIETNAM_TIME_ZONE || 'Asia/Ho_Chi_Minh';
const DEFAULT_RECENT_LIMIT = 10;
const DEFAULT_CASH_IN_TRANSIT_LIMIT = 20;
const OVERDUE_DELIVERY_CASH_DAYS = 1;
const FINAL_SUBMISSION_STATUSES = Object.freeze(['confirmed', 'cancelled', 'canceled', 'reversed', 'void', 'deleted']);
const FINAL_LINE_STATUSES = Object.freeze(['confirmed', 'cancelled', 'canceled', 'reversed']);

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  if (value === null || value === undefined) return 0;
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isValidDateOnly(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function invalidAsOfError() {
  const error = new Error('Ngay du lieu quy khong hop le');
  error.status = 400;
  error.code = 'INVALID_FUND_DASHBOARD_AS_OF';
  return error;
}

function parseDashboardDate(query = {}) {
  const raw = text(query.asOf || query.dateTo || query.to || query.date || '');
  if (!raw) return dateUtil.todayVN();
  const normalized = dateUtil.toDateOnly(raw, '');
  if (!isValidDateOnly(normalized)) throw invalidAsOfError();
  return normalized;
}

function normalizeDashboardQuery(query = {}) {
  return {
    asOf: parseDashboardDate(query),
    timezone: text(query.timezone || DEFAULT_TIMEZONE) || DEFAULT_TIMEZONE,
    recentLimit: clampInt(query.recentLimit || query.limit, 1, 50, DEFAULT_RECENT_LIMIT),
    cashInTransitLimit: clampInt(query.cashInTransitLimit, 1, 100, DEFAULT_CASH_IN_TRANSIT_LIMIT),
    tenantId: text(query.tenantId || '')
  };
}

function safeDayDiff(fromDate, toDate) {
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

function canonicalStatus(value, fallback = 'draft') {
  const raw = text(value || fallback).toLowerCase();
  if (raw === 'canceled') return 'cancelled';
  return raw || fallback;
}

function isFinalSubmission(row = {}) {
  return row.fundPosted === true || FINAL_SUBMISSION_STATUSES.includes(canonicalStatus(row.status));
}

function isFinalLine(line = {}) {
  const status = canonicalStatus(line.status || canonicalLineStatus(line.status, 'draft'));
  return FINAL_LINE_STATUSES.includes(status);
}

function submissionIdentityKeys(row = {}) {
  return [row.id, row.code].map(text).filter(Boolean);
}

function groupLedgersBySubmission(ledgers = []) {
  const map = new Map();
  for (const ledger of ledgers || []) {
    for (const key of [ledger.sourceId, ledger.sourceCode, ledger.referenceId, ledger.referenceCode].map(text).filter(Boolean)) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ledger);
    }
  }
  return map;
}

async function loadRelatedSubmissionLedgers(rows = []) {
  const ids = [...new Set(rows.map((row) => text(row.id)).filter(Boolean))];
  const codes = [...new Set(rows.map((row) => text(row.code)).filter(Boolean))];
  const or = [];
  if (ids.length) or.push({ sourceId: { $in: ids } }, { referenceId: { $in: ids } });
  if (codes.length) or.push({ sourceCode: { $in: codes } }, { referenceCode: { $in: codes } });
  if (!or.length) return new Map();

  const ledgers = await fundLedgerRepository.findAll(
    FundBalanceReadService.fundLedgerCanonicalFilter({ sourceType: 'DELIVERY_CASH_SUBMISSION', $or: or }),
    {
      projection: {
        id: 1,
        code: 1,
        sourceId: 1,
        sourceCode: 1,
        referenceId: 1,
        referenceCode: 1,
        sourceLineId: 1,
        amount: 1,
        fundType: 1,
        date: 1,
        accountingDate: 1,
        remittanceDate: 1
      },
      limit: Math.min(20000, Math.max(500, rows.length * 8))
    }
  );
  return groupLedgersBySubmission(ledgers);
}

function postedLedgersForSubmission(row = {}, ledgersBySubmission = new Map()) {
  for (const key of submissionIdentityKeys(row)) {
    const ledgers = ledgersBySubmission.get(key);
    if (ledgers && ledgers.length) return ledgers;
  }
  return [];
}

function pendingFromSubmission(row = {}, ledgersBySubmission = new Map()) {
  const rawLines = Array.isArray(row.remittanceLines) ? row.remittanceLines : [];
  const persistedLines = normalizeRemittanceLines(rawLines, { submissionIdentity: row.id || row.code });
  if (persistedLines.length) {
    const pendingLines = persistedLines.filter((line, index) => remittanceMoney(line.amount) > 0 && !isFinalLine({ ...line, status: rawLines[index]?.status || line.status }));
    return {
      amount: pendingLines.reduce((sum, line) => sum + remittanceMoney(line.amount), 0),
      lineCount: pendingLines.length,
      source: 'remittanceLines'
    };
  }

  if (isFinalSubmission(row) || postedLedgersForSubmission(row, ledgersBySubmission).length > 0) {
    return { amount: 0, lineCount: 0, source: 'legacy-posted' };
  }

  const legacyLines = linesFromLegacyAmounts(row, {
    submissionIdentity: row.id || row.code,
    defaultRemittanceDate: '',
    defaultStatus: 'draft'
  });
  return {
    amount: legacyLines.reduce((sum, line) => sum + remittanceMoney(line.amount), 0),
    lineCount: legacyLines.length,
    source: 'legacy-pending'
  };
}

async function loadPendingRemittances(filters = {}) {
  const rows = await DeliveryCashSubmission.aggregate([
    {
      $match: {
        deliveryDate: { $lte: filters.asOf },
        status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'reversed'] }
      }
    },
    {
      $project: {
        id: { $ifNull: ['$id', { $toString: '$_id' }] },
        code: 1,
        deliveryDate: 1,
        status: 1,
        fundPosted: 1,
        remittanceLines: { $ifNull: ['$remittanceLines', []] },
        legacyPendingAmount: {
          $add: [
            { $convert: { input: '$submittedCashAmount', to: 'double', onError: 0, onNull: 0 } },
            { $convert: { input: '$submittedBankAmount', to: 'double', onError: 0, onNull: 0 } }
          ]
        }
      }
    },
    {
      $addFields: {
        pendingLines: {
          $filter: {
            input: '$remittanceLines',
            as: 'line',
            cond: {
              $and: [
                { $gt: [{ $convert: { input: '$$line.amount', to: 'double', onError: 0, onNull: 0 } }, 0] },
                { $not: [{ $in: [{ $toLower: { $ifNull: ['$$line.status', 'draft'] } }, FINAL_LINE_STATUSES] }] }
              ]
            }
          }
        }
      }
    },
    {
      $addFields: {
        hasRemittanceLines: { $gt: [{ $size: '$remittanceLines' }, 0] },
        pendingLineAmounts: {
          $map: {
            input: '$pendingLines',
            as: 'line',
            in: { $convert: { input: '$$line.amount', to: 'double', onError: 0, onNull: 0 } }
          }
        }
      }
    },
    {
      $lookup: {
        from: 'fundLedgers',
        let: { submissionId: '$id', submissionCode: '$code' },
        pipeline: [
          {
            $match: {
              sourceType: 'DELIVERY_CASH_SUBMISSION',
              active: { $ne: false },
              isDeleted: { $ne: true },
              deletedAt: { $in: [null, ''] },
              status: { $nin: ['draft', 'pending', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed'] },
              reversed: { $ne: true },
              isReversal: { $ne: true },
              reversalOf: { $in: [null, ''] },
              $or: [
                { accountingConfirmed: true },
                { accountingStatus: { $in: ['confirmed', 'posted', 'accounting_confirmed'] } },
                { posted: true }
              ]
            }
          },
          {
            $match: {
              $expr: {
                $or: [
                  { $and: [{ $ne: ['$$submissionId', ''] }, { $eq: ['$sourceId', '$$submissionId'] }] },
                  { $and: [{ $ne: ['$$submissionId', ''] }, { $eq: ['$referenceId', '$$submissionId'] }] },
                  { $and: [{ $ne: ['$$submissionCode', ''] }, { $eq: ['$sourceCode', '$$submissionCode'] }] },
                  { $and: [{ $ne: ['$$submissionCode', ''] }, { $eq: ['$referenceCode', '$$submissionCode'] }] }
                ]
              }
            }
          },
          { $limit: 1 },
          { $project: { _id: 1 } }
        ],
        as: 'postedFundLedgers'
      }
    },
    {
      $addFields: {
        pendingAmount: {
          $cond: [
            '$hasRemittanceLines',
            { $sum: '$pendingLineAmounts' },
            {
              $cond: [
                {
                  $or: [
                    { $eq: ['$fundPosted', true] },
                    { $in: [{ $toLower: { $ifNull: ['$status', 'draft'] } }, FINAL_SUBMISSION_STATUSES] },
                    { $gt: [{ $size: '$postedFundLedgers' }, 0] }
                  ]
                },
                0,
                '$legacyPendingAmount'
              ]
            }
          ]
        },
        pendingLineCount: {
          $cond: [
            '$hasRemittanceLines',
            { $size: '$pendingLines' },
            { $cond: [{ $gt: ['$legacyPendingAmount', 0] }, 1, 0] }
          ]
        }
      }
    },
    { $match: { pendingAmount: { $gt: 0 } } },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        lineCount: { $sum: '$pendingLineCount' },
        amount: { $sum: '$pendingAmount' },
        oldestDate: { $min: '$deliveryDate' }
      }
    }
  ]);
  const row = rows[0] || {};
  return {
    count: number(row.count),
    lineCount: number(row.lineCount),
    amount: number(row.amount),
    oldestAgeDays: row.oldestDate ? safeDayDiff(row.oldestDate, filters.asOf) : 0
  };
}

async function loadUnresolvedShortages(filters = {}) {
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
    oldestAgeDays: row.oldestDate ? safeDayDiff(row.oldestDate, filters.asOf) : 0
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
    ageDays: safeDayDiff(row.date || row.deliveryDate, asOf),
    status: text(row.status || (difference > 0 ? 'pending' : 'settled')),
    masterOrderCodes: Array.isArray(row.masterOrderCodes) ? row.masterOrderCodes.filter(Boolean) : [],
    submissionCodes: Array.isArray(row.submissionCodes) ? row.submissionCodes.filter(Boolean) : []
  };
}

function summarizeCashInTransitRows(rows = [], limit = DEFAULT_CASH_IN_TRANSIT_LIMIT) {
  const allItems = (rows || [])
    .map((row) => normalizeCashInTransitRow(row, row.asOf || ''))
    .filter((row) => row.remainingAmount > 0)
    .sort((a, b) => b.ageDays - a.ageDays || b.remainingAmount - a.remainingAmount || a.deliveryStaffCode.localeCompare(b.deliveryStaffCode));
  const items = allItems.slice(0, limit);
  const overdueItems = allItems.filter((row) => number(row.ageDays) > OVERDUE_DELIVERY_CASH_DAYS);
  return {
    totalAmount: allItems.reduce((sum, row) => sum + row.remainingAmount, 0),
    staffCount: new Set(allItems.map((row) => row.deliveryStaffCode).filter(Boolean)).size,
    totalRows: allItems.length,
    overdueSummary: {
      count: overdueItems.length,
      amount: overdueItems.reduce((sum, row) => sum + row.remainingAmount, 0),
      oldestAgeDays: overdueItems.reduce((max, row) => Math.max(max, number(row.ageDays)), 0)
    },
    items,
    truncated: allItems.length > items.length,
    limit
  };
}

async function loadCashInTransit(filters = {}) {
  const result = await DeliveryCashInTransitReportService.listDeliveryCashInTransit({
    dateTo: filters.asOf,
    status: 'pending',
    limit: filters.cashInTransitLimit,
    includeItems: true
  });
  const rows = (result.rows || []).map((row) => ({ ...row, asOf: filters.asOf }));
  const displayed = summarizeCashInTransitRows(rows, filters.cashInTransitLimit);
  const summary = result.summary || {};
  const overdueSummary = summary.overdueSummary || displayed.overdueSummary;
  return {
    ...displayed,
    totalAmount: number(summary.difference ?? displayed.totalAmount),
    staffCount: summary.staffCount || displayed.staffCount,
    totalRows: number(summary.totalRows ?? displayed.totalRows),
    overdueSummary: {
      count: overdueSummary.count === null || overdueSummary.count === undefined ? null : number(overdueSummary.count),
      amount: overdueSummary.amount === null || overdueSummary.amount === undefined ? null : number(overdueSummary.amount),
      oldestAgeDays: overdueSummary.oldestAgeDays === null || overdueSummary.oldestAgeDays === undefined ? null : number(overdueSummary.oldestAgeDays)
    },
    truncated: Boolean(result.truncated || displayed.truncated),
    limit: result.limit || filters.cashInTransitLimit
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
    message: 'Chua ho tro doi soat ngan hang'
  };
}

function unavailableQueue() {
  return { count: null, amount: null, oldestAgeDays: null };
}

async function loadSection(name, loader, { required = false } = {}) {
  const startedAt = Date.now();
  try {
    const data = await loader();
    return { name, required, status: 'ok', data, error: null, durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      name,
      required,
      status: 'error',
      data: null,
      error: {
        code: error.code || `${String(name).toUpperCase()}_LOAD_FAILED`,
        message: error.message || 'Khong tai duoc du lieu'
      },
      durationMs: Date.now() - startedAt
    };
  }
}

function responseErrorFromSection(section) {
  const error = new Error(section?.error?.message || 'Khong tai duoc tong quan quy tien');
  error.status = 500;
  error.code = section?.error?.code || 'FUND_DASHBOARD_REQUIRED_SECTION_FAILED';
  return error;
}

async function getFundDashboard(query = {}) {
  const startedAt = Date.now();
  const filters = normalizeDashboardQuery(query);
  const balancesSection = await loadSection('balances', () => loadBalances(filters), { required: true });
  if (balancesSection.status !== 'ok') throw responseErrorFromSection(balancesSection);

  const [pendingSection, shortageSection, cashInTransitSection, recentSection] = await Promise.all([
    loadSection('pendingRemittances', () => loadPendingRemittances(filters)),
    loadSection('unresolvedShortages', () => loadUnresolvedShortages(filters)),
    loadSection('cashInTransit', () => loadCashInTransit(filters)),
    loadSection('recentTransactions', () => loadRecentTransactions(filters))
  ]);

  const sections = {
    balances: balancesSection,
    pendingRemittances: pendingSection,
    unresolvedShortages: shortageSection,
    cashInTransit: cashInTransitSection,
    recentTransactions: recentSection
  };
  const errors = Object.values(sections)
    .filter((section) => section.status === 'error')
    .map((section) => ({ section: section.name, ...section.error }));

  const pending = pendingSection.data || unavailableQueue();
  const shortages = shortageSection.data || unavailableQueue();
  const transit = cashInTransitSection.data || {
    totalAmount: null,
    staffCount: null,
    totalRows: null,
    overdueSummary: unavailableQueue(),
    items: [],
    truncated: false,
    limit: filters.cashInTransitLimit
  };
  const overdueDeliveryCash = cashInTransitSection.data ? transit.overdueSummary : unavailableQueue();
  const status = errors.length ? 'partial' : 'ok';

  return {
    success: true,
    ok: true,
    status,
    data: {
      contractVersion: CONTRACT_VERSION,
      status,
      asOf: filters.asOf,
      generatedAt: dateUtil.nowIso(),
      timezone: filters.timezone,
      balances: {
        cash: balancesSection.data.cash,
        bank: balancesSection.data.bank
      },
      workQueues: {
        pendingRemittances: pending,
        overdueDeliveryCash,
        unresolvedShortages: shortages,
        unclassifiedShortages: shortages,
        unmatchedBankTransactions: emptyUnsupportedBankQueue()
      },
      cashInTransit: transit,
      recentTransactions: recentSection.data || [],
      sections,
      limits: {
        recentLimit: filters.recentLimit,
        cashInTransitLimit: filters.cashInTransitLimit
      },
      source: {
        balances: 'fundLedgers via FundBalanceReadService',
        cashInTransit: 'DeliveryCashInTransitReportService',
        pendingRemittances: 'deliveryCashSubmissions.remittanceLines via canonical resolver',
        shortages: 'deliveryCashShortages outstanding queue',
        recentTransactions: 'fundLedgers via fundLedgerRepository'
      },
      performance: {
        durationMs: Date.now() - startedAt,
        sectionDurations: Object.fromEntries(Object.entries(sections).map(([key, section]) => [key, section.durationMs]))
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
    dayDiff: safeDayDiff,
    isValidDateOnly,
    parseDashboardDate,
    mapBalance,
    pendingFromSubmission,
    groupLedgersBySubmission,
    summarizeCashInTransitRows,
    loadPendingRemittances,
    loadUnresolvedShortages,
    normalizeCashInTransitRow,
    mapRecentLedger
  }
};
