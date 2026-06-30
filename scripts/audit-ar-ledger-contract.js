#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const { validateArLedgerContract, hasAccRevMismatch } = require('../src/domain/ar/arLedgerValidator');

function clean(value = '') { return String(value ?? '').trim(); }
function upper(value = '') { return clean(value).toUpperCase(); }
function ledgerId(row = {}) { return clean(row.id || row.code || row._id); }
function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const valueOf = (name) => {
    const prefix = `${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] || '' : '';
  };
  return {
    dryRun: args.has('--dry-run') || !args.has('--apply'),
    json: args.has('--json'),
    markdown: args.has('--markdown'),
    sourceId: valueOf('--sourceId'),
    customerCode: valueOf('--customerCode'),
    strict: args.has('--strict')
  };
}

function summarizeRow(row = {}) {
  return {
    ledgerId: ledgerId(row),
    id: clean(row.id),
    code: clean(row.code),
    category: clean(row.category),
    ledgerType: clean(row.ledgerType),
    entryType: clean(row.entryType),
    sourceType: clean(row.sourceType),
    sourceId: clean(row.sourceId),
    sourceCode: clean(row.sourceCode),
    customerCode: clean(row.customerCode),
    idempotencyKey: clean(row.idempotencyKey),
    accountingStatus: clean(row.accountingStatus),
    accountingConfirmed: row.accountingConfirmed === true,
    active: row.active,
    reversed: row.reversed,
    accountingBatchId: clean(row.accountingBatchId),
    debit: Number(row.debit || 0),
    credit: Number(row.credit || 0),
    amount: Number(row.amount || 0)
  };
}

function issue(summary, code, row = {}, extra = {}) {
  summary.issues.push({ code, severity: code.includes('DUPLICATE') ? 'P1' : 'P0', ledger: summarizeRow(row), ...extra });
  summary.totals[code] = (summary.totals[code] || 0) + 1;
}

function addDuplicateIssues(summary, rows = []) {
  const activeSalesBySource = new Map();
  const reversalByOriginal = new Map();
  const idempotencyCounts = new Map();

  for (const row of rows) {
    const category = upper(row.category);
    const activeConfirmed = row.account === 'AR' && row.accountingConfirmed === true && clean(row.accountingStatus) === 'confirmed' && row.active === true;
    const idem = clean(row.idempotencyKey);
    if (idem) {
      if (!idempotencyCounts.has(idem)) idempotencyCounts.set(idem, []);
      idempotencyCounts.get(idem).push(row);
    }
    if (activeConfirmed && category === 'AR-SALE') {
      const key = clean(row.sourceId) || '(missing-sourceId)';
      if (!activeSalesBySource.has(key)) activeSalesBySource.set(key, []);
      activeSalesBySource.get(key).push(row);
    }
    if (activeConfirmed && category === 'AR-SALE-REVERSAL') {
      const key = `${clean(row.sourceId) || '(missing-sourceId)'}::${clean(row.reversedLedgerId) || clean(row.originalLedgerId) || '(missing-reversedLedgerId)'}`;
      if (!reversalByOriginal.has(key)) reversalByOriginal.set(key, []);
      reversalByOriginal.get(key).push(row);
    }
  }

  for (const [key, list] of activeSalesBySource) {
    if (list.length > 1) issue(summary, 'DIRTY_LEDGER_DUPLICATE_AR_SALE', list[0], { key, count: list.length, examples: list.map(summarizeRow) });
  }
  for (const [key, list] of reversalByOriginal) {
    if (list.length > 1) issue(summary, 'DIRTY_LEDGER_DUPLICATE_REVERSAL', list[0], { key, count: list.length, examples: list.map(summarizeRow) });
  }
  for (const [key, list] of idempotencyCounts) {
    if (list.length > 1) issue(summary, 'DIRTY_LEDGER_DUPLICATE_IDEMPOTENCY_KEY', list[0], { key, count: list.length, examples: list.map(summarizeRow) });
  }
}

function auditArLedgerContractRows(rows = []) {
  const summary = {
    mode: 'dry-run',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    totals: {
      rows: Array.isArray(rows) ? rows.length : 0,
      issueCount: 0,
      dirtyLedgerCount: 0
    },
    issues: [],
    caseB0038423: []
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    if (clean(row.sourceId) === 'SO1782550380164673' || clean(row.sourceCode) === 'B0038423' || /B0038423/.test(clean(row.code || row.id || row.orderCode))) {
      summary.caseB0038423.push(summarizeRow(row));
    }

    if (row.account !== 'AR' && upper(row.account || 'AR') !== 'AR') continue;
    if (row.accountingConfirmed !== true) continue;

    if (!clean(row.category)) issue(summary, 'DIRTY_LEDGER_MISSING_CATEGORY', row);
    if (!clean(row.ledgerType)) issue(summary, 'DIRTY_LEDGER_MISSING_LEDGER_TYPE', row);
    if (!clean(row.entryType)) issue(summary, 'DIRTY_LEDGER_MISSING_ENTRY_TYPE', row);
    if (!clean(row.sourceId)) issue(summary, 'DIRTY_LEDGER_MISSING_SOURCE_ID', row);
    if (!clean(row.customerCode)) issue(summary, 'DIRTY_LEDGER_MISSING_CUSTOMER_CODE', row);
    if (hasAccRevMismatch(row)) issue(summary, 'DIRTY_LEDGER_ACC_ID_REV_BATCH_MISMATCH', row);
    if (clean(row.accountingStatus) === 'reversed' && (row.active === true || row.reversed !== true || !clean(row.reversalLedgerId))) {
      issue(summary, 'DIRTY_LEDGER_REVERSED_BUT_ACTIVE', row);
    }

    const validation = validateArLedgerContract(row);
    if (!validation.ok) {
      const codes = new Set(validation.errors.map((item) => item.code));
      if (codes.has('DIRTY_LEDGER_INVALID_DEBIT_CREDIT')) issue(summary, 'DIRTY_LEDGER_INVALID_DEBIT_CREDIT', row, { validation });
      issue(summary, 'DIRTY_LEDGER_CONFIRMED_BUT_INVALID_CONTRACT', row, { validation });
    }
  }

  addDuplicateIssues(summary, rows);
  summary.totals.issueCount = summary.issues.length;
  summary.totals.dirtyLedgerCount = new Set(summary.issues.map((item) => item.ledger.ledgerId)).size;
  return summary;
}

function buildMongoFilter(options = {}) {
  const filter = { account: 'AR' };
  const ors = [];
  if (options.sourceId) ors.push({ sourceId: options.sourceId }, { salesOrderId: options.sourceId }, { orderId: options.sourceId }, { sourceCode: options.sourceId }, { orderCode: options.sourceId }, { code: new RegExp(options.sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  if (options.customerCode) filter.customerCode = options.customerCode;
  if (ors.length) filter.$or = ors;
  return filter;
}

function toMarkdown(summary = {}) {
  const lines = [];
  lines.push('# PHASE79 AR Ledger Contract Audit Report');
  lines.push('');
  lines.push(`- GeneratedAt: ${summary.generatedAt}`);
  lines.push(`- ReadOnly: ${summary.readOnly}`);
  lines.push(`- Rows: ${summary.totals?.rows || 0}`);
  lines.push(`- IssueCount: ${summary.totals?.issueCount || 0}`);
  lines.push(`- DirtyLedgerCount: ${summary.totals?.dirtyLedgerCount || 0}`);
  lines.push('');
  lines.push('## Issue totals');
  for (const [key, value] of Object.entries(summary.totals || {}).filter(([key]) => /^DIRTY_/.test(key)).sort()) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push('');
  lines.push('## Case B0038423 / SO1782550380164673');
  if (!summary.caseB0038423?.length) lines.push('- Không tìm thấy trong phạm vi audit hiện tại.');
  for (const row of summary.caseB0038423 || []) lines.push(`- ${row.ledgerId} | ${row.category || '(missing)'} | ${row.accountingBatchId || '(missing batch)'}`);
  lines.push('');
  lines.push('## Sample issues');
  for (const item of (summary.issues || []).slice(0, 100)) lines.push(`- [${item.severity}] ${item.code} | ${item.ledger.ledgerId} | source=${item.ledger.sourceId || '(missing)'}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs();
  const mongoose = require('mongoose');
  const connectDB = require('../src/config/db');
  const ArLedger = require('../src/models/ArLedger');
  await connectDB();
  const rows = await ArLedger.find(buildMongoFilter(options)).lean();
  const summary = auditArLedgerContractRows(rows);
  summary.options = options;
  if (options.json) console.log(JSON.stringify(summary, null, 2));
  else if (options.markdown) console.log(toMarkdown(summary));
  else {
    console.log('AR Ledger contract audit (dry-run, không sửa dữ liệu)');
    console.log('='.repeat(72));
    console.log(`Rows: ${summary.totals.rows}`);
    console.log(`Issues: ${summary.totals.issueCount}`);
    for (const [key, value] of Object.entries(summary.totals).filter(([key]) => /^DIRTY_/.test(key)).sort()) console.log(`${key}: ${value}`);
  }
  await mongoose.connection.close();
  if (options.strict && summary.totals.issueCount > 0) process.exit(2);
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[audit-ar-ledger-contract] failed:', err);
    try { await require('mongoose').connection.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = { auditArLedgerContractRows, toMarkdown, buildMongoFilter };
