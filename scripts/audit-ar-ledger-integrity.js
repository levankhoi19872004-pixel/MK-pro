#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const { toNumber } = require('../src/utils/common.util');
const { isActiveLedgerDoc } = require('../src/utils/arLedgerStatus.util');
const { containsRevMarker } = require('../src/utils/arLedgerValidation.util');

const KNOWN_AR_CATEGORIES = new Set([
  'AR-SALE',
  'AR-SALE-REVERSAL',
  'AR-RETURN',
  'AR-RETURN-REVERSAL',
  'AR-RECEIPT',
  'AR-RECEIPT-REVERSAL',
  'AR-BONUS',
  'AR-ALLOWANCE',
  'AR-DISCOUNT',
  'AR-ADJUSTMENT',
  'AR-EXTERNAL',
  'AR-EXTERNAL-DEBT',
  'AR-VOID',
  'AR-REVERSAL'
]);

const TYPE_CATEGORY_MAP = new Map([
  ['ar_sale', 'AR-SALE'],
  ['ar_sale_reversal', 'AR-SALE-REVERSAL'],
  ['ar_return', 'AR-RETURN'],
  ['ar_return_reversal', 'AR-RETURN-REVERSAL'],
  ['ar_receipt', 'AR-RECEIPT'],
  ['ar_receipt_reversal', 'AR-RECEIPT-REVERSAL'],
  ['ar_bonus', 'AR-BONUS'],
  ['ar_allowance', 'AR-ALLOWANCE'],
  ['ar_discount', 'AR-DISCOUNT'],
  ['ar_adjustment', 'AR-ADJUSTMENT'],
  ['ar_external', 'AR-EXTERNAL'],
  ['external_debt', 'AR-EXTERNAL-DEBT'],
  ['ar_external_debt', 'AR-EXTERNAL-DEBT'],
  ['ar_reversal', 'AR-REVERSAL'],
  ['ar_void', 'AR-VOID']
]);

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function objectIdOf(row = {}) {
  return clean(row._id && typeof row._id.toString === 'function' ? row._id.toString() : row._id);
}

function ledgerObjectId(row = {}) {
  return objectIdOf(row) || clean(row.id) || clean(row.code);
}

function normalizedCategory(row = {}) {
  const explicit = upper(row.category || row.ledgerType);
  if (explicit) return explicit;
  const type = clean(row.type).toLowerCase();
  return TYPE_CATEGORY_MAP.get(type) || upper(row.type);
}

function isArReturn(row = {}) {
  return normalizedCategory(row) === 'AR-RETURN'
    || clean(row.type).toLowerCase() === 'ar_return'
    || upper(row.ledgerType) === 'AR-RETURN';
}

function amountOf(row = {}) {
  return Math.round(toNumber(row.amount));
}

function debitOf(row = {}) {
  return Math.round(toNumber(row.debit));
}

function creditOf(row = {}) {
  return Math.round(toNumber(row.credit));
}

function directionOf(row = {}) {
  return clean(row.direction).toLowerCase();
}

function ledgerEffect(row = {}) {
  return debitOf(row) - creditOf(row);
}

function sourceKey(row = {}) {
  return clean(row.returnOrderId || row.returnOrderCode || row.sourceId || row.sourceCode || row.refId || row.refCode);
}

function customerKey(row = {}) {
  return clean(row.customerCode || row.customerId || row.customerName);
}

function summarizeLedger(row = {}) {
  return {
    _id: objectIdOf(row),
    id: clean(row.id),
    code: clean(row.code),
    category: normalizedCategory(row),
    type: clean(row.type),
    ledgerType: clean(row.ledgerType),
    status: clean(row.status),
    accountingStatus: clean(row.accountingStatus),
    accountingConfirmed: row.accountingConfirmed === true,
    accountingBatchId: clean(row.accountingBatchId),
    amount: amountOf(row),
    debit: debitOf(row),
    credit: creditOf(row),
    direction: directionOf(row),
    idempotencyKey: clean(row.idempotencyKey),
    sourceId: clean(row.sourceId),
    sourceCode: clean(row.sourceCode),
    sourceType: clean(row.sourceType),
    sourceModel: clean(row.sourceModel),
    returnOrderId: clean(row.returnOrderId),
    returnOrderCode: clean(row.returnOrderCode),
    customerCode: clean(row.customerCode || row.customerId),
    createdAt: clean(row.createdAt),
    updatedAt: clean(row.updatedAt)
  };
}

