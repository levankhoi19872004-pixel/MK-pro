'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');

const ArLedger = require('../../models/ArLedger');
const FundLedger = require('../../models/FundLedger');

const MONEY_TOLERANCE = Number(process.env.DELIVERY_CASH_IN_TRANSIT_TOLERANCE || 1000);

function dateOnly(value) {
  return dateUtil.toDateOnly(value || dateUtil.todayVN());
}

function activeLedgerMatch() {
  return {
    status: { $nin: ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed'] },
    reversed: { $ne: true }
  };
}

function dateMatch(query = {}, field = 'date') {
  const exact = dateUtil.toDateOnly(query.date || query.deliveryDate || '');
  const dateFrom = dateUtil.toDateOnly(query.dateFrom || query.from || '');
  const dateTo = dateUtil.toDateOnly(query.dateTo || query.to || '');

  if (exact) return { [field]: exact };

  const range = {};
  if (dateFrom) range.$gte = dateFrom;
  if (dateTo) range.$lte = dateTo;

  return Object.keys(range).length ? { [field]: range } : {};
}

function normalizeStaffCode(value) {
  return String(value || '').trim();
}

function normalizeStaffName(value) {
  return String(value || '').trim();
}

function mergeUnique(values = []) {
  return Array.from(new Set(
    values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  ));
}

function statusOf(collectedCash, submittedCash) {
  const diff = Math.round(toNumber(collectedCash) - toNumber(submittedCash));

  if (Math.abs(diff) <= MONEY_TOLERANCE) return 'settled';

  // collected > submitted: NVGH còn phải nộp.
  if (diff > MONEY_TOLERANCE) return 'pending';

  // submitted > collected: nộp thừa hoặc ledger lệch.
  return 'mismatch';
}

function buildKey(row = {}) {
  return `${normalizeStaffCode(row.deliveryStaffCode)}|${dateOnly(row.date || row.deliveryDate)}`;
}

function dayDiff(fromDate, toDate) {
  const from = dateUtil.toDateOnly(fromDate, '');
  const to = dateUtil.toDateOnly(toDate, '');
  if (!from || !to) return 0;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.max(0, Math.floor((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / (24 * 60 * 60 * 1000)));
}

async function aggregateCollectedCash(query = {}) {
  const staffCode = normalizeStaffCode(query.deliveryStaffCode || query.staffCode || query.delivery || '');

  const pipeline = [
    {
      $match: {
        type: 'ar_receipt',
        account: 'AR',
        ...activeLedgerMatch(),
        $and: [
          {
            $or: [
              { source: { $in: ['delivery_settlement', 'mobile_delivery_accounting_confirmed'] } },
              { refType: { $in: ['MOBILE_DELIVERY_ACCOUNTING', 'DELIVERY_SETTLEMENT'] } },

              // Fallback cho dữ liệu cũ vì source/method có thể chưa được lưu.
              { id: /MOBILE-DELIVERY-CASH/i },
              { code: /MOBILE-DELIVERY-CASH/i },
              { id: /DELIVERY-CASH/i },
              { code: /DELIVERY-CASH/i }
            ]
          },
          {
            $or: [
              { method: { $in: ['cash', 'CASH'] } },
              { paymentMethod: { $in: ['cash', 'CASH'] } },

              // Fallback cho data cũ.
              { id: /CASH/i },
              { code: /CASH/i }
            ]
          }
        ]
      }
    },
    {
      $project: {
        date: { $ifNull: ['$deliveryDate', '$date'] },
        deliveryStaffCode: { $ifNull: ['$deliveryStaffCode', '$staffCode'] },
        deliveryStaffName: { $ifNull: ['$deliveryStaffName', '$staffName'] },
        masterOrderCode: { $ifNull: ['$masterOrderCode', '$deliveryMasterCode'] },
        amount: {
          $convert: {
            input: { $ifNull: ['$credit', '$amount'] },
            to: 'double',
            onError: 0,
            onNull: 0
          }
        }
      }
    },
    { $match: { deliveryStaffCode: { $nin: [null, ''] }, ...dateMatch(query, 'date') } }
  ];

  if (staffCode) {
    pipeline.push({ $match: { deliveryStaffCode: staffCode } });
  }

  pipeline.push({
    $group: {
      _id: {
        deliveryStaffCode: '$deliveryStaffCode',
        date: '$date'
      },
      deliveryStaffName: { $max: '$deliveryStaffName' },
      collectedCash: { $sum: '$amount' },
      masterOrderCodes: { $addToSet: '$masterOrderCode' }
    }
  });

  return ArLedger.aggregate(pipeline);
}

async function aggregateSubmittedCash(query = {}) {
  const staffCode = normalizeStaffCode(query.deliveryStaffCode || query.staffCode || query.delivery || '');

  const pipeline = [
    {
      $match: {
        sourceType: 'DELIVERY_CASH_SUBMISSION',
        fundType: 'cash',
        direction: 'in',
        ...activeLedgerMatch()
      }
    },
    {
      $project: {
        date: { $ifNull: ['$deliveryDate', '$date'] },
        deliveryStaffCode: { $ifNull: ['$deliveryStaffCode', '$staffCode'] },
        deliveryStaffName: { $ifNull: ['$deliveryStaffName', '$staffName'] },
        amount: {
          $convert: {
            input: '$amount',
            to: 'double',
            onError: 0,
            onNull: 0
          }
        },
        submissionCode: { $ifNull: ['$sourceCode', '$code'] }
      }
    },
    { $match: { deliveryStaffCode: { $nin: [null, ''] }, ...dateMatch(query, 'date') } }
  ];

  if (staffCode) {
    pipeline.push({ $match: { deliveryStaffCode: staffCode } });
  }

  pipeline.push({
    $group: {
      _id: {
        deliveryStaffCode: '$deliveryStaffCode',
        date: '$date'
      },
      deliveryStaffName: { $max: '$deliveryStaffName' },
      submittedCash: { $sum: '$amount' },
      submissionCodes: { $addToSet: '$submissionCode' }
    }
  });

  return FundLedger.aggregate(pipeline);
}

function moneyExpression(path) {
  return {
    $convert: {
      input: path,
      to: 'double',
      onError: 0,
      onNull: 0
    }
  };
}

function pipelineDateMatch(query = {}) {
  return dateMatch(query, 'date');
}

function rowAgeExpression(asOf) {
  return {
    $max: [
      0,
      {
        $dateDiff: {
          startDate: {
            $dateFromString: {
              dateString: { $substrBytes: [{ $toString: '$date' }, 0, 10] },
              format: '%Y-%m-%d',
              onError: new Date('1970-01-01T00:00:00.000Z'),
              onNull: new Date('1970-01-01T00:00:00.000Z')
            }
          },
          endDate: new Date(`${asOf}T00:00:00.000Z`),
          unit: 'day'
        }
      }
    ]
  };
}

function statusExpression() {
  return {
    $switch: {
      branches: [
        { case: { $lte: [{ $abs: '$difference' }, MONEY_TOLERANCE] }, then: 'settled' },
        { case: { $gt: ['$difference', MONEY_TOLERANCE] }, then: 'pending' }
      ],
      default: 'mismatch'
    }
  };
}

function deliveryCashInTransitPipeline(query = {}) {
  const staffCode = normalizeStaffCode(query.deliveryStaffCode || query.staffCode || query.delivery || '');
  const statusFilter = String(query.status || '').trim().toLowerCase();
  const asOf = dateUtil.toDateOnly(query.dateTo || query.to || query.date || query.deliveryDate || dateUtil.todayVN(), dateUtil.todayVN());
  const limit = Math.max(0, Math.trunc(Number(query.limit || 0)) || 0);
  const includeItems = query.includeItems !== false && query.summaryOnly !== true;
  const dateFilter = pipelineDateMatch(query);
  const collectedStaffMatch = staffCode ? [{ $match: { deliveryStaffCode: staffCode } }] : [];
  const submittedStaffMatch = staffCode ? [{ $match: { deliveryStaffCode: staffCode } }] : [];
  const statusStages = statusFilter && statusFilter !== 'all' ? [{ $match: { status: statusFilter } }] : [];
  const itemStages = includeItems
    ? [
        { $sort: { date: -1, deliveryStaffCode: 1 } },
        ...(limit > 0 ? [{ $limit: limit }] : []),
        {
          $project: {
            _id: 0,
            deliveryStaffCode: 1,
            deliveryStaffName: 1,
            date: 1,
            collectedCash: 1,
            submittedCash: 1,
            difference: 1,
            masterOrderCodes: 1,
            submissionCodes: 1,
            status: 1
          }
        }
      ]
    : [];

  return {
    limit,
    includeItems,
    pipeline: [
      {
        $match: {
          type: 'ar_receipt',
          account: 'AR',
          ...activeLedgerMatch(),
          $and: [
            {
              $or: [
                { source: { $in: ['delivery_settlement', 'mobile_delivery_accounting_confirmed'] } },
                { refType: { $in: ['MOBILE_DELIVERY_ACCOUNTING', 'DELIVERY_SETTLEMENT'] } },
                { id: /MOBILE-DELIVERY-CASH/i },
                { code: /MOBILE-DELIVERY-CASH/i },
                { id: /DELIVERY-CASH/i },
                { code: /DELIVERY-CASH/i }
              ]
            },
            {
              $or: [
                { method: { $in: ['cash', 'CASH'] } },
                { paymentMethod: { $in: ['cash', 'CASH'] } },
                { id: /CASH/i },
                { code: /CASH/i }
              ]
            }
          ]
        }
      },
      {
        $project: {
          date: { $ifNull: ['$deliveryDate', '$date'] },
          deliveryStaffCode: { $ifNull: ['$deliveryStaffCode', '$staffCode'] },
          deliveryStaffName: { $ifNull: ['$deliveryStaffName', '$staffName'] },
          masterOrderCode: { $ifNull: ['$masterOrderCode', '$deliveryMasterCode'] },
          collectedCash: moneyExpression({ $ifNull: ['$credit', '$amount'] }),
          submittedCash: { $literal: 0 },
          submissionCode: { $literal: '' }
        }
      },
      { $match: { deliveryStaffCode: { $nin: [null, ''] }, ...dateFilter } },
      ...collectedStaffMatch,
      {
        $unionWith: {
          coll: FundLedger.collection.name,
          pipeline: [
            {
              $match: {
                sourceType: 'DELIVERY_CASH_SUBMISSION',
                fundType: 'cash',
                direction: 'in',
                ...activeLedgerMatch()
              }
            },
            {
              $project: {
                date: { $ifNull: ['$deliveryDate', '$date'] },
                deliveryStaffCode: { $ifNull: ['$deliveryStaffCode', '$staffCode'] },
                deliveryStaffName: { $ifNull: ['$deliveryStaffName', '$staffName'] },
                masterOrderCode: { $literal: '' },
                collectedCash: { $literal: 0 },
                submittedCash: moneyExpression('$amount'),
                submissionCode: { $ifNull: ['$sourceCode', '$code'] }
              }
            },
            { $match: { deliveryStaffCode: { $nin: [null, ''] }, ...dateFilter } },
            ...submittedStaffMatch
          ]
        }
      },
      {
        $group: {
          _id: {
            deliveryStaffCode: '$deliveryStaffCode',
            date: '$date'
          },
          deliveryStaffName: { $max: '$deliveryStaffName' },
          collectedCash: { $sum: '$collectedCash' },
          submittedCash: { $sum: '$submittedCash' },
          masterOrderCodes: { $addToSet: '$masterOrderCode' },
          submissionCodes: { $addToSet: '$submissionCode' }
        }
      },
      {
        $project: {
          _id: 0,
          deliveryStaffCode: '$_id.deliveryStaffCode',
          deliveryStaffName: { $ifNull: ['$deliveryStaffName', '$_id.deliveryStaffCode'] },
          date: '$_id.date',
          collectedCash: { $round: ['$collectedCash', 0] },
          submittedCash: { $round: ['$submittedCash', 0] },
          difference: { $round: [{ $subtract: ['$collectedCash', '$submittedCash'] }, 0] },
          masterOrderCodes: {
            $filter: { input: '$masterOrderCodes', as: 'code', cond: { $ne: ['$$code', ''] } }
          },
          submissionCodes: {
            $filter: { input: '$submissionCodes', as: 'code', cond: { $ne: ['$$code', ''] } }
          }
        }
      },
      { $addFields: { status: statusExpression() } },
      ...statusStages,
      { $addFields: { ageDays: rowAgeExpression(asOf) } },
      {
        $facet: {
          rows: itemStages,
          summary: [
            {
              $group: {
                _id: null,
                totalRows: { $sum: 1 },
                collectedCash: { $sum: '$collectedCash' },
                submittedCash: { $sum: '$submittedCash' },
                difference: { $sum: '$difference' },
                pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                settled: { $sum: { $cond: [{ $eq: ['$status', 'settled'] }, 1, 0] } },
                mismatch: { $sum: { $cond: [{ $eq: ['$status', 'mismatch'] }, 1, 0] } },
                staffCodes: { $addToSet: '$deliveryStaffCode' },
                overdueCount: {
                  $sum: { $cond: [{ $and: [{ $eq: ['$status', 'pending'] }, { $gt: ['$ageDays', 1] }] }, 1, 0] }
                },
                overdueAmount: {
                  $sum: { $cond: [{ $and: [{ $eq: ['$status', 'pending'] }, { $gt: ['$ageDays', 1] }] }, { $max: [0, '$difference'] }, 0] }
                },
                oldestAgeDays: {
                  $max: { $cond: [{ $and: [{ $eq: ['$status', 'pending'] }, { $gt: ['$ageDays', 1] }] }, '$ageDays', 0] }
                }
              }
            },
            {
              $project: {
                _id: 0,
                totalRows: 1,
                collectedCash: 1,
                submittedCash: 1,
                difference: 1,
                pending: 1,
                settled: 1,
                mismatch: 1,
                staffCount: { $size: '$staffCodes' },
                tolerance: { $literal: MONEY_TOLERANCE },
                overdueSummary: {
                  count: '$overdueCount',
                  amount: '$overdueAmount',
                  oldestAgeDays: '$oldestAgeDays'
                }
              }
            }
          ]
        }
      }
    ]
  };
}

async function listDeliveryCashInTransit(query = {}) {
  const { pipeline, limit, includeItems } = deliveryCashInTransitPipeline(query);
  const [result = {}] = await ArLedger.aggregate(pipeline);
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const summary = result.summary && result.summary[0] ? result.summary[0] : {
    totalRows: 0,
    collectedCash: 0,
    submittedCash: 0,
    difference: 0,
    pending: 0,
    settled: 0,
    mismatch: 0,
    staffCount: new Set(rows.map((row) => row.deliveryStaffCode).filter(Boolean)).size,
    tolerance: MONEY_TOLERANCE,
    overdueSummary: {
      count: 0,
      amount: 0,
      oldestAgeDays: 0
    }
  };

  return {
    report: 'delivery_cash_in_transit',
    rows,
    truncated: includeItems && limit > 0 && Number(summary.totalRows || 0) > rows.length,
    limit: limit || null,
    summary
  };
}

module.exports = {
  listDeliveryCashInTransit
};
