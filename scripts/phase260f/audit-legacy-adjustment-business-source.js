#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const ArLedger = require('../../src/models/ArLedger');

const ROOT = path.resolve(__dirname, '../..');
const JSON_OUT = path.join(ROOT, 'PHASE260F_R1_LEGACY_ADJUSTMENT_AUDIT.json');
const CSV_OUT = path.join(ROOT, 'PHASE260F_R1_LEGACY_ADJUSTMENT_AUDIT.csv');
const DEFAULT_ORDER_CODES = Object.freeze(['B0038754', 'B0039284', 'B0038752', 'B0038748', 'B0038741', 'B0039602']);

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
  return argv.includes('--allow-disconnected') || ['1', 'true', 'yes'].includes(lower(process.env.PHASE260F_AUDIT_ALLOW_DISCONNECTED));
}
function parseLimit(argv = process.argv.slice(2)) {
  const parsed = Number(argValue(argv, '--limit') || process.env.PHASE260F_AUDIT_LIMIT || 5000);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.floor(parsed), 50000)) : 5000;
}
function parseOrderCodes(argv = process.argv.slice(2)) {
  const raw = [argValue(argv, '--order-code'), argValue(argv, '--order-codes'), process.env.PHASE260F_AUDIT_ORDER_CODES]
    .filter(Boolean).join(',');
  const parsed = raw.split(',').map(text).filter(Boolean);
  return [...new Set((parsed.length ? parsed : DEFAULT_ORDER_CODES).map(text).filter(Boolean))];
}
function ledgerId(row = {}) {
  return text(row.id || row.code || row._id || row.idempotencyKey);
}
function sourceEvidenceFields(row = {}) {
  return [
    'sourceType',
    'sourceId',
    'sourceVersion',
    'correctionId',
    'receiptId',
    'allocationId',
    'returnOrderId',
    'metadata.sourceId',
    'metadata.receiptId',
    'metadata.allocationId',
    'metadata.returnOrderId'
  ].filter((field) => text(field.split('.').reduce((current, key) => current?.[key], row)));
}
function orderKeys(row = {}) {
  return [...new Set([
    row.orderId,
    row.orderCode,
    row.salesOrderId,
    row.salesOrderCode,
    row.sourceOrderId,
    row.sourceOrderCode,
    row.sourceId,
    row.sourceCode
  ].map(text).filter(Boolean))];
}
function sourceQuery(row = {}, categories = []) {
  const keys = orderKeys(row);
  const ids = sourceEvidenceFields(row).length ? [
    row.sourceId,
    row.refId,
    row.correctionId,
    row.receiptId,
    row.allocationId,
    row.returnOrderId,
    row.metadata?.sourceId,
    row.metadata?.receiptId,
    row.metadata?.allocationId,
    row.metadata?.returnOrderId
  ].map(text).filter(Boolean) : [];
  const or = [];
  if (keys.length) {
    or.push(
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { salesOrderId: { $in: keys } },
      { salesOrderCode: { $in: keys } }
    );
  }
  if (ids.length) {
    or.push(
      { sourceId: { $in: ids } },
      { refId: { $in: ids } },
      { receiptId: { $in: ids } },
      { allocationId: { $in: ids } },
      { returnOrderId: { $in: ids } },
      { 'metadata.replacesLegacyAdjustmentLedgerId': ledgerId(row) }
    );
  }
  return {
    account: 'AR',
    active: { $ne: false },
    reversed: { $ne: true },
    category: { $in: categories },
    $or: or.length ? or : [{ _id: '__NO_PHASE260F_SOURCE_EVIDENCE__' }]
  };
}
async function findEvidence(row = {}, categories = []) {
  return ArLedger.find(sourceQuery(row, categories)).sort({ createdAt: -1, _id: -1 }).limit(20).lean();
}
function classify(row = {}, evidence = {}) {
  const fields = sourceEvidenceFields(row);
  const sourceType = upper(row.sourceType || row.refType);
  const existing = [...(evidence.payments || []), ...(evidence.returns || []), ...(evidence.rewards || [])]
    .filter((candidate) => text(candidate.metadata?.replacesLegacyAdjustmentLedgerId) === ledgerId(row));
  if (existing.length) return { classification: 'ALREADY_BACKFILLED', reasonCode: 'CANONICAL_REPLACEMENT_LINKED_BY_METADATA', autoApplicable: false, proposedAction: 'NO_OP', risk: 'low' };
  if (evidence.returns?.length && text(row.returnOrderId || row.metadata?.returnOrderId)) return { classification: 'CANONICAL_SOURCE_ALREADY_EXISTS', reasonCode: 'RETURN_IDENTITY_CHAIN_EXISTS', autoApplicable: false, proposedAction: 'EXCLUDE_AFTER_VERIFIED_RECONCILIATION', risk: 'medium' };
  if (evidence.payments?.length && text(row.receiptId || row.allocationId || row.metadata?.receiptId || row.metadata?.allocationId)) return { classification: 'CANONICAL_SOURCE_ALREADY_EXISTS', reasonCode: 'PAYMENT_IDENTITY_CHAIN_EXISTS', autoApplicable: false, proposedAction: 'EXCLUDE_AFTER_VERIFIED_RECONCILIATION', risk: 'medium' };
  if (sourceType.includes('RETURN') || text(row.returnOrderId || row.metadata?.returnOrderId)) return { classification: 'RETURN_RECORDED_AS_ADJUSTMENT', reasonCode: 'RETURN_IDENTITY_PRESENT_CANONICAL_MISSING', autoApplicable: false, proposedAction: 'CANONICAL_RETURN_BACKFILL_REQUIRED', risk: 'high' };
  if (sourceType.includes('PAYMENT') || sourceType.includes('RECEIPT') || text(row.receiptId || row.allocationId || row.metadata?.receiptId || row.metadata?.allocationId)) return { classification: 'PAYMENT_RECORDED_AS_ADJUSTMENT', reasonCode: 'PAYMENT_IDENTITY_PRESENT_CANONICAL_MISSING', autoApplicable: false, proposedAction: 'CANONICAL_PAYMENT_BACKFILL_REQUIRED', risk: 'high' };
  if (sourceType.includes('REWARD') || sourceType.includes('ALLOWANCE')) return { classification: 'REWARD_RECORDED_AS_ADJUSTMENT', reasonCode: 'REWARD_SOURCE_TYPE_PRESENT', autoApplicable: false, proposedAction: 'MANUAL_REVIEW', risk: 'high' };
  if (sourceType.includes('MANUAL') && fields.length) return { classification: money(row.debit) > 0 ? 'MANUAL_VALID_DEBIT_ADJUSTMENT' : 'MANUAL_VALID_CREDIT_ADJUSTMENT', reasonCode: 'MANUAL_IDENTITY_PRESENT_REQUIRES_APPROVAL_EVIDENCE', autoApplicable: false, proposedAction: 'MANUAL_REVIEW', risk: 'medium' };
  if (sourceType.includes('DELIVERY_CLOSEOUT_CORRECTION') && fields.length) return { classification: 'CANONICAL_SOURCE_MISSING', reasonCode: 'CORRECTION_IDENTITY_PRESENT_CANONICAL_MISSING', autoApplicable: false, proposedAction: 'LEGACY_FALLBACK_UNTIL_SOURCE_AUDIT', risk: 'high' };
  return { classification: fields.length ? 'SOURCE_IDENTITY_AMBIGUOUS' : 'BUSINESS_EVIDENCE_INCOMPLETE', reasonCode: fields.length ? 'MULTIPLE_OR_UNPROVEN_SOURCE_FAMILY' : 'IMMUTABLE_SOURCE_FIELDS_MISSING', autoApplicable: false, proposedAction: 'MANUAL_REVIEW', risk: 'critical' };
}
function rowOutput(ledger = {}, evidence = {}, decision = {}) {
  const existingCanonical = [...(evidence.payments || []), ...(evidence.returns || []), ...(evidence.rewards || [])];
  return {
    adjustmentLedgerId: ledgerId(ledger),
    orderId: text(ledger.orderId || ledger.salesOrderId),
    orderCode: text(ledger.orderCode || ledger.salesOrderCode || ledger.sourceCode),
    customerCode: text(ledger.customerCode),
    debit: money(ledger.debit),
    credit: money(ledger.credit),
    netEffect: money(ledger.debit) - money(ledger.credit),
    accountingStatus: text(ledger.accountingStatus),
    active: ledger.active !== false,
    sourceType: text(ledger.sourceType),
    sourceId: text(ledger.sourceId),
    sourceVersion: text(ledger.sourceVersion || ledger.metadata?.sourceVersion),
    correctionId: text(ledger.correctionId),
    correctionVersion: text(ledger.correctionVersion || ledger.metadata?.correctionVersion),
    receiptId: text(ledger.receiptId || ledger.metadata?.receiptId),
    receiptCode: text(ledger.receiptCode || ledger.metadata?.receiptCode),
    allocationId: text(ledger.allocationId || ledger.metadata?.allocationId),
    confirmedReceiptAmount: 0,
    allocatedAmount: 0,
    returnId: text(ledger.returnOrderId || ledger.metadata?.returnOrderId),
    returnVersion: text(ledger.returnVersion || ledger.metadata?.returnVersion),
    confirmedReturnAmount: 0,
    rewardSourceId: text(ledger.rewardSourceId || ledger.metadata?.rewardSourceId),
    rewardAmount: 0,
    rewardDebtOffsetConfirmed: false,
    closeoutId: text(ledger.closeoutId || ledger.metadata?.closeoutId),
    closeoutVersion: text(ledger.closeoutVersion || ledger.metadata?.closeoutVersion),
    openingDebtAmount: 0,
    existingCanonicalLedgerIds: existingCanonical.map(ledgerId),
    existingCanonicalDebit: existingCanonical.reduce((sum, row) => sum + money(row.debit), 0),
    existingCanonicalCredit: existingCanonical.reduce((sum, row) => sum + money(row.credit), 0),
    sourceEvidenceComplete: sourceEvidenceFields(ledger).length > 0,
    sourceEvidenceFields: sourceEvidenceFields(ledger),
    sourceEvidenceConflicts: [],
    classification: decision.classification,
    reasonCode: decision.reasonCode,
    canonicalCategory: '',
    canonicalDebit: 0,
    canonicalCredit: 0,
    adjustmentCurrentlyIncluded: true,
    canonicalReplacementExists: existingCanonical.some((row) => text(row.metadata?.replacesLegacyAdjustmentLedgerId) === ledgerId(ledger)),
    balanceBefore: 0,
    expectedBalanceAfter: 0,
    autoApplicable: decision.autoApplicable,
    proposedAction: decision.proposedAction,
    risk: decision.risk
  };
}
async function audit(argv = process.argv.slice(2)) {
  const limit = parseLimit(argv);
  const orderCodes = parseOrderCodes(argv);
  const filter = {
    account: 'AR',
    category: 'AR-DEBT-ADJUSTMENT',
    active: { $ne: false },
    reversed: { $ne: true }
  };
  if (orderCodes.length) filter.$or = [{ orderCode: { $in: orderCodes } }, { salesOrderCode: { $in: orderCodes } }, { sourceCode: { $in: orderCodes } }];
  const ledgers = await ArLedger.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  const rows = [];
  for (const ledger of ledgers) {
    const [payments, returns, rewards] = await Promise.all([
      findEvidence(ledger, ['AR-DEBT-PAYMENT', 'AR-RECEIPT', 'AR-RECEIPT-CASH', 'AR-RECEIPT-BANK']),
      findEvidence(ledger, ['AR-RETURN']),
      findEvidence(ledger, ['AR-REWARD-ALLOWANCE', 'AR-BONUS', 'AR-ALLOWANCE', 'AR-BONUS-ALLOWANCE'])
    ]);
    const evidence = { payments, returns, rewards };
    rows.push(rowOutput(ledger, evidence, classify(ledger, evidence)));
  }
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260F-R1',
    mode: 'dry_run_read_only',
    status: 'AUDIT_EXECUTED',
    mutation: false,
    orderCodes,
    scannedCount: ledgers.length,
    classifiedCount: rows.length,
    backfilledCount: 0,
    alreadyCanonicalCount: rows.filter((row) => row.canonicalReplacementExists).length,
    unresolvedCount: rows.filter((row) => ['SOURCE_IDENTITY_AMBIGUOUS', 'BUSINESS_EVIDENCE_INCOMPLETE'].includes(row.classification)).length,
    failedCount: 0,
    skippedReason: '',
    warnings: [],
    rows
  };
}
function disconnectedReport(error, argv = process.argv.slice(2)) {
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260F-R1',
    mode: 'dry_run_read_only',
    status: 'PRODUCTION_AUDIT_NOT_EXECUTED',
    mutation: false,
    orderCodes: parseOrderCodes(argv),
    scannedCount: 0,
    classifiedCount: 0,
    backfilledCount: 0,
    alreadyCanonicalCount: 0,
    unresolvedCount: 0,
    failedCount: 0,
    skippedReason: 'MONGO_CONNECTION_FAILED',
    warnings: [text(error?.message)],
    rows: []
  };
}
function writeCsv(report = {}, file = CSV_OUT) {
  const headers = ['orderCode', 'customerCode', 'adjustmentLedgerId', 'debit', 'credit', 'netEffect', 'sourceType', 'sourceId', 'sourceVersion', 'correctionId', 'classification', 'reasonCode', 'proposedAction', 'autoApplicable', 'risk'];
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

module.exports = { audit, classify, disconnectedReport, writeCsv, sourceEvidenceFields };
