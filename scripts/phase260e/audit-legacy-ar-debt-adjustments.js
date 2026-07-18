#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const ArLedger = require('../../src/models/ArLedger');

const ROOT = path.resolve(__dirname, '../..');
const JSON_OUT = path.join(ROOT, 'PHASE260E_LEGACY_ADJUSTMENT_AUDIT.json');
const CSV_OUT = path.join(ROOT, 'PHASE260E_LEGACY_ADJUSTMENT_AUDIT.csv');

function text(value = '') { return String(value ?? '').trim(); }
function upper(value = '') { return text(value).toUpperCase(); }
function lower(value = '') { return text(value).toLowerCase(); }
function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function csv(value) {
  const raw = Array.isArray(value) ? value.join('|') : text(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}
function argValue(argv = process.argv.slice(2), name = '') {
  const inline = argv.find((item) => item.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] || '' : '';
}
function allowDisconnected(argv = process.argv.slice(2)) {
  return argv.includes('--allow-disconnected') || ['1', 'true', 'yes'].includes(lower(process.env.PHASE260E_AUDIT_ALLOW_DISCONNECTED));
}
function parseLimit(argv = process.argv.slice(2)) {
  const parsed = Number(argValue(argv, '--limit') || process.env.PHASE260E_AUDIT_LIMIT || 5000);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.floor(parsed), 50000)) : 5000;
}
function parseOrderCodes(argv = process.argv.slice(2)) {
  const raw = [argValue(argv, '--order-code'), argValue(argv, '--order-codes'), process.env.PHASE260E_AUDIT_ORDER_CODES]
    .filter(Boolean).join(',');
  return [...new Set(raw.split(',').map(text).filter(Boolean))];
}
function ledgerId(row = {}) {
  return text(row.id || row.code || row._id || row.idempotencyKey);
}
function baseIdentity(row = {}) {
  return [row.orderId || row.salesOrderId, row.orderCode || row.salesOrderCode, row.sourceId, row.sourceCode, row.correctionId, row.correctionCode]
    .map(text).filter(Boolean);
}
async function findCanonicalEvidence(row = {}, categories = [], options = {}) {
  const keys = baseIdentity(row);
  if (!keys.length) return null;
  const query = ArLedger.findOne({
    active: { $ne: false },
    reversed: { $ne: true },
    category: { $in: categories },
    $or: [
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { salesOrderId: { $in: keys } },
      { salesOrderCode: { $in: keys } },
      { sourceId: { $in: keys } },
      { sourceCode: { $in: keys } },
      { returnOrderId: { $in: keys } },
      { returnOrderCode: { $in: keys } },
      { receiptId: { $in: keys } },
      { allocationId: { $in: keys } }
    ]
  }).sort({ createdAt: -1 }).lean();
  if (options.session && typeof query.session === 'function') query.session(options.session);
  return query;
}
function classify(row = {}, evidence = {}) {
  const debit = money(row.debit);
  const credit = money(row.credit);
  const netEffect = debit - credit;
  const sourceType = upper(row.sourceType || row.refType);
  if (evidence.returnEvidence) return { classification: 'CANONICAL_SOURCE_ALREADY_EXISTS', proposedAction: 'EXCLUDE_FROM_BALANCE', risk: 'low', autoApplicable: false };
  if (evidence.paymentEvidence) return { classification: 'CANONICAL_SOURCE_ALREADY_EXISTS', proposedAction: 'EXCLUDE_FROM_BALANCE', risk: 'low', autoApplicable: false };
  if (evidence.openingEvidence && debit > 0) return { classification: 'DUPLICATE_OPENING_ADJUSTMENT', proposedAction: 'EXCLUDE_FROM_BALANCE', risk: 'medium', autoApplicable: false };
  if (sourceType.includes('RETURN') || credit > 0 && (text(row.returnOrderId) || /RETURN/i.test(text(row.reason || row.note)))) {
    return { classification: 'RETURN_RECORDED_AS_ADJUSTMENT', proposedAction: 'CANONICAL_RETURN_BACKFILL_REQUIRED', risk: 'high', autoApplicable: false };
  }
  if (sourceType.includes('PAYMENT') || sourceType.includes('RECEIPT') || credit > 0) {
    return { classification: 'PAYMENT_RECORDED_AS_ADJUSTMENT', proposedAction: 'CANONICAL_PAYMENT_BACKFILL_REQUIRED', risk: 'high', autoApplicable: false };
  }
  if (sourceType.includes('REWARD') || sourceType.includes('ALLOWANCE')) {
    return { classification: 'REWARD_RECORDED_AS_ADJUSTMENT', proposedAction: 'MANUAL_REVIEW', risk: 'high', autoApplicable: false };
  }
  if (sourceType.includes('DELIVERY_CLOSEOUT_CORRECTION')) {
    return { classification: 'FINAL_STATE_RECONSTRUCTION', proposedAction: 'MANUAL_REVIEW', risk: 'high', autoApplicable: false };
  }
  if (sourceType.includes('MANUAL')) {
    return { classification: 'VALID_MANUAL_ADJUSTMENT', proposedAction: 'NO_ACTION', risk: 'medium_legacy_audit_only', autoApplicable: false };
  }
  if (!text(row.sourceId || row.sourceCode || row.correctionId)) {
    return { classification: 'BUSINESS_EVIDENCE_INCOMPLETE', proposedAction: 'MANUAL_REVIEW', risk: 'critical', autoApplicable: false };
  }
  return { classification: netEffect === 0 ? 'NO_ACTION_REQUIRED' : 'SOURCE_IDENTITY_AMBIGUOUS', proposedAction: netEffect === 0 ? 'NO_ACTION' : 'MANUAL_REVIEW', risk: netEffect === 0 ? 'none' : 'high', autoApplicable: false };
}
async function audit(argv = process.argv.slice(2), options = {}) {
  const limit = parseLimit(argv);
  const orderCodes = parseOrderCodes(argv);
  const filter = {
    category: 'AR-DEBT-ADJUSTMENT',
    active: { $ne: false },
    reversed: { $ne: true }
  };
  if (orderCodes.length) filter.$or = [{ orderCode: { $in: orderCodes } }, { salesOrderCode: { $in: orderCodes } }, { sourceCode: { $in: orderCodes } }];
  const ledgers = await ArLedger.find(filter).sort({ createdAt: -1, updatedAt: -1 }).limit(limit).lean();
  const rows = [];
  for (const ledger of ledgers) {
    const [openingEvidence, paymentEvidence, returnEvidence] = await Promise.all([
      findCanonicalEvidence(ledger, ['AR-DEBT-OPEN', 'AR-SALE'], options),
      findCanonicalEvidence(ledger, ['AR-DEBT-PAYMENT', 'AR-RECEIPT', 'AR-RECEIPT-CASH', 'AR-RECEIPT-BANK'], options),
      findCanonicalEvidence(ledger, ['AR-RETURN'], options)
    ]);
    const evidence = { openingEvidence, paymentEvidence, returnEvidence };
    const decision = classify(ledger, evidence);
    rows.push({
      orderId: text(ledger.orderId || ledger.salesOrderId),
      orderCode: text(ledger.orderCode || ledger.salesOrderCode),
      customerCode: text(ledger.customerCode),
      ledgerId: ledgerId(ledger),
      debit: money(ledger.debit),
      credit: money(ledger.credit),
      netEffect: money(ledger.debit) - money(ledger.credit),
      sourceId: text(ledger.sourceId),
      sourceType: text(ledger.sourceType),
      sourceVersion: text(ledger.sourceVersion || ledger.metadata?.sourceVersion),
      correctionId: text(ledger.correctionId),
      receiptEvidence: paymentEvidence ? { ledgerId: ledgerId(paymentEvidence), category: text(paymentEvidence.category), credit: money(paymentEvidence.credit) } : null,
      allocationEvidence: null,
      returnEvidence: returnEvidence ? { ledgerId: ledgerId(returnEvidence), category: text(returnEvidence.category), credit: money(returnEvidence.credit) } : null,
      closeoutEvidence: openingEvidence ? { ledgerId: ledgerId(openingEvidence), category: text(openingEvidence.category), debit: money(openingEvidence.debit) } : null,
      canonicalLedgerEvidence: [openingEvidence, paymentEvidence, returnEvidence].filter(Boolean).map((row) => ({ ledgerId: ledgerId(row), category: text(row.category), debit: money(row.debit), credit: money(row.credit) })),
      ...decision
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260E',
    mode: 'dry_run_read_only',
    status: 'AUDIT_EXECUTED',
    mutation: false,
    orderCodes,
    scannedCount: ledgers.length,
    changedCount: 0,
    skippedReason: '',
    warnings: [],
    rows
  };
}
function disconnectedReport(error, argv = process.argv.slice(2)) {
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260E',
    mode: 'dry_run_read_only',
    status: 'PRODUCTION_AUDIT_NOT_EXECUTED',
    mutation: false,
    orderCodes: parseOrderCodes(argv),
    scannedCount: 0,
    changedCount: 0,
    skippedReason: 'MONGO_CONNECTION_FAILED',
    warnings: [text(error?.message)],
    rows: []
  };
}
function writeCsv(report = {}, file = CSV_OUT) {
  const headers = ['orderCode', 'customerCode', 'ledgerId', 'debit', 'credit', 'netEffect', 'sourceType', 'sourceId', 'sourceVersion', 'correctionId', 'classification', 'proposedAction', 'autoApplicable', 'risk'];
  const lines = [headers.join(',')];
  for (const row of report.rows || []) lines.push(headers.map((key) => csv(row[key])).join(','));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}
async function main() {
  const argv = process.argv.slice(2);
  let report;
  try {
    await connectDB();
    report = await audit(argv);
  } catch (error) {
    if (!allowDisconnected(argv)) throw error;
    report = disconnectedReport(error, argv);
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
  writeCsv(report);
  console.log(JSON.stringify({ status: report.status, scannedCount: report.scannedCount, rows: report.rows.length, json: path.basename(JSON_OUT), csv: path.basename(CSV_OUT) }, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

module.exports = { audit, classify, disconnectedReport, writeCsv };
