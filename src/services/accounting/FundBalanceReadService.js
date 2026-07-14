'use strict';

const fundLedgerRepository = require('../../repositories/fundLedgerRepository');
const dateUtil = require('../../utils/date.util');
const {
  activeDocumentFilter,
  firstNonBlankExpression,
  normalizedDateFieldExpression,
  stringExpression
} = require('../dashboard/DashboardMongoExpressions');
const FundLedgerBalancePolicy = require('./FundLedgerBalancePolicy');
const HistoricalFundOwnershipPolicy = FundLedgerBalancePolicy.HistoricalFundOwnershipPolicy;

const DEFAULT_TIMEZONE = dateUtil.VIETNAM_TIME_ZONE || 'Asia/Ho_Chi_Minh';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_EXPORT_LIMIT = 50000;
const BLOCKED_STATUSES = Object.freeze([
  'draft',
  'pending',
  'submitted',
  'void',
  'voided',
  'cancelled',
  'canceled',
  'deleted',
  'removed',
  'duplicate_cancelled',
  'superseded',
  'reversed'
]);
const CONFIRMED_ACCOUNTING_STATUSES = Object.freeze([
  'confirmed',
  'posted',
  'locked',
  'accounting_confirmed'
]);

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function upper(value) {
  return text(value).toUpperCase();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function truthy(value) {
  return value === true || value === 1 || ['true', '1', 'yes', 'y'].includes(lower(value));
}

function escapeRegex(value) {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeDateOnly(value, fallback = '') {
  return dateUtil.toDateOnly(value || '', fallback);
}

function normalizeQuery(query = {}) {
  const timezone = text(query.timezone || DEFAULT_TIMEZONE) || DEFAULT_TIMEZONE;
  const dateTo = normalizeDateOnly(query.dateTo || query.toDate || query.to || query.date || '', dateUtil.todayVN());
  const dateFrom = normalizeDateOnly(query.dateFrom || query.fromDate || query.from || query.date || '', dateTo);
  if (!dateFrom || !dateTo) {
    const error = new Error('Khoảng ngày sổ quỹ không hợp lệ');
    error.status = 400;
    error.code = 'INVALID_FUND_DATE_RANGE';
    throw error;
  }
  if (dateFrom > dateTo) {
    const error = new Error('Từ ngày phải nhỏ hơn hoặc bằng Đến ngày');
    error.status = 400;
    error.code = 'INVALID_FUND_DATE_RANGE';
    throw error;
  }

  const requestedLimit = Math.max(1, Math.trunc(Number(query.limit || DEFAULT_LIMIT)) || DEFAULT_LIMIT);
  const full = truthy(query.full || query.export);
  const limitCap = full ? MAX_EXPORT_LIMIT : MAX_LIMIT;
  const limit = Math.min(requestedLimit, limitCap);
  const page = full ? 1 : Math.max(1, Math.trunc(Number(query.page || 1)) || 1);
  const fundType = ['cash', 'bank'].includes(lower(query.fundType)) ? lower(query.fundType) : '';
  const account = upper(query.bankAccountCode || query.fundAccountCode || query.account || '');
  const direction = ['in', 'out'].includes(lower(query.direction)) ? lower(query.direction) : '';

  return {
    dateFrom,
    dateTo,
    timezone,
    fundType,
    account,
    direction,
    sourceType: text(query.sourceType || query.refType || ''),
    q: text(query.q || query.search || ''),
    tenantId: text(query.tenantId || ''),
    page,
    limit,
    requestedLimit,
    limitCapped: requestedLimit > limitCap,
    full,
    debug: truthy(query.debug) || process.env.FUND_BALANCE_DIAGNOSTICS === '1'
  };
}

/**
 * Canonical read policy for posted fundLedgers.
 * Reversal rows remain excluded according to the current MK-Pro fund contract:
 * the original row is marked reversed/voided and both sides are removed from the
 * active balance projection. This phase does not alter posting/reversal semantics.
 */
function fundLedgerCanonicalFilter(extra = {}) {
  const canonical = {
    ...activeDocumentFilter(),
    active: { $ne: false },
    isDeleted: { $ne: true },
    deletedAt: { $in: [null, ''] },
    status: { $nin: BLOCKED_STATUSES },
    reversed: { $ne: true },
    isReversal: { $ne: true },
    reversalOf: { $in: [null, ''] },
    ...FundLedgerBalancePolicy.balanceAffectingMongoFilter(),
    $or: [
      { accountingConfirmed: true },
      { accountingStatus: { $in: CONFIRMED_ACCOUNTING_STATUSES } },
      { posted: true }
    ]
  };
  return Object.keys(extra || {}).length ? { $and: [canonical, extra] } : canonical;
}

function normalizedAmountExpression() {
  const raw = { $ifNull: ['$amount', { $ifNull: ['$debit', '$credit'] }] };
  const rawText = stringExpression('amount');
  const stripped = {
    $replaceAll: {
      input: {
        $replaceAll: {
          input: { $replaceAll: { input: rawText, find: ' ', replacement: '' } },
          find: '.',
          replacement: ''
        }
      },
      find: ',',
      replacement: ''
    }
  };
  return {
    $abs: {
      $round: [
        {
          $cond: [
            { $isNumber: raw },
            { $convert: { input: raw, to: 'double', onError: 0, onNull: 0 } },
            { $convert: { input: stripped, to: 'double', onError: 0, onNull: 0 } }
          ]
        },
        0
      ]
    }
  };
}

function normalizedFundTypeExpression() {
  const explicit = { $toLower: stringExpression('fundType') };
  const account = { $toLower: firstNonBlankExpression(['account', 'fundCode', 'bankAccountCode'], '') };
  return {
    $cond: [
      {
        $or: [
          { $eq: [explicit, 'bank'] },
          { $regexMatch: { input: account, regex: 'bank|ngan|^112' } }
        ]
      },
      'bank',
      'cash'
    ]
  };
}

function normalizedDirectionExpression() {
  const explicit = { $toLower: stringExpression('direction') };
  const fallback = {
    $toLower: firstNonBlankExpression(['type', 'transactionType', 'sourceType', 'category'], '')
  };
  return {
    $switch: {
      branches: [
        { case: { $in: [explicit, ['out', 'chi', 'expense', 'payment']] }, then: 'out' },
        { case: { $in: [explicit, ['in', 'thu', 'receipt', 'income']] }, then: 'in' },
        { case: { $regexMatch: { input: fallback, regex: 'out|expense|payment|chi|withdraw|transfer[_\\s-]*out' } }, then: 'out' }
      ],
      default: 'in'
    }
  };
}

function canonicalBusinessDateExpression(timezone = DEFAULT_TIMEZONE) {
  return {
    $let: {
      vars: {
        explicitDate: normalizedDateFieldExpression('date'),
        createdAtDate: { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } }
      },
      in: {
        $cond: [
          { $gt: [{ $strLenCP: '$$explicitDate' }, 0] },
          '$$explicitDate',
          {
            $dateToString: {
              date: '$$createdAtDate',
              format: '%Y-%m-%d',
              timezone: timezone || DEFAULT_TIMEZONE,
              onNull: ''
            }
          }
        ]
      }
    }
  };
}

function normalizationStages(timezone = DEFAULT_TIMEZONE) {
  return [
    {
      $set: {
        _fundBusinessDate: canonicalBusinessDateExpression(timezone),
        _fundCanonicalSourceType: {
          $toUpper: firstNonBlankExpression(['sourceType', 'refType', 'referenceType'], '')
        },
        _fundOwnershipDeliveryDate: normalizedDateFieldExpression('deliveryDate'),
        _fundOwnershipStaff: {
          $toUpper: firstNonBlankExpression(['deliveryStaffCode', 'deliveryCode', 'nvghCode', 'deliveryStaffName'], '')
        },
        _fundType: normalizedFundTypeExpression(),
        _fundDirection: normalizedDirectionExpression(),
        _fundAmount: normalizedAmountExpression(),
        _fundCreatedAtSort: {
          $convert: {
            input: '$createdAt',
            to: 'date',
            onError: new Date(0),
            onNull: new Date(0)
          }
        }
      }
    },
    {
      $set: {
        _fundAccount: {
          $toUpper: {
            $let: {
              vars: { explicit: firstNonBlankExpression(['account', 'fundCode', 'bankAccountCode'], '') },
              in: {
                $cond: [
                  { $gt: [{ $strLenCP: '$$explicit' }, 0] },
                  '$$explicit',
                  { $cond: [{ $eq: ['$_fundType', 'bank'] }, 'BANK', 'CASH'] }
                ]
              }
            }
          }
        },
        _fundSignedAmount: {
          $cond: [
            { $eq: ['$_fundDirection', 'out'] },
            { $multiply: ['$_fundAmount', -1] },
            '$_fundAmount'
          ]
        },
        _fundOwnershipGroupKey: {
          $cond: [
            {
              $and: [
                { $gt: [{ $strLenCP: '$_fundOwnershipStaff' }, 0] },
                { $gt: [{ $strLenCP: '$_fundOwnershipDeliveryDate' }, 0] },
                { $gt: [{ $strLenCP: '$_fundType' }, 0] }
              ]
            },
            { $concat: ['$_fundOwnershipStaff', '|', '$_fundOwnershipDeliveryDate', '|', '$_fundType'] },
            ''
          ]
        },
        _fundOwnershipPartitionKey: {
          $cond: [
            {
              $and: [
                { $in: ['$_fundCanonicalSourceType', [
                  HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION,
                  HistoricalFundOwnershipPolicy.DELIVERY_CASH_SUBMISSION
                ]] },
                { $gt: [{ $strLenCP: '$_fundOwnershipGroupKey' }, 0] }
              ]
            },
            '$_fundOwnershipGroupKey',
            { $concat: ['ROW|', { $toString: '$_id' }] }
          ]
        }
      }
    },
    {
      $set: {
        _fundPartitionKey: { $concat: ['$_fundType', ':', '$_fundAccount'] }
      }
    }
  ];
}

function historicalOwnershipResolutionStages() {
  return [
    {
      $setWindowFields: {
        partitionBy: '$_fundOwnershipPartitionKey',
        output: {
          _phase258cOpaGroupAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$_fundCanonicalSourceType', HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION] },
                    { $eq: ['$_fundDirection', 'in'] }
                  ]
                },
                '$_fundAmount',
                0
              ]
            },
            window: { documents: ['unbounded', 'unbounded'] }
          },
          _phase258cDcsGroupAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$_fundCanonicalSourceType', HistoricalFundOwnershipPolicy.DELIVERY_CASH_SUBMISSION] },
                    { $eq: ['$_fundDirection', 'in'] }
                  ]
                },
                '$_fundAmount',
                0
              ]
            },
            window: { documents: ['unbounded', 'unbounded'] }
          },
          _phase258cOpaGroupRows: {
            $sum: {
              $cond: [
                { $eq: ['$_fundCanonicalSourceType', HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION] },
                1,
                0
              ]
            },
            window: { documents: ['unbounded', 'unbounded'] }
          },
          _phase258cDcsGroupRows: {
            $sum: {
              $cond: [
                { $eq: ['$_fundCanonicalSourceType', HistoricalFundOwnershipPolicy.DELIVERY_CASH_SUBMISSION] },
                1,
                0
              ]
            },
            window: { documents: ['unbounded', 'unbounded'] }
          }
        }
      }
    },
    {
      $set: {
        _phase258cOpaSupersededByDcs: {
          $and: [
            { $eq: ['$_fundCanonicalSourceType', HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION] },
            { $eq: ['$_fundDirection', 'in'] },
            { $gt: [{ $strLenCP: '$_fundOwnershipGroupKey' }, 0] },
            { $gt: ['$_phase258cOpaGroupAmount', 0] },
            { $eq: ['$_phase258cOpaGroupAmount', '$_phase258cDcsGroupAmount'] },
            { $gt: ['$_phase258cDcsGroupRows', 0] }
          ]
        },
        _phase258cOwnershipClassification: {
          $switch: {
            branches: [
              {
                case: {
                  $and: [
                    { $eq: ['$_fundCanonicalSourceType', HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION] },
                    { $eq: ['$_fundDirection', 'in'] },
                    { $gt: [{ $strLenCP: '$_fundOwnershipGroupKey' }, 0] },
                    { $gt: ['$_phase258cOpaGroupAmount', 0] },
                    { $eq: ['$_phase258cOpaGroupAmount', '$_phase258cDcsGroupAmount'] },
                    { $gt: ['$_phase258cDcsGroupRows', 0] }
                  ]
                },
                then: HistoricalFundOwnershipPolicy.CLASSIFICATION.PROVEN_DUPLICATE
              },
              {
                case: {
                  $and: [
                    { $eq: ['$_fundCanonicalSourceType', HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION] },
                    { $gt: ['$_phase258cDcsGroupAmount', 0] },
                    { $ne: ['$_phase258cOpaGroupAmount', '$_phase258cDcsGroupAmount'] }
                  ]
                },
                then: HistoricalFundOwnershipPolicy.CLASSIFICATION.PARTIAL_OVERLAP
              },
              {
                case: { $eq: ['$_fundCanonicalSourceType', HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION] },
                then: HistoricalFundOwnershipPolicy.CLASSIFICATION.LEGACY_ONLY
              }
            ],
            default: HistoricalFundOwnershipPolicy.CLASSIFICATION.NOT_APPLICABLE
          }
        }
      }
    },
    { $match: { _phase258cOpaSupersededByDcs: { $ne: true } } }
  ];
}

