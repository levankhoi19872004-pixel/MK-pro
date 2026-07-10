#!/usr/bin/env node
'use strict';

/**
 * Phase226 read-only audit.
 *
 * Finds accounting-confirmed debt collections whose AR receipt exists but was
 * excluded by the pre-Phase226 Debt New category/provenance contract, or whose
 * receipt still cannot participate in the active debt read model.
 *
 * This script never writes to MongoDB.
 */
const mongoose = require('mongoose');
const { normalizeDebtAmount, DEBT_ZERO_TOLERANCE } = require('../src/constants/finance.constants');
const {
  ACTIVE_DEBT_READ_MODEL_CATEGORIES,
  EXCLUDED_DEBT_READ_MODEL_CATEGORIES
} = require('../src/domain/ar/arDebtCategoryRegistry');
const {
  canProjectCanonicalAccountingLedgerToDebtReadModel,
  normalizeAccountingAmount
} = require('../src/domain/ar/arLedgerValidator');

const PRE_PHASE226_ALLOWED_CATEGORIES = Object.freeze([
  'AR-DEBT-OPEN',
  'AR-DEBT-PAYMENT',
  'AR-DEBT-ADJUSTMENT',
  'AR-DEBT-VOID',
  'AR-SALE',
  'AR-RECEIPT-CASH',
  'AR-RECEIPT-BANK',
  'AR-REWARD-ALLOWANCE',
  'AR-RETURN'
]);

