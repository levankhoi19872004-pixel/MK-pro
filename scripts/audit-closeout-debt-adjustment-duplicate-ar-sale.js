#!/usr/bin/env node
'use strict';

/**
 * Phase229 read-only audit.
 *
 * Detects AR-DEBT-ADJUSTMENT rows created by normal delivery closeout debt
 * reconcile when an AR-SALE for the same business order already existed.
 * The script never updates, deletes, reverses, or reposts accounting data.
 */

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const { resolveCanonicalArOrderIdentity } = require('../src/domain/ar/arOrderIdentity');
const {
  canProjectCanonicalAccountingLedgerToDebtReadModel,
  normalizeAccountingAmount,
  validateArLedgerContract
} = require('../src/domain/ar/arLedgerValidator');
const { ACTIVE_DEBT_READ_MODEL_CATEGORIES } = require('../src/domain/ar/arDebtCategoryRegistry');

const EXCLUDED_STATUSES = new Set(['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed', 'removed', 'superseded']);

function clean(value = '') { return String(value ?? '').trim(); }
function upper(value = '') { return clean(value).toUpperCase(); }
function money(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
function ledgerId(row = {}) { return clean(row.id || row.code || row._id); }

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

function signedAmount(row = {}) {
  const amounts = normalizeAccountingAmount(row);
  return money(amounts.debit - amounts.credit);
}

function isNormalCloseoutAdjustment(row = {}) {
  if (upper(row.category || row.ledgerType) !== 'AR-DEBT-ADJUSTMENT') return false;
  const sourceType = clean(row.sourceType).toLowerCase();
  const sourceModel = clean(row.sourceModel).toLowerCase();
  const reason = clean(row.reason).toLowerCase();
  const key = clean(row.idempotencyKey).toUpperCase();
  return sourceType === 'delivery_closeout'
    || (sourceModel === 'orderpaymentallocations' && reason === 'order payment debt reconcile')
    || (key.startsWith('AR-DEBT-ADJUSTMENT:DEBT-RECONCILE:') && sourceType === 'delivery_closeout');
}

function canonicalRows(rows = []) {
  return (rows || []).filter(canProjectCanonicalAccountingLedgerToDebtReadModel);
}

function rawActiveRows(rows = []) {
  return (rows || []).filter((row) => (
    isActiveConfirmed(row)
    && ACTIVE_DEBT_READ_MODEL_CATEGORIES.includes(upper(row.category || row.ledgerType))
    && !/-REVERSAL$/i.test(clean(row.category || row.ledgerType))
  ));
}

function sumBalance(rows = []) {
  return money((rows || []).reduce((sum, row) => sum + signedAmount(row), 0));
}

function expectedDebtOf(row = {}) {
  return money(
    row.metadata?.expectedDebtAmount
    ?? row.expectedDebtAmount
    ?? row.normalizedDebtAmount
    ?? row.debtAmount
  );
}

function legacyIdentityCollapse(adjustment = {}) {
  const businessKeys = Array.from(new Set([
    adjustment.salesOrderId,
    adjustment.orderId,
    adjustment.salesOrderCode,
    adjustment.orderCode
  ].map(clean).filter(Boolean)));
  const sourceType = upper(adjustment.sourceType);
  const sourceIsBusinessOrder = ['ORDER', 'SALES_ORDER', 'SALESORDER', 'SALE_ORDER', 'SALES_ORDER_DELIVERY_CLOSEOUT'].includes(sourceType);
  const sourceAliases = [adjustment.sourceId, adjustment.sourceCode].map(clean).filter(Boolean);
  const ignored = sourceIsBusinessOrder ? [] : sourceAliases;
  return {
    businessKeys,
    sourceAliases,
    ignoredSourceAliases: ignored,
    legacyLookupKeys: businessKeys.filter((value) => !ignored.includes(value)),
    collapsed: businessKeys.length > 0 && businessKeys.filter((value) => !ignored.includes(value)).length === 0
  };
}

function exclusionReasons(row = {}) {
  const reasons = [];
  if (!isActiveConfirmed(row)) reasons.push('NOT_ACTIVE_CONFIRMED');
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

function buildAuditRow(adjustment = {}, priorLedgers = []) {
  const identity = resolveCanonicalArOrderIdentity({
    identity: {
      orderId: adjustment.orderId,
      orderCode: adjustment.orderCode,
      salesOrderId: adjustment.salesOrderId,
      salesOrderCode: adjustment.salesOrderCode
    }
  });
  const rawRows = rawActiveRows(priorLedgers);
  const acceptedRows = canonicalRows(priorLedgers);
  const rawBalanceBefore = sumBalance(rawRows);
  const canonicalBalanceBefore = sumBalance(acceptedRows);
  const expectedDebtAmount = expectedDebtOf(adjustment);
  const expectedDelta = money(expectedDebtAmount - canonicalBalanceBefore);
  const postedDebit = money(adjustment.debit);
  const postedCredit = money(adjustment.credit);
  const postedDelta = money(postedDebit - postedCredit);
  const overPostedAmount = money(postedDelta - expectedDelta);
  const saleRows = acceptedRows.filter((row) => upper(row.category || row.ledgerType) === 'AR-SALE');
  const acceptedIds = new Set(acceptedRows.map(ledgerId));
  const excluded = rawRows.filter((row) => !acceptedIds.has(ledgerId(row))).map((row) => ({
    ledgerId: ledgerId(row),
    category: upper(row.category || row.ledgerType),
    sourceType: clean(row.sourceType),
    reasons: exclusionReasons(row)
  }));
  const collapse = legacyIdentityCollapse(adjustment);

  let severity = 'OK';
  if (overPostedAmount !== 0 && saleRows.length) severity = 'P0_DUPLICATE_DEBT';
  else if (collapse.collapsed || excluded.length || rawBalanceBefore !== canonicalBalanceBefore) severity = 'WARNING';

  return {
    customerCode: clean(adjustment.customerCode),
    customerName: clean(adjustment.customerName),
    orderCode: identity.orderCode,
    orderId: identity.orderId,
    adjustmentLedgerId: ledgerId(adjustment),
    adjustmentCreatedAt: clean(adjustment.createdAt),
    sourceType: clean(adjustment.sourceType),
    sourceId: clean(adjustment.sourceId),
    sourceCode: clean(adjustment.sourceCode),
    canonicalLookupKeys: identity.lookupKeys,
    legacyLookupKeys: collapse.legacyLookupKeys,
    legacyIdentityCollapsed: collapse.collapsed,
    rawBalanceBefore,
    canonicalBalanceBefore,
    expectedDebtAmount,
    expectedDelta,
    postedDebit,
    postedCredit,
    postedDelta,
    overPostedAmount,
    existingArSaleLedgerIds: saleRows.map(ledgerId),
    existingArSaleDebit: money(saleRows.reduce((sum, row) => sum + money(row.debit), 0)),
    excludedLedgerIds: excluded.map((row) => row.ledgerId),
    exclusionReasons: excluded,
    severity,
    remediationPlan: severity === 'P0_DUPLICATE_DEBT'
      ? {
        applyAutomatically: false,
        action: 'ACCOUNTING_SAFE_REVERSAL_PLAN_ONLY',
        originalLedgerId: ledgerId(adjustment),
        reversalDirection: overPostedAmount > 0 ? 'credit' : 'debit',
        reversalAmount: Math.abs(overPostedAmount),
        note: 'Không hard delete hoặc sửa ledger posted. Chỉ tạo reversal tham chiếu original ledger sau khi kế toán duyệt audit production.'
      }
      : null
  };
}

function adjustmentFilter(options = {}) {
  const filter = {
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    $or: [
      { sourceType: /^delivery_closeout$/i },
      { sourceModel: /^orderPaymentAllocations$/i, reason: /^order payment debt reconcile$/i }
    ]
  };
  if (options.orderCode) filter.orderCode = options.orderCode;
  if (options.customerCode) filter.customerCode = options.customerCode;
  return filter;
}


function serializableAdjustmentFilter(options = {}) {
  return {
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    sourceScope: [
      'sourceType matches /^delivery_closeout$/i',
      'or sourceModel matches /^orderPaymentAllocations$/i and reason matches /^order payment debt reconcile$/i'
    ],
    orderCode: clean(options.orderCode),
    customerCode: clean(options.customerCode)
  };
}

function orderLookupFilter(adjustment = {}) {
  const identity = resolveCanonicalArOrderIdentity({
    identity: {
      orderId: adjustment.orderId,
      orderCode: adjustment.orderCode,
      salesOrderId: adjustment.salesOrderId,
      salesOrderCode: adjustment.salesOrderCode
    }
  });
  const match = {
    account: 'AR',
    createdAt: { $lte: adjustment.createdAt },
    $and: [
      {
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
      },
      { $or: [{ id: { $ne: ledgerId(adjustment) } }, { id: { $exists: false } }] }
    ]
  };
  if (clean(adjustment.customerCode)) match.customerCode = clean(adjustment.customerCode);
  return match;
}

function fixtureData() {
  const common = {
    account: 'AR',
    orderId: 'SO-B0039252',
    orderCode: 'B0039252',
    salesOrderId: 'SO-B0039252',
    salesOrderCode: 'B0039252',
    customerCode: '5052875',
    customerName: 'Trung Liên',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    status: 'posted'
  };
  const adjustment = {
    ...common,
    id: 'AR-DEBT-ADJUSTMENT-DEBT-RECONCILE-B0039252',
    code: 'AR-DEBT-ADJUSTMENT-B0039252',
    category: 'AR-DEBT-ADJUSTMENT',
    ledgerType: 'AR-DEBT-ADJUSTMENT',
    entryType: 'normal',
    sourceType: 'delivery_closeout',
    sourceId: 'SO-B0039252',
    sourceCode: 'B0039252',
    sourceModel: 'orderPaymentAllocations',
    refType: 'ORDER_PAYMENT_ALLOCATION',
    refId: 'OPA-B0039252-v1',
    refCode: 'OPA-B0039252-v1',
    debit: 875094,
    credit: 0,
    amount: 875094,
    direction: 'debit',
    amountField: 'debit',
    idempotencyKey: 'AR-DEBT-ADJUSTMENT:DEBT-RECONCILE:B0039252:OPA-B0039252-v1:875094:v1',
    reason: 'order payment debt reconcile',
    createdAt: '2026-07-10T01:00:01.000Z',
    metadata: { currentArBalance: 0, expectedDebtAmount: 875094, deltaDebt: 875094 }
  };
  const sale = {
    ...common,
    id: 'AR-SALE-B0039252',
    code: 'AR-SALE-B0039252',
    category: 'AR-SALE',
    ledgerType: 'AR-SALE',
    entryType: 'normal',
    type: 'ar_sale',
    source: 'order_payment_allocation_service',
    sourceType: 'ORDER_PAYMENT_ALLOCATION',
    sourceId: 'SO-B0039252',
    sourceCode: 'B0039252',
    refType: 'ORDER_PAYMENT_ALLOCATION',
    refId: 'OPA-B0039252-v1',
    refCode: 'OPA-B0039252-v1',
    debit: 875094,
    credit: 0,
    amount: 875094,
    direction: 'debit',
    amountField: 'debit',
    idempotencyKey: 'OPA:SO-B0039252:delivery_closeout:scope:v1:AR-SALE',
    createdAt: '2026-07-10T01:00:00.000Z'
  };
  return { adjustments: [adjustment], ledgersByAdjustment: [[sale]] };
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
    customerCode: value('--customer-code'),
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

    const rows = adjustments
      .filter(isNormalCloseoutAdjustment)
      .map((adjustment, index) => buildAuditRow(adjustment, ledgersByAdjustment[index] || []));
    return {
      phase: 229,
      dryRun: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      filter: serializableAdjustmentFilter(options),
      summary: {
        adjustmentCount: rows.length,
        p0DuplicateDebtCount: rows.filter((row) => row.severity === 'P0_DUPLICATE_DEBT').length,
        warningCount: rows.filter((row) => row.severity === 'WARNING').length,
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
    console.log('# Phase229 normal closeout duplicate debt adjustment audit');
    console.log('');
    console.log('DRY RUN / READ ONLY — không update, không delete, không tự reversal.');
    console.log('');
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(JSON.stringify(report.rows, null, 2));
  }
  if (report.summary.p0DuplicateDebtCount > 0 && !options.fixture) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[audit-closeout-debt-adjustment-duplicate-ar-sale] failed:', err);
    try { await mongoose.connection.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  isNormalCloseoutAdjustment,
  legacyIdentityCollapse,
  buildAuditRow,
  adjustmentFilter,
  serializableAdjustmentFilter,
  orderLookupFilter,
  fixtureData,
  run
};