function buildBalanceScopeMatch(filters = {}) {
  const clauses = [];
  if (filters.fundType) clauses.push({ fundType: filters.fundType });
  if (filters.account) {
    clauses.push({
      $or: [
        { account: filters.account },
        { fundCode: filters.account },
        { bankAccountCode: filters.account }
      ]
    });
  }
  if (filters.tenantId) clauses.push({ tenantId: filters.tenantId });
  if (!clauses.length) return {};
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function buildNormalizedScopeMatch(filters = {}) {
  const match = {
    _fundBusinessDate: { $ne: '' },
    _fundAmount: { $gt: 0 },
    _fundDirection: { $in: ['in', 'out'] }
  };
  if (filters.fundType) match._fundType = filters.fundType;
  if (filters.account) match._fundAccount = filters.account;
  return match;
}

function buildEarlyDateMatch(filters = {}) {
  const range = dateUtil.dateKeyToVietnamUtcRange(filters.dateTo);
  const dateMissing = { $or: [{ date: { $exists: false } }, { date: null }, { date: '' }] };
  const createdAtBranches = [];
  if (range.endExclusive) createdAtBranches.push({ createdAt: { $lt: range.endExclusive } });
  if (range.endOfDayVN) createdAtBranches.push({ createdAt: { $lt: range.endOfDayVN } });
  return {
    $or: [
      { date: { $lte: filters.dateTo } },
      { $and: [dateMissing, { $or: createdAtBranches.length ? createdAtBranches : [{ createdAt: { $exists: true } }] }] }
    ]
  };
}

function combineScopeAndDate(filters = {}) {
  const scope = buildBalanceScopeMatch(filters);
  const date = buildEarlyDateMatch(filters);
  return Object.keys(scope).length ? { $and: [scope, date] } : date;
}

function buildListingMatch(filters = {}) {
  const clauses = [];
  if (filters.direction) clauses.push({ _fundDirection: filters.direction });
  if (filters.sourceType) {
    clauses.push({
      $or: [
        { sourceType: filters.sourceType },
        { refType: filters.sourceType },
        { referenceType: filters.sourceType }
      ]
    });
  }
  if (filters.q) {
    const rx = new RegExp(escapeRegex(filters.q), 'i');
    clauses.push({
      $or: [
        'code', 'sourceCode', 'sourceType', 'deliveryStaffCode', 'deliveryStaffName',
        'customerCode', 'customerName', 'staffCode', 'staffName', 'counterpartyCode',
        'counterpartyName', 'note', 'status'
      ].map((field) => ({ [field]: rx }))
    });
  }
  if (!clauses.length) return {};
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function buildSummaryPipeline(filters = {}) {
  const scope = combineScopeAndDate(filters);
  return [
    { $match: fundLedgerCanonicalFilter(scope) },
    ...normalizationStages(filters.timezone),
    { $match: buildNormalizedScopeMatch(filters) },
    { $match: { _fundBusinessDate: { $lte: filters.dateTo } } },
    ...historicalOwnershipResolutionStages(),
    {
      $group: {
        _id: { fundType: '$_fundType', account: '$_fundAccount' },
        openingBalance: {
          $sum: {
            $cond: [{ $lt: ['$_fundBusinessDate', filters.dateFrom] }, '$_fundSignedAmount', 0]
          }
        },
        inPeriod: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$_fundBusinessDate', filters.dateFrom] },
                  { $lte: ['$_fundBusinessDate', filters.dateTo] },
                  { $eq: ['$_fundDirection', 'in'] }
                ]
              },
              '$_fundAmount',
              0
            ]
          }
        },
        outPeriod: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$_fundBusinessDate', filters.dateFrom] },
                  { $lte: ['$_fundBusinessDate', filters.dateTo] },
                  { $eq: ['$_fundDirection', 'out'] }
                ]
              },
              '$_fundAmount',
              0
            ]
          }
        },
        cumulativeBalanceThroughDateTo: { $sum: '$_fundSignedAmount' },
        canonicalLedgerCount: { $sum: 1 },
        periodLedgerCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$_fundBusinessDate', filters.dateFrom] },
                  { $lte: ['$_fundBusinessDate', filters.dateTo] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    { $sort: { '_id.fundType': 1, '_id.account': 1 } }
  ];
}

