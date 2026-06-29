#!/usr/bin/env node
'use strict';

require('dotenv').config();

const connectDB = require('../src/config/db');
const ReturnOrder = require('../src/models/ReturnOrder');
const SalesOrder = require('../src/models/SalesOrder');
const ArLedger = require('../src/models/ArLedger');
const returnArPostingService = require('../src/services/accounting/returnArPostingService');
const { arReturnLedgerQuery, summarizeArReturnIdempotency } = require('./lib/arReturnIdempotencyAudit');
const { requireApplyConfirmation } = require('./lib/scriptSafety');

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--fix') && !args.has('--apply');
const fix = args.has('--fix') || args.has('--apply');
if (fix) {
  requireApplyConfirmation({
    args: process.argv.slice(2),
    applyFlags: ['--fix', '--apply'],
    scriptName: 'reconcile-return-ar.js',
    requiredFlags: ['--confirm-reconcile-return-ar-fix'],
    danger: 'This reconcile can post missing AR-RETURN rows during --fix/--apply.'
  });
}
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 10000) : 10000;

const INACTIVE_STATUSES = ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'duplicate_cancelled', 'cleared'];

function clean(value = '') {
  return String(value || '').trim();
}

function activeReturnLedgerQuery() {
  return {
    status: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] },
    reversed: { $ne: true },
    isDeleted: { $ne: true },
    $or: [
      { type: 'ar_return' },
      { type: 'AR-RETURN' },
      { ledgerType: 'AR-RETURN' },
      { category: 'AR-RETURN' },
      { code: /^AR-RETURN-/ }
    ]
  };
}

function confirmedReturnOrderQuery() {
  return {
    $and: [
      {
        $or: [
          { accountingConfirmed: true },
          { accountingStatus: { $in: ['confirmed', 'locked', 'posted', 'accounting_confirmed'] } }
        ]
      },
      {
        $or: [
          { status: { $exists: false } },
          { status: null },
          { status: '' },
          { status: { $nin: INACTIVE_STATUSES } }
        ]
      }
    ]
  };
}

function activeReturnOrderQuery() {
  return {
    $and: [
      {
        $or: [
          { status: { $exists: false } },
          { status: null },
          { status: '' },
          { status: { $nin: INACTIVE_STATUSES } }
        ]
      },
      {
        $or: [
          { returnStatus: { $exists: false } },
          { returnStatus: null },
          { returnStatus: '' },
          { returnStatus: { $nin: INACTIVE_STATUSES } }
        ]
      }
    ]
  };
}

function salesOrderReturnAmountQuery() {
  return {
    $or: [
      { returnAmount: { $gt: 0 } },
      { returnedAmount: { $gt: 0 } },
      { returnAmountFromReturnOrders: { $gt: 0 } },
      { syncedReturnAmountFromReturnOrders: { $gt: 0 } },
      { totalReturnAmount: { $gt: 0 } }
    ]
  };
}

function ledgerReturnKeys(row = {}) {
  return [row.returnOrderId, row.returnOrderCode, row.sourceId, row.sourceCode, row.refId, row.refCode]
    .map(clean)
    .filter(Boolean);
}

function returnOrderKeys(row = {}) {
  return [row.id, row._id, row.code, row.returnOrderId, row.returnOrderCode]
    .map(clean)
    .filter(Boolean);
}

function salesOrderKeys(row = {}) {
  return [row.id, row._id, row.code, row.orderCode, row.salesOrderId, row.salesOrderCode, row.documentCode, row.invoiceCode]
    .map(clean)
    .filter(Boolean);
}

function returnOrderSalesOrderKeys(row = {}) {
  return [row.salesOrderId, row.salesOrderCode, row.orderId, row.orderCode, row.sourceOrderId, row.sourceOrderCode, row.deliveryOrderId, row.deliveryOrderCode]
    .map(clean)
    .filter(Boolean);
}

