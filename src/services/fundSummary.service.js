'use strict';

const fundLedgerRepository = require('../repositories/fundLedgerRepository');
const FundSummaryDomain = require('./fund-summary/FundSummaryDomain');
const FundSummaryFilters = require('./fund-summary/FundSummaryFilters');
const FundSummaryQueryBuilder = require('./fund-summary/FundSummaryQueryBuilder');
const { buildFundSummaryWorkbook } = require('./fund-summary/FundSummaryWorkbook');

const { text } = FundSummaryDomain;
const { normalizeFilters, constants: filterConstants } = FundSummaryFilters;
const {
  buildNormalizedVoucherPipeline,
  personGroupStages,
  summarySort
} = FundSummaryQueryBuilder;
const { EXPORT_ROW_LIMIT } = filterConstants;

async function getFundSummary(query = {}, context = {}) {
  const filters = normalizeFilters(query, context);
  const skip = (filters.page - 1) * filters.limit;
  const base = buildNormalizedVoucherPipeline(filters);
  const groupStages = personGroupStages(filters);
  const result = await fundLedgerRepository.aggregate([
    ...base,
    {
      $facet: {
        rows: [...groupStages, { $sort: summarySort(filters) }, { $skip: skip }, { $limit: filters.limit }],
        peopleCount: [...groupStages, { $count: 'totalRows' }],
        totals: [
          { $match: { transactionClass: { $ne: 'TRANSFER' } } },
          {
            $group: {
              _id: null,
              totalDeposited: { $sum: '$depositedAmount' },
              totalExpense: { $sum: '$expenseAmount' },
              depositVoucherCount: { $sum: { $cond: [{ $gt: ['$depositedAmount', 0] }, 1, 0] } },
              expenseVoucherCount: { $sum: { $cond: [{ $gt: ['$expenseAmount', 0] }, 1, 0] } }
            }
          }
        ],
        transfers: [
          { $match: { transactionClass: 'TRANSFER' } },
          { $group: { _id: null, internalTransferAmount: { $sum: '$internalTransferAmount' }, internalTransferCount: { $sum: 1 } } }
        ]
      }
    }
  ]);

  const facet = result[0] || {};
  const totalRows = Number(facet.peopleCount?.[0]?.totalRows || 0);
  const totalsRow = facet.totals?.[0] || {};
  const transferRow = facet.transfers?.[0] || {};
  const totalDeposited = Number(totalsRow.totalDeposited || 0);
  const totalExpense = Number(totalsRow.totalExpense || 0);
  const rows = (facet.rows || []).map((row) => ({
    ...row,
    depositedAmount: Number(row.depositedAmount || 0),
    depositVoucherCount: Number(row.depositVoucherCount || 0),
    expenseAmount: Number(row.expenseAmount || 0),
    expenseVoucherCount: Number(row.expenseVoucherCount || 0),
    internalTransferAmount: Number(row.internalTransferAmount || 0),
    internalTransferCount: Number(row.internalTransferCount || 0),
    netAmount: Number(row.netAmount || 0)
  }));

  return {
    success: true,
    filters: {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      personCode: filters.personCode,
      personRole: filters.personRole,
      q: filters.q,
      transactionType: filters.transactionType,
      fundCode: filters.fundCode,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder
    },
    totals: {
      totalDeposited,
      totalExpense,
      netAmount: totalDeposited - totalExpense,
      totalPeople: filters.transactionType === 'transfer' ? 0 : totalRows,
      depositVoucherCount: Number(totalsRow.depositVoucherCount || 0),
      expenseVoucherCount: Number(totalsRow.expenseVoucherCount || 0),
      internalTransferAmount: Number(transferRow.internalTransferAmount || 0),
      internalTransferCount: Number(transferRow.internalTransferCount || 0)
    },
    rows,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalRows,
      totalPages: Math.ceil(totalRows / filters.limit)
    }
  };
}

