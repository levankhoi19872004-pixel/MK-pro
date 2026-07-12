'use strict';

const dateUtil = require('../../utils/date.util');
const { makeId, toNumber } = require('../../utils/common.util');

const StockTransaction = require('../../models/StockTransaction');
const InventoryLegacy = require('../../models/InventoryLegacy');
const { mainInventoryFilter } = require('../inventory/mainInventoryReadPolicy');
const ArLedger = require('../../models/ArLedger');
const SalesOrder = require('../../models/SalesOrder');
const FundLedger = require('../../models/FundLedger');
const Cashbook = require('../../models/Cashbook');
const Bankbook = require('../../models/Bankbook');
const ReconciliationReport = require('../../models/ReconciliationReport');

const MONEY_TOLERANCE = Number(process.env.RECONCILIATION_MONEY_TOLERANCE || 1000);
const STOCK_TOLERANCE = Number(process.env.RECONCILIATION_STOCK_TOLERANCE || 0.0001);

function nowIso() {
  return dateUtil.nowIso ? dateUtil.nowIso() : new Date().toISOString();
}

function statusFromDiff(diff, tolerance) {
  const abs = Math.abs(toNumber(diff));
  if (abs <= tolerance) return 'ok';
  if (abs <= tolerance * 10) return 'warning';
  return 'critical';
}

function worstStatus(statuses = []) {
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  return 'ok';
}

