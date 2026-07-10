#!/usr/bin/env node
'use strict';

/**
 * Phase227 read-only audit.
 *
 * Detects AR-DEBT-ADJUSTMENT rows created by bulk delivery correction debt
 * reconcile, reconstructs the order AR balance immediately before posting, and
 * reports over-posted amounts. This script never updates or deletes data.
 */

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const {
  resolveCanonicalArOrderIdentity
} = require('../src/domain/ar/arOrderIdentity');
const {
  canProjectCanonicalAccountingLedgerToDebtReadModel,
  normalizeAccountingAmount,
  validateArLedgerContract
} = require('../src/domain/ar/arLedgerValidator');
const {
  ACTIVE_DEBT_READ_MODEL_CATEGORIES
} = require('../src/domain/ar/arDebtCategoryRegistry');

const EXCLUDED_STATUSES = new Set(['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed', 'removed', 'superseded']);
const BULK_REASON = 'Bulk ghi nhận lại điều chỉnh công nợ';

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function money(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function ledgerId(row = {}) {
  return clean(row.id || row.code || row._id);
}

function isActiveConfirmed(row = {}) {
  return upper(row.account || 'AR') === 'AR'
    && row.accountingConfirmed === true
    && clean(row.accountingStatus).toLowerCase() === 'confirmed'
    && row.active === true
    && row.reversed !== true
    && row.isDeleted !== true
    && row.deleted !== true
    && !clean(row.deletedAt)
    && !EXCLUDED_STATUSES.has(clean(row.status).toLowerCase());
}

function isReversalCategory(row = {}) {
  return /-REVERSAL$/i.test(clean(row.category || row.ledgerType));
}

function signedAmount(row = {}) {
  const amounts = normalizeAccountingAmount(row);
  return money(amounts.debit - amounts.credit);
}

function rawBalanceRows(rows = []) {
  return (rows || []).filter((row) => (
    isActiveConfirmed(row)
    && !isReversalCategory(row)
    && ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes(upper(row.category || row.ledgerType))
  ));
}

function canonicalBalanceRows(rows = []) {
  return (rows || []).filter(canProjectCanonicalAccountingLedgerToDebtReadModel);
}

function sumBalance(rows = []) {
  return money((rows || []).reduce((sum, row) => sum + signedAmount(row), 0));
}

function exclusionReasons(row = {}) {
  const reasons = [];
  if (!isActiveConfirmed(row)) reasons.push('NOT_ACTIVE_CONFIRMED');
  if (isReversalCategory(row)) reasons.push('REVERSAL_CATEGORY');
  if (!ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes(upper(row.category || row.ledgerType))) reasons.push('CATEGORY_NOT_ACTIVE_DEBT_READ_MODEL');
  const validation = validateArLedgerContract(row);
  if (!validation.ok) reasons.push(...(validation.errors || []).map((item) => clean(item.code)));
  if (isActiveConfirmed(row)
    && ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes(upper(row.category || row.ledgerType))
    && !canProjectCanonicalAccountingLedgerToDebtReadModel(row)) {
    reasons.push('CANONICAL_PROVENANCE_OR_CONTRACT_REJECTED');
  }
  return Array.from(new Set(reasons.filter(Boolean)));
}

function expectedDebtOf(adjustment = {}) {
  return money(
    adjustment.metadata?.expectedDebtAmount
    ?? adjustment.expectedDebtAmount
    ?? adjustment.newFinalDebtAmount
    ?? adjustment.debtAmount
  );
}

function buildAuditRow(adjustment = {}, priorLedgers = []) {
  const identity = resolveCanonicalArOrderIdentity({
    order: adjustment,
    allocation: adjustment,
    identity: {
      orderId: adjustment.orderId,
      orderCode: adjustment.orderCode,
      salesOrderId: adjustment.salesOrderId,
      salesOrderCode: adjustment.salesOrderCode
    }
  });
  const rawRows = rawBalanceRows(priorLedgers);
  const canonicalRows = canonicalBalanceRows(priorLedgers);
  const rawBalanceBefore = sumBalance(rawRows);
  const canonicalBalanceBefore = sumBalance(canonicalRows);
  const expectedDebtAmount = expectedDebtOf(adjustment);
  const expectedDelta = money(expectedDebtAmount - canonicalBalanceBefore);
  const postedDebit = money(adjustment.debit);
  const postedCredit = money(adjustment.credit);
  const postedDelta = money(postedDebit - postedCredit);
  const overPostedAmount = money(postedDelta - expectedDelta);
  const canonicalIds = new Set(canonicalRows.map(ledgerId));
  const excluded = rawRows
    .filter((row) => !canonicalIds.has(ledgerId(row)))
    .map((row) => ({
      ledgerId: ledgerId(row),
      category: upper(row.category || row.ledgerType),
      sourceType: clean(row.sourceType),
      reasons: exclusionReasons(row)
    }));

  let severity = 'INFO';
  if (overPostedAmount !== 0) severity = 'P0';
  else if (rawBalanceBefore !== canonicalBalanceBefore || excluded.length) severity = 'P1';

  return {
    customerCode: clean(adjustment.customerCode),
    orderCode: identity.orderCode,
    orderId: identity.orderId,
    correctionId: clean(adjustment.sourceId || adjustment.refId),
    adjustmentLedgerId: ledgerId(adjustment),
    createdAt: adjustment.createdAt || '',
    rawBalanceBefore,
    canonicalBalanceBefore,
    expectedDebtAmount,
    expectedDelta,
    postedDebit,
    postedCredit,
    postedDelta,
    overPostedAmount,
    excludedLedgerIds: excluded.map((row) => row.ledgerId),
    exclusionReasons: excluded,
    severity,
    remediationPlan: overPostedAmount !== 0
      ? {
        applyAutomatically: false,
        action: 'ACCOUNTING_SAFE_REVERSAL_PLAN_ONLY',
        originalLedgerId: ledgerId(adjustment),
        reversalDirection: overPostedAmount > 0 ? 'credit' : 'debit',
        reversalAmount: Math.abs(overPostedAmount),
        note: 'Không hard delete/sửa ledger posted. Chỉ tạo reversal sau khi kế toán phê duyệt kết quả audit.'
      }
      : null
  };
}

function adjustmentFilter(options = {}) {
  const filter = {
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
    reason: BULK_REASON
  };
  if (options.orderCode) filter.orderCode = options.orderCode;
  if (options.adjustmentLedgerId) {
    filter.$or = [
      { id: options.adjustmentLedgerId },
      { code: options.adjustmentLedgerId },
      { _id: options.adjustmentLedgerId }
    ];
  }
  return filter;
}

function orderLookupFilter(adjustment = {}) {
  const identity = resolveCanonicalArOrderIdentity({ order: adjustment, allocation: adjustment });
  const match = {
    account: 'AR',
    customerCode: clean(adjustment.customerCode),
    createdAt: { $lt: adjustment.createdAt },
    $or: [
      { orderId: { $in: identity.lookupKeys } },
      { salesOrderId: { $in: identity.lookupKeys } },
      { orderCode: { $in: identity.lookupKeys } },
      { salesOrderCode: { $in: identity.lookupKeys } },
      { sourceId: { $in: identity.lookupKeys } },
      { sourceCode: { $in: identity.lookupKeys } },
      { refId: { $in: identity.lookupKeys } },
      { refCode: { $in: identity.lookupKeys } }
    ]
  };
  return match;
}

function fixtureData() {
  const common = {
    account: 'AR',
    orderId: 'SO1783414766939439',
    orderCode: 'B0039116',
    salesOrderId: 'SO1783414766939439',
    salesOrderCode: 'B0039116',
    customerCode: '4501763',
    customerName: 'LÊ Huế',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    status: 'posted'
  };
  return {
    adjustments: [{
      ...common,
      id: 'AR-DEBT-ADJUSTMENT-DEBT-RECONCILE-B0039116',
      code: 'AR-DEBT-ADJUSTMENT-B0039116',
      category: 'AR-DEBT-ADJUSTMENT',
      ledgerType: 'AR-DEBT-ADJUSTMENT',
      entryType: 'normal',
      sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
      sourceId: 'DCOC-SO1783414766939439-2-e00b3dfcf29f',
      sourceCode: 'DCOC-SO1783414766939439-2-e00b3dfcf29f',
      refType: 'DELIVERY_CLOSEOUT_CORRECTION',
      refId: 'DCOC-SO1783414766939439-2-e00b3dfcf29f',
      refCode: 'DCOC-SO1783414766939439-2-e00b3dfcf29f',
      debit: 7909502,
      credit: 0,
      amount: 7909502,
      direction: 'debit',
      amountField: 'debit',
      idempotencyKey: 'AR-DEBT-ADJUSTMENT:DEBT-RECONCILE:B0039116:DCOC-SO1783414766939439-2-e00b3dfcf29f:7909502:v2',
      reason: BULK_REASON,
      createdAt: '2026-07-10T01:07:12.820Z',
      metadata: { currentArBalance: 0, expectedDebtAmount: 7909502, deltaDebt: 7909502 }
    }],
    ledgersByAdjustment: [[{
      ...common,
      id: 'AR-SALE-B0039116',
      code: 'AR-SALE-B0039116',
      category: 'AR-SALE',
      ledgerType: 'AR-SALE',
      entryType: 'normal',
      sourceType: 'ORDER_PAYMENT_ALLOCATION',
      sourceId: 'SO1783414766939439',
      sourceCode: 'B0039116',
      refType: 'ORDER_PAYMENT_ALLOCATION',
      refId: 'OPA-B0039116',
      refCode: 'OPA-B0039116',
      debit: 7909502,
      credit: 0,
      amount: 7909502,
      direction: 'debit',
      amountField: 'debit',
      idempotencyKey: 'AR-SALE:SO1783414766939439',
      createdAt: '2026-07-08T08:55:51.359Z'
    }]]
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const value = (prefix, fallback = '') => {
    const item = argv.find((arg) => arg.startsWith(`${prefix}=`));
    return item ? item.slice(prefix.length + 1) : fallback;
  };
  return {
    fixture: args.has('--fixture'),
    json: args.has('--json') || !args.has('--markdown'),
    orderCode: value('--order-code'),
    adjustmentLedgerId: value('--adjustment-ledger-id'),
    limit: Math.max(1, Math.min(5000, Number(value('--limit', '500')) || 500))
  };
}

async function run(options = {}) {
  let adjustments = [];
  let ledgersByAdjustment = [];
  let connectedHere = false;
  try {
    if (options.fixture) {
      ({ adjustments, ledgersByAdjustment } = fixtureData());
    } else {
      if (mongoose.connection.readyState !== 1) {
        await connectDB();
        connectedHere = true;
      }
      adjustments = await ArLedger.find(adjustmentFilter(options))
        .sort({ createdAt: 1, _id: 1 })
        .limit(options.limit || 500)
        .lean();
      for (const adjustment of adjustments) {
        const rows = await ArLedger.find(orderLookupFilter(adjustment))
          .sort({ createdAt: 1, _id: 1 })
          .limit(5000)
          .lean();
        ledgersByAdjustment.push(rows);
      }
    }

    const rows = adjustments.map((adjustment, index) => buildAuditRow(adjustment, ledgersByAdjustment[index] || []));
    return {
      phase: 227,
      dryRun: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      filter: adjustmentFilter(options),
      summary: {
        adjustmentCount: rows.length,
        p0Count: rows.filter((row) => row.severity === 'P0').length,
        p1Count: rows.filter((row) => row.severity === 'P1').length,
        totalOverPostedAmount: rows.reduce((sum, row) => sum + Math.abs(row.overPostedAmount), 0)
      },
      rows
    };
  } finally {
    if (connectedHere) await mongoose.connection.close();
  }
}

async function main() {
  const options = parseArgs();
  const report = await run(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('# Phase227 bulk debt reconcile balance lookup audit');
    console.log('');
    console.log('DRY RUN / READ ONLY — không update, không delete, không tự reversal.');
    console.log('');
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(JSON.stringify(report.rows, null, 2));
  }
  if (report.summary.p0Count > 0 && !options.fixture) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[audit-bulk-debt-reconcile-balance-lookup] failed:', err);
    try { await mongoose.connection.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  BULK_REASON,
  parseArgs,
  isActiveConfirmed,
  signedAmount,
  rawBalanceRows,
  canonicalBalanceRows,
  exclusionReasons,
  expectedDebtOf,
  buildAuditRow,
  adjustmentFilter,
  orderLookupFilter,
  fixtureData,
  run
};