function buildRowsPipeline(filters = {}) {
  const scope = combineScopeAndDate(filters);
  const skip = filters.full ? 0 : (filters.page - 1) * filters.limit;
  const listingMatch = buildListingMatch(filters);
  const postWindowMatch = {
    _fundBusinessDate: { $gte: filters.dateFrom, $lte: filters.dateTo },
    ...listingMatch
  };

  return [
    { $match: fundLedgerCanonicalFilter(scope) },
    ...normalizationStages(filters.timezone),
    { $match: buildNormalizedScopeMatch(filters) },
    { $match: { _fundBusinessDate: { $lte: filters.dateTo } } },
    ...historicalOwnershipResolutionStages(),
    {
      $setWindowFields: {
        partitionBy: '$_fundPartitionKey',
        sortBy: { _fundBusinessDate: 1, _fundCreatedAtSort: 1, _id: 1 },
        output: {
          _runningBalanceAfterTransaction: {
            $sum: '$_fundSignedAmount',
            window: { documents: ['unbounded', 'current'] }
          }
        }
      }
    },
    { $match: postWindowMatch },
    {
      $facet: {
        rows: [
          { $sort: { _fundBusinessDate: -1, _fundCreatedAtSort: -1, _id: -1 } },
          ...(filters.full ? [] : [{ $skip: skip }]),
          { $limit: filters.limit }
        ],
        count: [{ $count: 'total' }],
        filteredTotals: [
          {
            $group: {
              _id: { fundType: '$_fundType', direction: '$_fundDirection' },
              amount: { $sum: '$_fundAmount' },
              count: { $sum: 1 }
            }
          }
        ]
      }
    }
  ];
}