function addIssue(issues, row, issue, severity = 'P1', detail = {}) {
  issues.push({
    issue,
    severity,
    ledgerObjectId: ledgerObjectId(row),
    id: clean(row.id),
    code: clean(row.code),
    category: normalizedCategory(row),
    idempotencyKey: clean(row.idempotencyKey),
    returnOrderId: clean(row.returnOrderId || row.returnOrderCode || row.sourceId || row.sourceCode),
    customerCode: customerKey(row),
    amount: amountOf(row),
    debit: debitOf(row),
    credit: creditOf(row),
    direction: directionOf(row),
    accountingBatchId: clean(row.accountingBatchId),
    detail
  });
}

function groupBy(rows = [], keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = clean(keyFn(row));
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function arReturnBusinessKey(row = {}) {
  return [
    clean(row.tenantId) || 'default',
    sourceKey(row) || clean(row.idempotencyKey),
    customerKey(row),
    amountOf(row) || creditOf(row)
  ].join('|');
}

function detectDuplicateIssues(activeRows = [], issues = []) {
  const byIdempotency = groupBy(activeRows.filter((row) => clean(row.idempotencyKey)), (row) => clean(row.idempotencyKey));
  const duplicateActiveIdempotency = [];
  for (const [key, rows] of byIdempotency.entries()) {
    if (rows.length <= 1) continue;
    const item = { key, count: rows.length, rows: rows.map(summarizeLedger) };
    duplicateActiveIdempotency.push(item);
    for (const row of rows) addIssue(issues, row, 'DUPLICATE_ACTIVE_IDEMPOTENCY', 'P0', { key, count: rows.length });
  }

  const activeArReturns = activeRows.filter(isArReturn);
  const byArReturnBusinessKey = groupBy(activeArReturns, arReturnBusinessKey);
  const duplicateActiveArReturn = [];
  for (const [key, rows] of byArReturnBusinessKey.entries()) {
    if (rows.length <= 1) continue;
    const item = { key, count: rows.length, rows: rows.map(summarizeLedger) };
    duplicateActiveArReturn.push(item);
    for (const row of rows) addIssue(issues, row, 'DUPLICATE_ACTIVE_AR_RETURN', 'P0', { key, count: rows.length });
  }

  return { duplicateActiveIdempotency, duplicateActiveArReturn };
}

function auditArLedgerIntegrity(ledgers = []) {
  const rows = Array.isArray(ledgers) ? ledgers : [];
  const issues = [];
  const activeRows = rows.filter((row) => isActiveLedgerDoc(row, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] }));

  for (const row of rows) {
    const category = normalizedCategory(row);
    const amount = amountOf(row);
    const debit = debitOf(row);
    const credit = creditOf(row);
    const direction = directionOf(row);
    const active = isActiveLedgerDoc(row, { extraInactiveStatuses: ['duplicate_cancelled', 'draft'] });

    if (isArReturn(row) && debit > 0) addIssue(issues, row, 'AR_RETURN_DEBIT_POSITIVE', 'P0');
    if (debit > 0 && direction === 'credit') addIssue(issues, row, 'DEBIT_DIRECTION_CONFLICT', 'P0');
    if (credit > 0 && direction === 'debit') addIssue(issues, row, 'CREDIT_DIRECTION_CONFLICT', 'P0');
    if (isArReturn(row) && (containsRevMarker(row.id) || containsRevMarker(row.code))) addIssue(issues, row, 'AR_RETURN_CODE_CONTAINS_REV', 'P0');
    if (/REV/i.test(clean(row.accountingBatchId)) && row.accountingConfirmed === true && active) addIssue(issues, row, 'REV_BATCH_STILL_CONFIRMED', 'P0');
    if (Math.abs(amount - Math.max(Math.abs(debit), Math.abs(credit))) > 0 && (amount || debit || credit)) addIssue(issues, row, 'AMOUNT_MISMATCH', 'P1', { expectedAmount: Math.max(Math.abs(debit), Math.abs(credit)) });
    if (active && !clean(row.idempotencyKey)) addIssue(issues, row, 'MISSING_IDEMPOTENCY_KEY', isArReturn(row) ? 'P0' : 'P1');
    if (active && !sourceKey(row)) addIssue(issues, row, 'MISSING_SOURCE', isArReturn(row) ? 'P0' : 'P1');
    if (active && !customerKey(row)) addIssue(issues, row, 'MISSING_CUSTOMER', 'P1');
    if (active && row.accountingConfirmed === true && amount === 0 && debit === 0 && credit === 0) addIssue(issues, row, 'ZERO_AMOUNT_CONFIRMED', 'P1');
    if (category && !KNOWN_AR_CATEGORIES.has(category) && (/^AR[-_]/i.test(category) || /^ar_/i.test(clean(row.type)))) addIssue(issues, row, 'UNKNOWN_AR_CATEGORY', 'P1', { category });
  }

  const duplicates = detectDuplicateIssues(activeRows, issues);
  const totalsByIssue = issues.reduce((acc, item) => {
    acc[item.issue] = (acc[item.issue] || 0) + 1;
    return acc;
  }, {});

  return {
    mode: 'audit',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    totals: {
      ledgers: rows.length,
      activeLedgers: activeRows.length,
      issues: issues.length,
      p0Issues: issues.filter((item) => item.severity === 'P0').length,
      duplicateActiveIdempotencyGroups: duplicates.duplicateActiveIdempotency.length,
      duplicateActiveArReturnGroups: duplicates.duplicateActiveArReturn.length,
      byIssue: totalsByIssue
    },
    duplicateActiveIdempotency: duplicates.duplicateActiveIdempotency,
    duplicateActiveArReturn: duplicates.duplicateActiveArReturn,
    issues
  };
}