function positiveAmountCandidates(row = {}) {
  return [
    ['amount', row.amount],
    ['debtReduction', row.debtReduction],
    ['returnAmount', row.returnAmount],
    ['totalReturnAmount', row.totalReturnAmount],
    ['totalAmount', row.totalAmount],
    ['returnedAmount', row.returnedAmount],
    ['totalValue', row.totalValue]
  ].map(([field, value]) => ({ field, amount: Math.max(0, Math.round(Number(value || 0))) }))
    .filter((item) => item.amount > 0);
}

function ledgerAmount(row = {}) {
  return Math.max(0, Math.round(Number(row.credit ?? row.amount ?? 0)));
}

function ledgerHasCanonicalReturnOrderSource(row = {}) {
  return clean(row.sourceType).toLowerCase() === 'returnorder'
    || clean(row.sourceModel).toLowerCase() === 'returnorders'
    || Boolean(clean(row.returnOrderId || row.returnOrderCode));
}

function ledgerHasAllocationSource(row = {}) {
  const sourceFields = [row.sourceType, row.sourceModel, row.refType, row.category, row.source]
    .map((value) => clean(value).toLowerCase());
  return sourceFields.some((value) => value.includes('allocation'));
}

function preferredReturnOrderCode(row = {}) {
  return clean(row.returnOrderCode || row.returnOrderId || row.sourceCode || row.sourceId || row.refCode || row.refId);
}

function allocationSourceKey(row = {}) {
  return clean(row.sourceId || row.sourceCode || row.refId || row.refCode || row.id || row.code);
}

function pushLimited(list, item, max = 200) {
  if (list.length < max) list.push(item);
}

function firstKey(row = {}) {
  return clean(row.code || row.id || row._id || row.returnOrderCode || row.returnOrderId);
}