function emptyBucket() {
  return { openingBalance: 0, inPeriod: 0, outPeriod: 0, endingBalance: 0 };
}

function addBucket(target, source) {
  target.openingBalance += number(source.openingBalance);
  target.inPeriod += number(source.inPeriod);
  target.outPeriod += number(source.outPeriod);
  target.endingBalance += number(source.endingBalance);
}

function summarizeAccountRows(rows = [], filters = {}) {
  const cash = emptyBucket();
  const bank = emptyBucket();
  const accounts = [];
  let canonicalLedgerCount = 0;
  let periodLedgerCount = 0;

  for (const row of rows) {
    const openingBalance = number(row.openingBalance);
    const inPeriod = number(row.inPeriod);
    const outPeriod = number(row.outPeriod);
    const endingBalance = openingBalance + inPeriod - outPeriod;
    const cumulativeBalanceThroughDateTo = number(row.cumulativeBalanceThroughDateTo);
    if (endingBalance !== cumulativeBalanceThroughDateTo) {
      const error = new Error(`Fund balance invariant failed for ${row._id?.fundType || ''}:${row._id?.account || ''}`);
      error.code = 'FUND_BALANCE_RECONCILIATION_FAILED';
      error.details = { openingBalance, inPeriod, outPeriod, endingBalance, cumulativeBalanceThroughDateTo };
      throw error;
    }
    const account = {
      fundType: row._id?.fundType === 'bank' ? 'bank' : 'cash',
      account: text(row._id?.account || (row._id?.fundType === 'bank' ? 'BANK' : 'CASH')),
      openingBalance,
      inPeriod,
      outPeriod,
      endingBalance,
      cumulativeBalanceThroughDateTo,
      canonicalLedgerCount: number(row.canonicalLedgerCount),
      periodLedgerCount: number(row.periodLedgerCount)
    };
    accounts.push(account);
    addBucket(account.fundType === 'bank' ? bank : cash, account);
    canonicalLedgerCount += account.canonicalLedgerCount;
    periodLedgerCount += account.periodLedgerCount;
  }

  const total = emptyBucket();
  addBucket(total, cash);
  addBucket(total, bank);

  const summary = {
    period: {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      timezone: filters.timezone,
      canonicalDateField: 'date',
      legacyFallbackDateField: 'createdAt'
    },
    cash,
    bank,
    total,
    accounts,
    canonicalLedgerCount,
    periodLedgerCount,

    cashOpeningBalance: cash.openingBalance,
    cashInPeriod: cash.inPeriod,
    cashOutPeriod: cash.outPeriod,
    cashEndingBalance: cash.endingBalance,
    bankOpeningBalance: bank.openingBalance,
    bankInPeriod: bank.inPeriod,
    bankOutPeriod: bank.outPeriod,
    bankEndingBalance: bank.endingBalance,
    totalOpeningBalance: total.openingBalance,
    totalInPeriod: total.inPeriod,
    totalOutPeriod: total.outPeriod,
    totalEndingBalance: total.endingBalance,

    // Compatibility aliases. They all map to the canonical calculation above.
    cashIn: cash.inPeriod,
    cashOut: cash.outPeriod,
    cashBalance: cash.endingBalance,
    bankIn: bank.inPeriod,
    bankOut: bank.outPeriod,
    bankBalance: bank.endingBalance,
    totalIn: total.inPeriod,
    totalOut: total.outPeriod,
    totalBalance: total.endingBalance
  };
  return summary;
}