function csvEscape(value) {
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function issuesToCsv(issues = []) {
  const columns = ['issue', 'severity', 'ledgerObjectId', 'id', 'code', 'category', 'idempotencyKey', 'returnOrderId', 'customerCode', 'amount', 'debit', 'credit', 'direction', 'accountingBatchId', 'detail'];
  const lines = [columns.join(',')];
  for (const issue of issues) lines.push(columns.map((column) => csvEscape(issue[column])).join(','));
  return `${lines.join('\n')}\n`;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function writeReports(audit, options = {}) {
  const reportsDir = path.resolve(options.reportsDir || path.join(__dirname, '..', 'reports'));
  fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = options.stamp || timestampForFile();
  const jsonPath = path.join(reportsDir, `ar-ledger-integrity-audit-${stamp}.json`);
  const csvPath = path.join(reportsDir, `ar-ledger-integrity-audit-${stamp}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(audit, null, 2));
  fs.writeFileSync(csvPath, issuesToCsv(audit.issues));
  return { jsonPath, csvPath };
}

async function loadRowsFromDb(limit = 0) {
  const ArLedger = require('../src/models/ArLedger');
  let query = ArLedger.find({})
    .select('_id id code tenantId type ledgerType category status lifecycleStatus accountingStatus accountingConfirmed accountingBatchId reversed isDeleted deleted deletedAt voidedAt supersededAt entryType sourceAction refType amount debit credit direction idempotencyKey source sourceType sourceModel sourceId sourceCode refId refCode returnOrderId returnOrderCode customerId customerCode customerName orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode createdAt updatedAt auditTrail')
    .lean();
  if (limit) query = query.limit(limit);
  return query;
}

function printHuman(audit, paths) {
  console.log('AR ledger integrity audit (read-only, không ghi DB)');
  console.log('='.repeat(72));
  console.log(`Ledgers: ${audit.totals.ledgers}`);
  console.log(`Active ledgers: ${audit.totals.activeLedgers}`);
  console.log(`Issues: ${audit.totals.issues} | P0: ${audit.totals.p0Issues}`);
  console.log(`Duplicate active idempotency groups: ${audit.totals.duplicateActiveIdempotencyGroups}`);
  console.log(`Duplicate active AR-RETURN groups: ${audit.totals.duplicateActiveArReturnGroups}`);
  console.log(`JSON: ${paths.jsonPath}`);
  console.log(`CSV : ${paths.csvPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Math.max(0, Number(limitArg.split('=')[1]) || 0) : 0;
  await require('../src/config/db')();
  const rows = await loadRowsFromDb(limit);
  const audit = auditArLedgerIntegrity(rows);
  const paths = writeReports(audit);
  if (json) console.log(JSON.stringify({ ...audit, reports: paths }, null, 2));
  else printHuman(audit, paths);
  await require('mongoose').connection.close();
  if (audit.totals.p0Issues > 0) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[audit-ar-ledger-integrity] failed:', err.message);
    try { await require('mongoose').connection.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  auditArLedgerIntegrity,
  writeReports,
  issuesToCsv,
  isArReturn,
  normalizedCategory,
  ledgerEffect,
  summarizeLedger,
  clean,
  objectIdOf,
  ledgerObjectId,
  sourceKey,
  customerKey,
  arReturnBusinessKey
};
