#!/usr/bin/env node
'use strict';

require('dotenv').config();

const connectDB = require('../src/config/db');
const ReturnOrder = require('../src/models/ReturnOrder');
const ArLedger = require('../src/models/ArLedger');
const returnArPostingService = require('../src/services/accounting/returnArPostingService');

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--fix') && !args.has('--apply');
const fix = args.has('--fix') || args.has('--apply');
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

function firstKey(row = {}) {
  return clean(row.code || row.id || row._id || row.returnOrderCode || row.returnOrderId);
}

async function main() {
  await connectDB();

  const confirmedReturnOrders = await ReturnOrder.find(confirmedReturnOrderQuery()).limit(limit).lean();
  const allArReturns = await ArLedger.find(activeReturnLedgerQuery()).limit(limit * 5).lean();

  const arByReturnKey = new Map();
  for (const ledger of allArReturns) {
    const keys = ledgerReturnKeys(ledger);
    for (const key of keys) {
      if (!arByReturnKey.has(key)) arByReturnKey.set(key, []);
      arByReturnKey.get(key).push(ledger);
    }
  }

  const returnByKey = new Map();
  for (const ro of confirmedReturnOrders) {
    for (const key of returnOrderKeys(ro)) returnByKey.set(key, ro);
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
    invalidReturnOrderHasAr: 0,
    fixedMissingArReturn: 0,
    fixErrors: 0,
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

  for (const ledger of allArReturns) {
    const keys = ledgerReturnKeys(ledger);
    if (!keys.some((key) => returnByKey.has(key))) {
      summary.orphanArReturn += 1;
      summary.severe.push({
        arLedger: clean(ledger.code || ledger.id),
        issues: ['orphan_ar_return'],
        amount: ledger.credit || ledger.amount,
        keys
      });
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  await require('mongoose').connection.close();
}

main().catch(async (err) => {
  console.error('[reconcile-return-ar] failed:', err);
  try { await require('mongoose').connection.close(); } catch (_) {}
  process.exit(1);
});