function mapRuntimeRow(row = {}) {
  const plain = { ...row };
  for (const key of [
    '_fundBusinessDate', '_fundType', '_fundDirection', '_fundAmount', '_fundSignedAmount',
    '_fundAccount', '_fundPartitionKey', '_fundCreatedAtSort', '_runningBalanceAfterTransaction',
    '_fundCanonicalSourceType', '_fundOwnershipDeliveryDate', '_fundOwnershipStaff',
    '_fundOwnershipGroupKey', '_fundOwnershipPartitionKey', '_phase258cOpaGroupAmount', '_phase258cDcsGroupAmount',
    '_phase258cOpaGroupRows', '_phase258cDcsGroupRows', '_phase258cOpaSupersededByDcs',
    '_phase258cOwnershipClassification'
  ]) delete plain[key];
  const amount = number(row._fundAmount);
  const direction = row._fundDirection === 'out' ? 'out' : 'in';
  return {
    ...plain,
    date: text(row._fundBusinessDate || row.date),
    fundType: row._fundType === 'bank' ? 'bank' : 'cash',
    account: text(row._fundAccount || row.account),
    direction,
    amount,
    inAmount: direction === 'in' ? amount : 0,
    outAmount: direction === 'out' ? amount : 0,
    runningBalanceAfterTransaction: number(row._runningBalanceAfterTransaction)
  };
}