function activeLedgerMatch() {
  return {
    status: { $nin: ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed'] },
    reversed: { $ne: true }
  };
}

function numericProjection(field, fallbackField) {
  const input = fallbackField
    ? { $ifNull: [`$${field}`, `$${fallbackField}`] }
    : `$${field}`;

  return {
    $convert: {
      input,
      to: 'double',
      onError: 0,
      onNull: 0
    }
  };
}

async function reconcileStock() {
  const [ledgerRows, inventoryRows] = await Promise.all([
    StockTransaction.aggregate([
      { $match: activeLedgerMatch() },
      {
        $project: {
          productCode: { $ifNull: ['$productCode', '$productId'] },
          quantity: numericProjection('quantity', 'qty')
        }
      },
      { $match: { productCode: { $nin: [null, ''] } } },
      {
        $group: {
          _id: '$productCode',
          ledgerQty: { $sum: '$quantity' }
        }
      }
    ]),

    InventoryLegacy.aggregate([
      { $match: mainInventoryFilter() },
      {
        $project: {
          productCode: { $ifNull: ['$productCode', '$productId'] },
          onHand: {
            $convert: {
              input: { $ifNull: ['$onHand', { $ifNull: ['$quantity', '$qty'] }] },
              to: 'double',
              onError: 0,
              onNull: 0
            }
          }
        }
      },
      { $match: { productCode: { $nin: [null, ''] } } },
      {
        $group: {
          _id: '$productCode',
          snapshotQty: { $sum: '$onHand' }
        }
      }
    ])
  ]);

  const ledgerMap = new Map(ledgerRows.map((row) => [String(row._id), toNumber(row.ledgerQty)]));
  const inventoryMap = new Map(inventoryRows.map((row) => [String(row._id), toNumber(row.snapshotQty)]));
  const productCodes = new Set([...ledgerMap.keys(), ...inventoryMap.keys()]);

  const items = [];
  for (const productCode of productCodes) {
    const ledgerQty = toNumber(ledgerMap.get(productCode));
    const snapshotQty = toNumber(inventoryMap.get(productCode));
    const diff = ledgerQty - snapshotQty;
    const status = statusFromDiff(diff, STOCK_TOLERANCE);

    if (status !== 'ok') {
      items.push({
        type: 'stock',
        productCode,
        ledgerQty,
        snapshotQty,
        diff,
        status
      });
    }
  }

  return {
    type: 'stock',
    status: worstStatus(items.map((item) => item.status)),
    summary: {
      ledgerProducts: ledgerRows.length,
      inventoryProducts: inventoryRows.length,
      mismatchCount: items.length,
      tolerance: STOCK_TOLERANCE
    },
    items
  };
}

function orderCodeProjection() {
  return {
    $ifNull: [
      '$salesOrderCode',
      {
        $ifNull: [
          '$orderCode',
          {
            $ifNull: ['$refCode', '$sourceCode']
          }
        ]
      }
    ]
  };
}

async function reconcileAR() {
  const [ledgerRows, orderRows] = await Promise.all([
    ArLedger.aggregate([
      {
        $match: {
          account: 'AR',
          ...activeLedgerMatch()
        }
      },
      {
        $project: {
          orderCode: orderCodeProjection(),
          debit: numericProjection('debit'),
          credit: numericProjection('credit')
        }
      },
      { $match: { orderCode: { $nin: [null, ''] } } },
      {
        $group: {
          _id: '$orderCode',
          ledgerDebt: { $sum: { $subtract: ['$debit', '$credit'] } }
        }
      }
    ]),

    SalesOrder.aggregate([
      {
        $project: {
          orderCode: { $ifNull: ['$code', '$orderCode'] },
          cachedDebt: {
            $convert: {
              input: { $ifNull: ['$debtAmount', { $ifNull: ['$arBalance', '$debt'] }] },
              to: 'double',
              onError: 0,
              onNull: 0
            }
          },
          accountingConfirmed: '$accountingConfirmed',
          accountingStatus: '$accountingStatus'
        }
      },
      { $match: { orderCode: { $nin: [null, ''] } } }
    ])
  ]);

  const ledgerMap = new Map(ledgerRows.map((row) => [String(row._id), toNumber(row.ledgerDebt)]));
  const orderMap = new Map(orderRows.map((row) => [String(row.orderCode), row]));
  const orderCodes = new Set([...ledgerMap.keys(), ...orderMap.keys()]);

  const items = [];
  for (const orderCode of orderCodes) {
    const ledgerDebt = toNumber(ledgerMap.get(orderCode));
    const order = orderMap.get(orderCode) || {};
    const cachedDebt = toNumber(order.cachedDebt);
    const diff = ledgerDebt - cachedDebt;
    const status = statusFromDiff(diff, MONEY_TOLERANCE);

    if (status !== 'ok') {
      items.push({
        type: 'ar',
        orderCode,
        ledgerDebt,
        cachedDebt,
        diff,
        accountingConfirmed: order.accountingConfirmed,
        accountingStatus: order.accountingStatus,
        status
      });
    }
  }

  return {
    type: 'ar',
    status: worstStatus(items.map((item) => item.status)),
    summary: {
      ledgerOrders: ledgerRows.length,
      salesOrders: orderRows.length,
      mismatchCount: items.length,
      tolerance: MONEY_TOLERANCE
    },
    items
  };
}

function cashbookAmountProjection() {
  return {
    amount: numericProjection('amount'),
    type: { $toLower: { $ifNull: ['$type', ''] } }
  };
}

async function sumCashbookLike(Model) {
  const rows = await Model.aggregate([
    { $match: activeLedgerMatch() },
    { $project: cashbookAmountProjection() },
    {
      $group: {
        _id: null,
        balance: {
          $sum: {
            $cond: [
              { $in: ['$type', ['out', 'chi', 'payment_out', 'expense']] },
              { $multiply: ['$amount', -1] },
              '$amount'
            ]
          }
        }
      }
    }
  ]);

  return toNumber(rows[0]?.balance);
}

async function reconcileFund() {
  const fundRows = await FundLedger.aggregate([
    { $match: activeLedgerMatch() },
    {
      $project: {
        fundType: { $toLower: { $ifNull: ['$fundType', '$account'] } },
        direction: { $toLower: { $ifNull: ['$direction', 'in'] } },
        amount: numericProjection('amount')
      }
    },
    {
      $group: {
        _id: '$fundType',
        balance: {
          $sum: {
            $cond: [
              { $eq: ['$direction', 'out'] },
              { $multiply: ['$amount', -1] },
              '$amount'
            ]
          }
        }
      }
    }
  ]);

  const fundBalance = fundRows.reduce((sum, row) => sum + toNumber(row.balance), 0);
  const [cashbookBalance, bankbookBalance] = await Promise.all([
    sumCashbookLike(Cashbook),
    sumCashbookLike(Bankbook)
  ]);

  const legacyBalance = cashbookBalance + bankbookBalance;
  const diff = fundBalance - legacyBalance;

  // Cashbook/bankbook là legacy reference, nên critical được hạ xuống warning trong phase migration.
  const rawStatus = statusFromDiff(diff, MONEY_TOLERANCE);
  const status = rawStatus === 'critical' ? 'warning' : rawStatus;

  const items = status === 'ok' ? [] : [{
    type: 'fund',
    fundBalance,
    cashbookBalance,
    bankbookBalance,
    legacyBalance,
    diff,
    status
  }];

  return {
    type: 'fund',
    status,
    summary: {
      fundBalance,
      cashbookBalance,
      bankbookBalance,
      legacyBalance,
      diff,
      tolerance: MONEY_TOLERANCE,
      note: 'cashbooks/bankbooks là legacy reference, lệch fund được đánh warning trước khi chốt migration.'
    },
    items
  };
}

async function saveReport(type, result, meta = {}) {
  const checkedAt = nowIso();
  const doc = {
    id: makeId('RC'),
    code: `RC-${String(type).toUpperCase()}-${Date.now()}`,
    type,
    status: result.status,
    startedAt: meta.startedAt,
    finishedAt: meta.finishedAt || checkedAt,
    durationMs: meta.durationMs,
    checkedAt,
    checkedBy: meta.checkedBy || 'system',
    source: meta.source || 'manual_api',
    summary: result.summary || {},
    items: result.items || [],
    error: result.error || '',
    createdAt: checkedAt,
    updatedAt: checkedAt
  };

  return ReconciliationReport.create(doc);
}

async function runReconciliation(type = 'all', meta = {}) {
  const startedAt = nowIso();
  const startedMs = Date.now();
  const normalizedType = String(type || 'all').toLowerCase();

  const runners = {
    stock: reconcileStock,
    ar: reconcileAR,
    fund: reconcileFund
  };

  if (normalizedType !== 'all' && !runners[normalizedType]) {
    const err = new Error(`Loại đối soát không hợp lệ: ${type}`);
    err.status = 400;
    throw err;
  }

  const results = [];
  if (normalizedType === 'all' || normalizedType === 'stock') results.push(await reconcileStock());
  if (normalizedType === 'all' || normalizedType === 'ar') results.push(await reconcileAR());
  if (normalizedType === 'all' || normalizedType === 'fund') results.push(await reconcileFund());

  const finishedAt = nowIso();
  const durationMs = Date.now() - startedMs;

  if (normalizedType !== 'all') {
    const result = results[0] || {
      type: normalizedType,
      status: 'warning',
      summary: {},
      items: []
    };

    return saveReport(normalizedType, result, {
      ...meta,
      startedAt,
      finishedAt,
      durationMs
    });
  }

  const combined = {
    type: 'all',
    status: worstStatus(results.map((item) => item.status)),
    summary: {
      stock: results.find((item) => item.type === 'stock')?.summary || {},
      ar: results.find((item) => item.type === 'ar')?.summary || {},
      fund: results.find((item) => item.type === 'fund')?.summary || {}
    },
    items: results.flatMap((item) => item.items || [])
  };

  return saveReport('all', combined, {
    ...meta,
    startedAt,
    finishedAt,
    durationMs
  });
}

async function listReports(query = {}) {
  const filter = {};
  if (query.type) filter.type = String(query.type).toLowerCase();
  if (query.status) filter.status = String(query.status).toLowerCase();

  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);

  return ReconciliationReport.find(filter)
    .sort({ checkedAt: -1, createdAt: -1 })
    .limit(limit)
    .lean();
}

module.exports = {
  reconcileStock,
  reconcileAR,
  reconcileFund,
  runReconciliation,
  listReports
};
