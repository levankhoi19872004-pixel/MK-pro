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

async function listDeliveryCashInTransit(query = {}) {
  const [collectedRows, submittedRows] = await Promise.all([
    aggregateCollectedCash(query),
    aggregateSubmittedCash(query)
  ]);

  const map = new Map();

  for (const row of collectedRows) {
    const record = {
      deliveryStaffCode: row._id.deliveryStaffCode,
      deliveryStaffName: normalizeStaffName(row.deliveryStaffName),
      date: row._id.date,
      collectedCash: Math.round(toNumber(row.collectedCash)),
      submittedCash: 0,
      difference: 0,
      masterOrderCodes: mergeUnique(row.masterOrderCodes),
      submissionCodes: [],
      status: 'pending'
    };
    map.set(buildKey(record), record);
  }

  for (const row of submittedRows) {
    const key = buildKey({
      deliveryStaffCode: row._id.deliveryStaffCode,
      date: row._id.date
    });

    const current = map.get(key) || {
      deliveryStaffCode: row._id.deliveryStaffCode,
      deliveryStaffName: normalizeStaffName(row.deliveryStaffName),
      date: row._id.date,
      collectedCash: 0,
      submittedCash: 0,
      difference: 0,
      masterOrderCodes: [],
      submissionCodes: [],
      status: 'mismatch'
    };

    current.deliveryStaffName = current.deliveryStaffName || normalizeStaffName(row.deliveryStaffName);
    current.submittedCash += Math.round(toNumber(row.submittedCash));
    current.submissionCodes = mergeUnique([current.submissionCodes, row.submissionCodes]);

    map.set(key, current);
  }

  let rows = Array.from(map.values()).map((row) => {
    const collectedCash = Math.round(toNumber(row.collectedCash));
    const submittedCash = Math.round(toNumber(row.submittedCash));
    const difference = collectedCash - submittedCash;

    return {
      deliveryStaffCode: row.deliveryStaffCode,
      deliveryStaffName: row.deliveryStaffName || row.deliveryStaffCode,
      date: row.date,
      collectedCash,
      submittedCash,
      difference,
      masterOrderCodes: mergeUnique(row.masterOrderCodes),
      submissionCodes: mergeUnique(row.submissionCodes),
      status: statusOf(collectedCash, submittedCash)
    };
  });

  const statusFilter = String(query.status || '').trim().toLowerCase();
  if (statusFilter && statusFilter !== 'all') {
    rows = rows.filter((row) => row.status === statusFilter);
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return String(a.deliveryStaffCode).localeCompare(String(b.deliveryStaffCode));
  });

  const summary = rows.reduce((acc, row) => {
    acc.collectedCash += row.collectedCash;
    acc.submittedCash += row.submittedCash;
    acc.difference += row.difference;
    acc.totalRows += 1;
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {
    totalRows: 0,
    collectedCash: 0,
    submittedCash: 0,
    difference: 0,
    pending: 0,
    settled: 0,
    mismatch: 0,
    tolerance: MONEY_TOLERANCE
  });

  return {
    report: 'delivery_cash_in_transit',
    rows,
    summary
  };
}

module.exports = {
  listDeliveryCashInTransit
};