async function getFundBalanceSummary(query = {}, options = {}) {
  const filters = query.dateFrom && query.dateTo && query.timezone ? query : normalizeQuery(query);
  const rows = await fundLedgerRepository.aggregate(buildSummaryPipeline(filters), options);
  return summarizeAccountRows(rows || [], filters);
}

async function listFundLedgers(query = {}, options = {}) {
  const filters = normalizeQuery(query);
  // Two bounded aggregation queries: one summary and one windowed/paginated row query.
  const summaryRows = await fundLedgerRepository.aggregate(buildSummaryPipeline(filters), options);
  const rowResult = await fundLedgerRepository.aggregate(buildRowsPipeline(filters), options);
  const summary = summarizeAccountRows(summaryRows || [], filters);
  const facet = rowResult?.[0] || { rows: [], count: [], filteredTotals: [] };
  const rows = (facet.rows || []).map(mapRuntimeRow);
  const total = number(facet.count?.[0]?.total);
  const filteredGroups = (facet.filteredTotals || []).map((row) => ({
    fundType: row._id?.fundType === 'bank' ? 'bank' : 'cash',
    direction: row._id?.direction === 'out' ? 'out' : 'in',
    amount: number(row.amount),
    count: number(row.count)
  }));
  const filteredRowsTotalIn = filteredGroups
    .filter((row) => row.direction === 'in')
    .reduce((sum, row) => sum + row.amount, 0);
  const filteredRowsTotalOut = filteredGroups
    .filter((row) => row.direction === 'out')
    .reduce((sum, row) => sum + row.amount, 0);

  const response = {
    fundLedgers: rows,
    rows,
    items: rows,
    summary: {
      ...summary,
      groups: filteredGroups,
      filteredRowsTotalIn,
      filteredRowsTotalOut
    },
    pagination: {
      page: filters.page,
      limit: filters.limit,
      requestedLimit: filters.requestedLimit,
      limitCapped: filters.limitCapped,
      totalRows: total,
      totalPages: total ? Math.ceil(total / filters.limit) : 0,
      hasMore: filters.full ? false : filters.page * filters.limit < total
    },
    meta: {
      page: filters.page,
      limit: filters.limit,
      requestedLimit: filters.requestedLimit,
      limitCapped: filters.limitCapped,
      total,
      totalPages: total ? Math.ceil(total / filters.limit) : 0,
      hasMore: filters.full ? false : filters.page * filters.limit < total
    }
  };

  if (filters.debug && process.env.NODE_ENV !== 'production') {
    response.diagnostics = {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      timezone: filters.timezone,
      canonicalDateField: 'date',
      legacyFallbackDateField: 'createdAt',
      openingQueryRange: `< ${filters.dateFrom}`,
      periodQueryRange: `${filters.dateFrom}..${filters.dateTo}`,
      endingQueryRange: `<= ${filters.dateTo}`,
      balanceScope: { fundType: filters.fundType || 'all', account: filters.account || 'all' },
      listingFilters: { q: filters.q, direction: filters.direction, sourceType: filters.sourceType },
      canonicalLedgerCount: summary.canonicalLedgerCount,
      periodLedgerCount: summary.periodLedgerCount,
      queryCount: 2,
      cashOpeningBalance: summary.cashOpeningBalance,
      cashInPeriod: summary.cashInPeriod,
      cashOutPeriod: summary.cashOutPeriod,
      cashEndingBalance: summary.cashEndingBalance,
      bankOpeningBalance: summary.bankOpeningBalance,
      bankInPeriod: summary.bankInPeriod,
      bankOutPeriod: summary.bankOutPeriod,
      bankEndingBalance: summary.bankEndingBalance
    };
  }
  return response;
}