const AUDIT_PROJECTION = Object.freeze({
  _id: 1,
  id: 1,
  code: 1,
  category: 1,
  ledgerType: 1,
  customerCode: 1,
  sourceId: 1,
  sourceCode: 1,
  salesOrderId: 1,
  salesOrderCode: 1,
  orderId: 1,
  orderCode: 1,
  debit: 1,
  credit: 1,
  amount: 1,
  direction: 1,
  accountingConfirmed: 1,
  accountingStatus: 1,
  active: 1,
  reversed: 1,
  status: 1,
  refId: 1,
  refCode: 1,
  refType: 1,
  source: 1,
  idempotencyKey: 1,
  isDeleted: 1,
  deleted: 1,
  deletedAt: 1,
  salesStaffCode: 1,
  salesStaffName: 1,
  deliveryStaffCode: 1,
  deliveryStaffName: 1
});

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function money(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function ledgerId(row = {}) {
  return clean(row.id || row.code || row._id);
}

function orderKeys(row = {}) {
  return Array.from(new Set([
    row.sourceId,
    row.sourceCode,
    row.salesOrderId,
    row.salesOrderCode,
    row.orderId,
    row.orderCode
  ].map(clean).filter(Boolean)));
}

function allocationKeys(row = {}) {
  return Array.from(new Set([
    row.salesOrderId,
    row.salesOrderCode,
    row.orderId,
    row.orderCode,
    row.sourceOrderId,
    row.sourceOrderCode,
    row.refId,
    row.refCode
  ].map(clean).filter(Boolean)));
}

function collectionIdentity(row = {}) {
  return clean(row.code || row.id || row._id);
}

function isActiveConfirmed(row = {}) {
  const status = clean(row.status).toLowerCase();
  return upper(row.account || 'AR') === 'AR'
    && row.accountingConfirmed === true
    && clean(row.accountingStatus).toLowerCase() === 'confirmed'
    && row.active === true
    && row.reversed !== true
    && row.isDeleted !== true
    && row.deleted !== true
    && !clean(row.deletedAt)
    && !['void', 'voided', 'cancelled', 'canceled', 'deleted', 'reversed'].includes(status);
}

function wasProjectableBeforePhase226(row = {}) {
  const category = upper(row.category);
  const ledgerType = upper(row.ledgerType || row.category);
  if (!isActiveConfirmed(row)) return false;
  if (!PRE_PHASE226_ALLOWED_CATEGORIES.includes(category) || !PRE_PHASE226_ALLOWED_CATEGORIES.includes(ledgerType)) return false;
  if (category.startsWith('AR-DEBT-')) return true;
  return upper(row.sourceType) === 'ORDER_PAYMENT_ALLOCATION';
}

function signedEffect(row = {}) {
  const amounts = normalizeAccountingAmount(row);
  return money(amounts.debit - amounts.credit);
}

function debtFromRows(rows = [], predicate = () => true) {
  const raw = (rows || []).filter(predicate).reduce((sum, row) => sum + signedEffect(row), 0);
  return normalizeDebtAmount(money(raw), DEBT_ZERO_TOLERANCE);
}

function receiptMatchesCollection(row = {}, collection = {}) {
  const collectionKeys = new Set([collection.id, collection.code, collection._id].map(clean).filter(Boolean));
  return upper(row.category) === 'AR-RECEIPT'
    && [row.refId, row.refCode].map(clean).some((key) => collectionKeys.has(key));
}

function rowMatchesAllocation(row = {}, allocation = {}) {
  const ledgerKeys = new Set(orderKeys(row));
  return allocationKeys(allocation).some((key) => ledgerKeys.has(key));
}

function buildMismatchReason({ receiptLedger, legacyDebt, expectedDebt }) {
  if (!receiptLedger) return 'MISSING_AR_RECEIPT_FOR_CONFIRMED_ALLOCATION';
  const category = upper(receiptLedger.category);
  const ledgerType = upper(receiptLedger.ledgerType || receiptLedger.category);
  if (!PRE_PHASE226_ALLOWED_CATEGORIES.includes(category) || !PRE_PHASE226_ALLOWED_CATEGORIES.includes(ledgerType)) {
    return 'AR_RECEIPT_CATEGORY_MISSING_FROM_PRE_PHASE226_READ_MATCH';
  }
  if (!canProjectCanonicalAccountingLedgerToDebtReadModel(receiptLedger)) {
    return 'AR_RECEIPT_PROVENANCE_OR_CONTRACT_REJECTED';
  }
  if (legacyDebt !== expectedDebt) return 'PRE_PHASE226_DEBT_BALANCE_IGNORED_CONFIRMED_RECEIPT';
  return '';
}

function buildAuditRows(collections = [], ledgers = []) {
  const rows = [];
  for (const collection of collections || []) {
    const code = collectionIdentity(collection);
    const allocations = Array.isArray(collection.allocations) ? collection.allocations : [];
    for (const allocation of allocations) {
      const keys = allocationKeys(allocation);
      const orderRows = (ledgers || []).filter((row) => {
        if (clean(row.customerCode) !== clean(collection.customerCode)) return false;
        const rowKeySet = new Set(orderKeys(row));
        return keys.some((key) => rowKeySet.has(key));
      });
      const receiptLedger = orderRows.find((row) => receiptMatchesCollection(row, collection) && rowMatchesAllocation(row, allocation)) || null;
      const legacyDebt = debtFromRows(orderRows, wasProjectableBeforePhase226);
      const expectedDebt = debtFromRows(orderRows, canProjectCanonicalAccountingLedgerToDebtReadModel);
      const mismatchReason = buildMismatchReason({ receiptLedger, legacyDebt, expectedDebt });
      if (!mismatchReason) continue;

      rows.push({
        collectionCode: code,
        customerCode: clean(collection.customerCode),
        orderCode: clean(allocation.salesOrderCode || allocation.orderCode || allocation.sourceOrderCode || allocation.refCode),
        collectionAmount: money(collection.amount),
        allocatedAmount: money(allocation.allocatedAmount ?? allocation.amount),
        arLedgerId: receiptLedger ? ledgerId(receiptLedger) : '',
        category: receiptLedger ? upper(receiptLedger.category) : '',
        ledgerType: receiptLedger ? upper(receiptLedger.ledgerType || receiptLedger.category) : '',
        currentDebt: legacyDebt,
        expectedDebt,
        mismatchReason,
        receiptProjectableAfterPhase226: Boolean(receiptLedger && canProjectCanonicalAccountingLedgerToDebtReadModel(receiptLedger)),
        receiptActiveConfirmed: Boolean(receiptLedger && isActiveConfirmed(receiptLedger)),
        excludedReversalCategories: EXCLUDED_DEBT_READ_MODEL_CATEGORIES,
        activeDebtCategories: ACTIVE_DEBT_READ_MODEL_CATEGORIES
      });
    }
  }
  return rows;
}

function fixtureData() {
  const collection = {
    id: 'DC202607093145492952',
    code: 'DC202607093145492952',
    status: 'accounting_confirmed',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    arPosted: true,
    arLedgerIds: ['AR-RECEIPT-DC202607093145492952-SO1783155351292178'],
    customerCode: '4501680',
    customerName: 'Chị Hiền',
    amount: 2499694,
    allocations: [{
      salesOrderId: 'SO1783155351292178',
      salesOrderCode: 'B0038774',
      allocatedAmount: 2499694
    }]
  };
  const common = {
    account: 'AR',
    customerCode: '4501680',
    customerName: 'Chị Hiền',
    sourceId: 'SO1783155351292178',
    sourceCode: 'B0038774',
    salesOrderId: 'SO1783155351292178',
    salesOrderCode: 'B0038774',
    orderId: 'SO1783155351292178',
    orderCode: 'B0038774',
    salesStaffCode: '39534',
    salesStaffName: 'Lương Thị Kiều',
    deliveryStaffCode: 'ghkx',
    deliveryStaffName: 'Hào Giao Hàng KX',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    status: 'posted'
  };
  return {
    collections: [collection],
    ledgers: [
      {
        ...common,
        id: 'AR-SALE-SO1783155351292178',
        code: 'AR-SALE-B0038774',
        category: 'AR-SALE',
        ledgerType: 'AR-SALE',
        entryType: 'normal',
        sourceType: 'ORDER_PAYMENT_ALLOCATION',
        refType: 'ORDER_PAYMENT_ALLOCATION',
        refId: 'OPA-B0038774',
        refCode: 'OPA-B0038774',
        debit: 2499694,
        credit: 0,
        amount: 2499694,
        direction: 'debit',
        amountField: 'debit',
        idempotencyKey: 'AR-SALE:OPA-B0038774'
      },
      {
        ...common,
        id: 'AR-RECEIPT-DC202607093145492952-SO1783155351292178',
        code: 'AR-RECEIPT-DC202607093145492952-1',
        category: 'AR-RECEIPT',
        ledgerType: 'AR-RECEIPT',
        entryType: 'normal',
        sourceType: 'salesOrder',
        refType: 'debtCollection',
        refId: 'DC202607093145492952',
        refCode: 'DC202607093145492952',
        source: 'DebtCollectionPostingService',
        debit: 0,
        credit: 2499694,
        amount: 2499694,
        direction: 'credit',
        amountField: 'credit',
        idempotencyKey: 'AR-RECEIPT:DC202607093145492952:SO1783155351292178'
      }
    ]
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
    collectionCode: value('--collection-code'),
    limit: Math.max(1, Math.min(5000, Number(value('--limit', '500')) || 500))
  };
}

function mongoCollectionFilter(options = {}) {
  const filter = {
    status: 'accounting_confirmed',
    arPosted: true
  };
  if (options.collectionCode) {
    filter.$or = [{ code: options.collectionCode }, { id: options.collectionCode }];
  }
  return filter;
}

function ledgerQueryForCollections(collections = []) {
  const collectionKeys = Array.from(new Set((collections || []).flatMap((row) => [row.id, row.code, row._id]).map(clean).filter(Boolean)));
  const customerCodes = Array.from(new Set((collections || []).map((row) => clean(row.customerCode)).filter(Boolean)));
  const orderKeysList = Array.from(new Set((collections || []).flatMap((row) => (row.allocations || []).flatMap(allocationKeys)).filter(Boolean)));
  return {
    $or: [
      { refId: { $in: collectionKeys } },
      { refCode: { $in: collectionKeys } },
      { sourceId: { $in: orderKeysList } },
      { sourceCode: { $in: orderKeysList } },
      { salesOrderId: { $in: orderKeysList } },
      { salesOrderCode: { $in: orderKeysList } },
      { orderId: { $in: orderKeysList } },
      { orderCode: { $in: orderKeysList } },
      { customerCode: { $in: customerCodes } }
    ]
  };
}

async function loadMongoData(options = {}) {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || '';
  if (!uri) throw new Error('Thiếu MONGO_URI/MONGODB_URI. Chạy --fixture để kiểm chứng offline; script production chỉ đọc dữ liệu.');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const collections = await db.collection('debtCollections')
    .find(mongoCollectionFilter(options), {
      projection: {
        _id: 1, id: 1, code: 1, status: 1, accountingConfirmed: 1, accountingStatus: 1,
        arPosted: 1, arLedgerIds: 1, customerCode: 1, customerName: 1, amount: 1, allocations: 1
      }
    })
    .limit(options.limit)
    .toArray();
  if (!collections.length) return { collections: [], ledgers: [] };
  const ledgers = await db.collection('arLedgers')
    .find(ledgerQueryForCollections(collections), { projection: AUDIT_PROJECTION })
    .limit(Math.max(options.limit * 50, 5000))
    .toArray();
  return { collections, ledgers };
}

function markdownReport(report = {}) {
  const lines = [
    '# Phase226 confirmed debt collection AR receipt audit',
    '',
    `- mode: ${report.mode}`,
    `- collectionsScanned: ${report.collectionsScanned}`,
    `- ledgersScanned: ${report.ledgersScanned}`,
    `- mismatches: ${report.mismatches.length}`,
    `- dryRun: true`,
    ''
  ];
  for (const row of report.mismatches) {
    lines.push(`## ${row.collectionCode} / ${row.orderCode}`);
    lines.push('');
    for (const [key, value] of Object.entries(row)) {
      if (Array.isArray(value)) continue;
      lines.push(`- ${key}: ${value}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function run(options = parseArgs()) {
  const data = options.fixture ? fixtureData() : await loadMongoData(options);
  const mismatches = buildAuditRows(data.collections, data.ledgers);
  return {
    audit: 'confirmed-debt-collections-missing-from-debt-read-model',
    phase: 226,
    mode: options.fixture ? 'fixture' : 'mongo-read-only',
    dryRun: true,
    generatedAt: new Date().toISOString(),
    collectionsScanned: data.collections.length,
    ledgersScanned: data.ledgers.length,
    mismatches
  };
}

async function main() {
  const options = parseArgs();
  try {
    const report = await run(options);
    process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : `${markdownReport(report)}\n`);
  } finally {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(`[phase226-audit] ${error.stack || error.message}`);
    try { if (mongoose.connection.readyState) await mongoose.disconnect(); } catch (_) {}
    process.exitCode = 1;
  });
}

module.exports = {
  PRE_PHASE226_ALLOWED_CATEGORIES,
  AUDIT_PROJECTION,
  isActiveConfirmed,
  wasProjectableBeforePhase226,
  debtFromRows,
  buildAuditRows,
  fixtureData,
  parseArgs,
  mongoCollectionFilter,
  ledgerQueryForCollections,
  markdownReport,
  run
};