async function getFundSummaryTransactions(personKey, query = {}, context = {}) {
  const filters = normalizeFilters(query, context);
  const key = text(personKey);
  if (!key || key.length > 250 || /[\0\r\n]/.test(key)) {
    const error = new Error('personKey không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_PERSON_KEY';
    throw error;
  }
  const skip = (filters.page - 1) * filters.limit;
  const result = await fundLedgerRepository.aggregate([
    ...buildNormalizedVoucherPipeline(filters, { personKey: key }),
    {
      $facet: {
        rows: [
          { $sort: { transactionAt: -1, voucherCode: -1 } },
          { $skip: skip },
          { $limit: filters.limit }
        ],
        count: [{ $count: 'totalRows' }],
        totals: [{
          $group: {
            _id: null,
            depositedAmount: { $sum: '$depositedAmount' },
            expenseAmount: { $sum: '$expenseAmount' },
            internalTransferAmount: { $sum: '$internalTransferAmount' },
            depositVoucherCount: { $sum: { $cond: [{ $gt: ['$depositedAmount', 0] }, 1, 0] } },
            expenseVoucherCount: { $sum: { $cond: [{ $gt: ['$expenseAmount', 0] }, 1, 0] } }
          }
        }]
      }
    }
  ]);
  const facet = result[0] || {};
  const totalRows = Number(facet.count?.[0]?.totalRows || 0);
  const totals = facet.totals?.[0] || {};
  return {
    success: true,
    personKey: key,
    filters: {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      personCode: filters.personCode,
      personRole: filters.personRole,
      q: filters.q,
      transactionType: filters.transactionType,
      fundCode: filters.fundCode,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder
    },
    totals: {
      depositedAmount: Number(totals.depositedAmount || 0),
      expenseAmount: Number(totals.expenseAmount || 0),
      netAmount: Number(totals.depositedAmount || 0) - Number(totals.expenseAmount || 0),
      internalTransferAmount: Number(totals.internalTransferAmount || 0),
      depositVoucherCount: Number(totals.depositVoucherCount || 0),
      expenseVoucherCount: Number(totals.expenseVoucherCount || 0)
    },
    transactions: facet.rows || [],
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalRows,
      totalPages: Math.ceil(totalRows / filters.limit)
    }
  };
}

async function exportFundSummary(query = {}, context = {}) {
  const filters = normalizeFilters({ ...query, page: 1, limit: EXPORT_ROW_LIMIT }, { ...context, exportMode: true });
  const summaryRows = await fundLedgerRepository.aggregate([
    ...buildNormalizedVoucherPipeline(filters),
    ...personGroupStages(filters),
    { $sort: summarySort(filters) },
    { $limit: EXPORT_ROW_LIMIT }
  ]);
  const detailRows = await fundLedgerRepository.aggregate([
    ...buildNormalizedVoucherPipeline(filters),
    { $sort: { transactionAt: -1, voucherCode: -1 } },
    { $limit: EXPORT_ROW_LIMIT }
  ]);

  return buildFundSummaryWorkbook(summaryRows, detailRows, filters);
}

module.exports = {
  getFundSummary,
  getFundSummaryTransactions,
  exportFundSummary,
  resolveFundCounterparty: FundSummaryDomain.resolveFundCounterparty,
  classifyTransaction: FundSummaryDomain.classifyTransaction,
  normalizeLedgerForSummary: FundSummaryDomain.normalizeLedgerForSummary,
  summarizeNormalizedTransactions: FundSummaryDomain.summarizeNormalizedTransactions,
  normalizeFilters,
  buildNormalizedVoucherPipeline,
  personKeyOf: FundSummaryDomain.personKeyOf,
  normalizeRole: FundSummaryDomain.normalizeRole,
  constants: {
    ...filterConstants,
    BLOCKED_LEDGER_STATUSES: FundSummaryDomain.constants.BLOCKED_LEDGER_STATUSES
  }
};