function canonicalDateOfRow(row = {}, timezone = DEFAULT_TIMEZONE) {
  const explicit = normalizeDateOnly(row.date || row.accountingDate || row.postingDate || row.transactionDate || row.occurredAt || '');
  if (explicit) return explicit;
  const createdAt = row.createdAt;
  if (createdAt instanceof Date && !Number.isNaN(createdAt.getTime())) return dateUtil.dateKeyInTimeZone(createdAt, timezone);
  const raw = text(createdAt);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime()) && /[T ]\d{2}:\d{2}/.test(raw)) return dateUtil.dateKeyInTimeZone(parsed, timezone);
  return normalizeDateOnly(raw);
}

function fundTypeOfRow(row = {}) {
  const explicit = lower(row.fundType || row.fund || row.accountType);
  if (explicit === 'bank') return 'bank';
  const account = lower(row.account || row.fundCode || row.bankAccountCode);
  return account.includes('bank') || account.includes('ngan') || account.startsWith('112') ? 'bank' : 'cash';
}

function directionOfRow(row = {}) {
  const explicit = lower(row.direction);
  if (['out', 'chi', 'expense', 'payment'].includes(explicit)) return 'out';
  if (['in', 'thu', 'receipt', 'income'].includes(explicit)) return 'in';
  const fallback = lower([row.type, row.transactionType, row.sourceType, row.category].filter(Boolean).join(' '));
  return /(out|expense|payment|chi|withdraw|transfer[_\s-]*out)/i.test(fallback) ? 'out' : 'in';
}

function accountOfRow(row = {}, fundType = fundTypeOfRow(row)) {
  return upper(row.account || row.fundCode || row.bankAccountCode || (fundType === 'bank' ? 'BANK' : 'CASH'));
}

function isCanonicalFundLedgerRow(row = {}) {
  const status = lower(row.status);
  if (BLOCKED_STATUSES.includes(status)) return false;
  if (row.active === false || row.isDeleted === true || truthy(row.deleted) || text(row.deletedAt)) return false;
  if (row.reversed === true || row.isReversal === true || text(row.reversalOf)) return false;
  if (!FundLedgerBalancePolicy.affectsFundBalance(row)) return false;
  const confirmed = row.accountingConfirmed === true
    || CONFIRMED_ACCOUNTING_STATUSES.includes(lower(row.accountingStatus))
    || row.posted === true;
  if (!confirmed) return false;
  return Math.abs(number(row.amount ?? row.debit ?? row.credit)) > 0 && Boolean(canonicalDateOfRow(row));
}

function fixtureMatchesScope(row = {}, filters = {}) {
  const fundType = fundTypeOfRow(row);
  const account = accountOfRow(row, fundType);
  if (filters.fundType && fundType !== filters.fundType) return false;
  if (filters.account && account !== filters.account) return false;
  if (filters.tenantId && text(row.tenantId) !== filters.tenantId) return false;
  return true;
}

function fixtureMatchesListing(row = {}, normalized = {}, filters = {}) {
  if (filters.direction && normalized.direction !== filters.direction) return false;
  if (filters.sourceType) {
    const sourceTypes = [row.sourceType, row.refType, row.referenceType].map(text);
    if (!sourceTypes.includes(filters.sourceType)) return false;
  }
  if (filters.q) {
    const haystack = [
      row.code, row.sourceCode, row.sourceType, row.deliveryStaffCode, row.deliveryStaffName,
      row.customerCode, row.customerName, row.staffCode, row.staffName, row.counterpartyCode,
      row.counterpartyName, row.note, row.status
    ].map(lower).join(' ');
    if (!haystack.includes(lower(filters.q))) return false;
  }
  return true;
}

/**
 * Pure fixture evaluator used by unit tests and dry-run evidence. Runtime queries
 * still use Mongo aggregation/window functions and never load the whole collection.
 */