async function main() {
  await connectDB();

  const confirmedReturnOrders = await ReturnOrder.find(confirmedReturnOrderQuery()).limit(limit).lean();
  const allActiveReturnOrders = await ReturnOrder.find(activeReturnOrderQuery()).limit(limit * 2).lean();
  const salesOrdersWithReturnAmount = await SalesOrder.find(salesOrderReturnAmountQuery())
    .select('_id id code orderCode salesOrderId salesOrderCode documentCode invoiceCode customerId customerCode customerName returnAmount returnedAmount returnAmountFromReturnOrders syncedReturnAmountFromReturnOrders totalReturnAmount')
    .limit(limit)
    .lean();
  const allArReturns = await ArLedger.find(activeReturnLedgerQuery()).limit(limit * 5).lean();
  const allArReturnRowsForIdempotencyAudit = await ArLedger.find(arReturnLedgerQuery())
    .select('_id id code type ledgerType category status reversed isDeleted deletedAt sourceType sourceId sourceCode refId refCode returnOrderId returnOrderCode idempotencyKey amount credit customerCode customerId')
    .limit(limit * 5)
    .lean();
  const allLedgerRowsWithIdempotency = await ArLedger.find({ idempotencyKey: { $exists: true, $type: 'string', $ne: '' } })
    .select('_id id code type ledgerType category status sourceType sourceId sourceCode returnOrderId returnOrderCode idempotencyKey')
    .limit(limit * 10)
    .lean();

  const returnByKey = new Map();
  for (const ro of confirmedReturnOrders) {
    for (const key of returnOrderKeys(ro)) returnByKey.set(key, ro);
  }

  const anyReturnByKey = new Map();
  const returnBySalesOrderKey = new Map();
  for (const ro of allActiveReturnOrders) {
    for (const key of returnOrderKeys(ro)) anyReturnByKey.set(key, ro);
    for (const key of returnOrderSalesOrderKeys(ro)) {
      if (!returnBySalesOrderKey.has(key)) returnBySalesOrderKey.set(key, []);
      returnBySalesOrderKey.get(key).push(ro);
    }
  }

  const summary = {
    mode: dryRun ? 'dry-run' : 'fix',
    confirmedReturnOrders: confirmedReturnOrders.length,
    activeArReturns: allArReturns.length,
    valid: 0,
    missingArReturn: 0,
    duplicateArReturn: 0,
    amountMismatch: 0,
    customerMismatch: 0,
    orphanArReturn: 0,
    arReturnNotFromReturnOrder: 0,
    duplicateArReturnByReturnOrderCode: 0,
    duplicateArReturnSameReturnOrderAllocationSource: 0,
    arReturnAllocationSourceType: 0,
    salesOrderReturnAmountWithoutReturnOrder: 0,
    returnOrderAmountFieldMismatch: 0,
    arReturnAmountDifferentFromReturnOrderFields: 0,
    invalidReturnOrderHasAr: 0,
    fixedMissingArReturn: 0,
    fixErrors: 0,
    idempotencyAudit: summarizeArReturnIdempotency(allArReturnRowsForIdempotencyAudit, allLedgerRowsWithIdempotency).totals,
    severe: []
  };

  for (const ro of confirmedReturnOrders) {
    const reconcile = await returnArPostingService.reconcileReturnOrderAR(ro, { skipReturnOrderPatch: true, audit: false });
    if (reconcile.ok) {
      summary.valid += 1;
      continue;
    }

    if (reconcile.issues.includes('missing_ar_return')) summary.missingArReturn += 1;
    if (reconcile.issues.includes('duplicate_ar_return')) summary.duplicateArReturn += 1;
    if (reconcile.issues.includes('amount_mismatch')) summary.amountMismatch += 1;
    if (reconcile.issues.includes('customer_mismatch')) summary.customerMismatch += 1;
    if (reconcile.issues.includes('ar_return_for_invalid_return_order')) summary.invalidReturnOrderHasAr += 1;
    if ((reconcile.validation?.warnings || []).some((item) => item.code === 'return_amount_field_mismatch')) {
      summary.returnOrderAmountFieldMismatch += 1;
      if (!reconcile.issues.includes('return_order_amount_field_mismatch')) reconcile.issues.push('return_order_amount_field_mismatch');
    }

    const candidates = positiveAmountCandidates(ro);
    const candidateAmounts = new Set(candidates.map((item) => item.amount));
    if (reconcile.activeCount > 0 && candidateAmounts.size > 0 && reconcile.ledgers.some((row) => !candidateAmounts.has(ledgerAmount(row)))) {
      summary.arReturnAmountDifferentFromReturnOrderFields += 1;
      if (!reconcile.issues.includes('ar_return_amount_differs_from_return_order_fields')) reconcile.issues.push('ar_return_amount_differs_from_return_order_fields');
    }

    summary.severe.push({
      returnOrder: firstKey(ro),
      issues: reconcile.issues,
      expectedAmount: reconcile.expectedAmount,
      activeAmount: reconcile.activeAmount,
      activeCount: reconcile.activeCount,
      ledgers: reconcile.ledgers
    });

    if (fix && reconcile.issues.length === 1 && reconcile.issues[0] === 'missing_ar_return') {
      try {
        const posted = await returnArPostingService.postReturnOrderToAR(ro, { returnResult: true, audit: true });
        if (posted.posted) summary.fixedMissingArReturn += 1;
      } catch (err) {
        summary.fixErrors += 1;
        summary.severe.push({ returnOrder: firstKey(ro), issues: ['fix_failed'], error: err.message });
      }
    }
  }

  for (const so of salesOrdersWithReturnAmount) {
    const keys = salesOrderKeys(so);
    const hasReturnOrder = keys.some((key) => (returnBySalesOrderKey.get(key) || []).length > 0);
    if (!hasReturnOrder) {
      summary.salesOrderReturnAmountWithoutReturnOrder += 1;
      summary.severe.push({
        salesOrder: clean(so.code || so.orderCode || so.id),
        issues: ['salesOrder_returnAmount_without_returnOrder'],
        returnAmount: so.returnAmountFromReturnOrders || so.syncedReturnAmountFromReturnOrders || so.returnAmount || so.returnedAmount || so.totalReturnAmount || 0,
        keys
      });
    }
  }

  const ledgersByReturnOrderCode = new Map();
  const allocationSourceLedgersByReturnOrder = new Map();

  for (const ledger of allArReturns) {
    const keys = ledgerReturnKeys(ledger);
    const linkedToAnyReturnOrder = keys.some((key) => anyReturnByKey.has(key));
    const linkedToConfirmedReturnOrder = keys.some((key) => returnByKey.has(key));
    const returnCode = preferredReturnOrderCode(ledger);
    if (returnCode) {
      if (!ledgersByReturnOrderCode.has(returnCode)) ledgersByReturnOrderCode.set(returnCode, []);
      ledgersByReturnOrderCode.get(returnCode).push(ledger);
    }
    if (ledgerHasAllocationSource(ledger)) {
      summary.arReturnAllocationSourceType += 1;
      pushLimited(summary.severe, {
        arLedger: clean(ledger.code || ledger.id),
        issues: ['ar_return_sourceType_allocation_should_be_returnOrder'],
        sourceType: ledger.sourceType || '',
        sourceModel: ledger.sourceModel || '',
        refType: ledger.refType || '',
        amount: ledger.credit || ledger.amount,
        returnOrder: returnCode,
        keys
      });
      const allocationKey = `${returnCode || 'missing_return_order'}|${allocationSourceKey(ledger) || 'missing_allocation_source'}`;
      if (!allocationSourceLedgersByReturnOrder.has(allocationKey)) allocationSourceLedgersByReturnOrder.set(allocationKey, []);
      allocationSourceLedgersByReturnOrder.get(allocationKey).push(ledger);
    }
    if (!linkedToConfirmedReturnOrder) {
      summary.orphanArReturn += 1;
      pushLimited(summary.severe, {
        arLedger: clean(ledger.code || ledger.id),
        issues: ['orphan_ar_return'],
        amount: ledger.credit || ledger.amount,
        keys
      });
    }
    if (!linkedToAnyReturnOrder || !ledgerHasCanonicalReturnOrderSource(ledger)) {
      summary.arReturnNotFromReturnOrder += 1;
      pushLimited(summary.severe, {
        arLedger: clean(ledger.code || ledger.id),
        issues: ['ar_return_not_from_returnOrder'],
        sourceType: ledger.sourceType || '',
        sourceModel: ledger.sourceModel || '',
        amount: ledger.credit || ledger.amount,
        keys
      });
    }
  }

  for (const [returnOrderCode, ledgers] of ledgersByReturnOrderCode.entries()) {
    if (ledgers.length <= 1) continue;
    summary.duplicateArReturnByReturnOrderCode += 1;
    pushLimited(summary.severe, {
      returnOrder: returnOrderCode,
      issues: ['duplicate_ar_return_same_returnOrderCode'],
      activeCount: ledgers.length,
      ledgers: ledgers.map((row) => ({ id: row.id, code: row.code, sourceType: row.sourceType, amount: row.credit || row.amount }))
    });
  }

  for (const [allocationKey, ledgers] of allocationSourceLedgersByReturnOrder.entries()) {
    if (ledgers.length <= 1) continue;
    summary.duplicateArReturnSameReturnOrderAllocationSource += 1;
    pushLimited(summary.severe, {
      allocationKey,
      issues: ['duplicate_ar_return_same_allocation_source_and_returnOrder'],
      activeCount: ledgers.length,
      ledgers: ledgers.map((row) => ({ id: row.id, code: row.code, sourceType: row.sourceType, sourceId: row.sourceId, sourceCode: row.sourceCode }))
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  await require('mongoose').connection.close();
}

main().catch(async (err) => {
  console.error('[reconcile-return-ar] failed:', err);
  try { await require('mongoose').connection.close(); } catch (_) {}
  process.exit(1);
});