function calculateFixture(rows = [], query = {}) {
  const filters = normalizeQuery(query);
  const baseCanonicalRows = rows
    .filter(isCanonicalFundLedgerRow)
    .filter((row) => fixtureMatchesScope(row, filters));
  const ownershipByLedgerId = HistoricalFundOwnershipPolicy.classifyOwnership(
    baseCanonicalRows.filter((row) => {
      const date = canonicalDateOfRow(row, filters.timezone);
      return date && date <= filters.dateTo;
    })
  );
  const canonicalRows = baseCanonicalRows
    .filter((row) => FundLedgerBalancePolicy.affectsFundBalance(row, { ownershipByLedgerId }))
    .map((row) => {
      const fundType = fundTypeOfRow(row);
      const account = accountOfRow(row, fundType);
      const direction = directionOfRow(row);
      const amount = Math.abs(number(row.amount ?? row.debit ?? row.credit));
      const date = canonicalDateOfRow(row, filters.timezone);
      return {
        original: row,
        fundType,
        account,
        direction,
        amount,
        signedAmount: direction === 'out' ? -amount : amount,
        date,
        createdAt: text(row.createdAt),
        identity: text(row._id || row.id || row.code || row.idempotencyKey)
      };
    })
    .filter((row) => row.date && row.date <= filters.dateTo)
    .sort((a, b) => a.fundType.localeCompare(b.fundType)
      || a.account.localeCompare(b.account)
      || a.date.localeCompare(b.date)
      || a.createdAt.localeCompare(b.createdAt)
      || a.identity.localeCompare(b.identity));

  const accountMap = new Map();
  const running = new Map();
  for (const row of canonicalRows) {
    const key = `${row.fundType}:${row.account}`;
    const account = accountMap.get(key) || {
      _id: { fundType: row.fundType, account: row.account },
      openingBalance: 0,
      inPeriod: 0,
      outPeriod: 0,
      cumulativeBalanceThroughDateTo: 0,
      canonicalLedgerCount: 0,
      periodLedgerCount: 0
    };
    if (row.date < filters.dateFrom) account.openingBalance += row.signedAmount;
    else {
      account.periodLedgerCount += 1;
      if (row.direction === 'in') account.inPeriod += row.amount;
      else account.outPeriod += row.amount;
    }
    account.cumulativeBalanceThroughDateTo += row.signedAmount;
    account.canonicalLedgerCount += 1;
    accountMap.set(key, account);

    const balance = number(running.get(key)) + row.signedAmount;
    running.set(key, balance);
    row.runningBalanceAfterTransaction = balance;
  }

  const summary = summarizeAccountRows(Array.from(accountMap.values()), filters);
  const listed = canonicalRows
    .filter((row) => row.date >= filters.dateFrom && row.date <= filters.dateTo)
    .filter((row) => fixtureMatchesListing(row.original, row, filters));
  const filteredRowsTotalIn = listed.filter((row) => row.direction === 'in').reduce((sum, row) => sum + row.amount, 0);
  const filteredRowsTotalOut = listed.filter((row) => row.direction === 'out').reduce((sum, row) => sum + row.amount, 0);
  const desc = [...listed].sort((a, b) => b.date.localeCompare(a.date)
    || b.createdAt.localeCompare(a.createdAt)
    || b.identity.localeCompare(a.identity));
  const skip = filters.full ? 0 : (filters.page - 1) * filters.limit;
  const paged = desc.slice(skip, skip + filters.limit).map((row) => ({
    ...row.original,
    date: row.date,
    fundType: row.fundType,
    account: row.account,
    direction: row.direction,
    amount: row.amount,
    inAmount: row.direction === 'in' ? row.amount : 0,
    outAmount: row.direction === 'out' ? row.amount : 0,
    runningBalanceAfterTransaction: row.runningBalanceAfterTransaction
  }));
  return {
    filters,
    summary: { ...summary, filteredRowsTotalIn, filteredRowsTotalOut },
    rows: paged,
    totalRows: desc.length,
    excludedLedgerCount: rows.length - canonicalRows.length,
    ownershipClassifications: Array.from(ownershipByLedgerId.values())
  };
}

module.exports = {
  DEFAULT_TIMEZONE,
  BLOCKED_STATUSES,
  CONFIRMED_ACCOUNTING_STATUSES,
  normalizeQuery,
  fundLedgerCanonicalFilter,
  canonicalBusinessDateExpression,
  normalizationStages,
  historicalOwnershipResolutionStages,
  buildBalanceScopeMatch,
  buildEarlyDateMatch,
  buildListingMatch,
  buildSummaryPipeline,
  buildRowsPipeline,
  summarizeAccountRows,
  getFundBalanceSummary,
  listFundLedgers,
  calculateFixture,
  canonicalDateOfRow,
  fundTypeOfRow,
  directionOfRow,
  accountOfRow,
  isCanonicalFundLedgerRow,
  FundLedgerBalancePolicy
};
