#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const ArLedger = require('../../src/models/ArLedger');
const DeliveryCloseoutCorrection = require('../../src/models/DeliveryCloseoutCorrection');
const { calculateCorrectionDebtDelta } = require('../../src/domain/accounting/correctionDebtDelta');

const ROOT = path.resolve(__dirname, '../..');
const JSON_OUT = path.join(ROOT, 'PHASE260C_R2_DEBT_CORRECTION_AUDIT.json');
const CSV_OUT = path.join(ROOT, 'PHASE260C_R2_DEBT_CORRECTION_AUDIT.csv');

function text(value = '') { return String(value ?? '').trim(); }
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
  return argv.includes('--allow-disconnected') || ['1', 'true', 'yes'].includes(lower(process.env.PHASE260C_AUDIT_ALLOW_DISCONNECTED));
}
function parseLimit(argv = process.argv.slice(2)) {
  const parsed = Number(argValue(argv, '--limit') || process.env.PHASE260C_AUDIT_LIMIT || 5000);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.floor(parsed), 50000)) : 5000;
}
function parseOrderCodes(argv = process.argv.slice(2)) {
  const raw = [argValue(argv, '--order-code'), argValue(argv, '--order-codes'), process.env.PHASE260C_AUDIT_ORDER_CODES]
    .filter(Boolean).join(',');
  return [...new Set(raw.split(',').map(text).filter(Boolean))];
}
function ledgerId(row = {}) {
  return text(row.id || row._id || row.code);
}
function actualDebtEffect(ledger = {}) {
  return money(ledger.debit) - money(ledger.credit);
}
function correctionDeltas(correction = {}, ledger = {}) {
  const metadata = ledger.metadata && typeof ledger.metadata === 'object' ? ledger.metadata : {};
  return {
    receivableDelta: money(metadata.receivableDelta ?? correction.receivableDelta ?? 0),
    cashDelta: money(metadata.cashDelta ?? correction.cashDeltaAmount ?? 0),
    bankDelta: money(metadata.bankDelta ?? correction.bankDeltaAmount ?? 0),
    rewardDelta: money(metadata.rewardDelta ?? correction.rewardDeltaAmount ?? 0),
    returnDelta: money(metadata.returnDelta ?? correction.returnAdjustmentAmount ?? ledger.returnAdjustmentAmount ?? 0)
  };
}
function classifyCandidate({ ledger = {}, correction = null, confirmedReceiptEvidence = null } = {}) {
  const deltas = correctionDeltas(correction || {}, ledger);
  const expectedDebtDelta = calculateCorrectionDebtDelta(deltas);
  const actual = actualDebtEffect(ledger);
  const difference = money(actual - expectedDebtDelta);
  const alreadyReversed = Boolean(ledger.reversed || lower(ledger.status) === 'reversed' || lower(ledger.accountingStatus) === 'reversed');
  const alreadyRepaired = Boolean(ledger.metadata && ledger.metadata.phase260cRepairRunId);
  let classification = difference === 0 ? 'CORRECT_DELTA' : 'FINAL_STATE_RECONSTRUCTION';
  let reasonCode = difference === 0 ? 'NO_ACTION_REQUIRED' : 'ACTUAL_EFFECT_DIFFERS_FROM_EVENT_DELTA';
  if (alreadyReversed) {
    classification = 'ALREADY_REVERSED';
    reasonCode = 'LEDGER_ALREADY_REVERSED';
  } else if (alreadyRepaired) {
    classification = 'ALREADY_REPAIRED';
    reasonCode = 'LEDGER_ALREADY_REPAIRED';
  } else if (!correction) {
    classification = 'BUSINESS_EVIDENCE_INCOMPLETE';
    reasonCode = 'MISSING_CORRECTION_SOURCE';
  } else if (deltas.returnDelta > 0 && actual > 0) {
    classification = confirmedReceiptEvidence ? 'DEBT_RECREATED_AFTER_PAYMENT' : 'RETURN_INCREASE_POSTED_AS_DEBIT';
    reasonCode = confirmedReceiptEvidence ? 'DEBT_RECREATED_AFTER_PAYMENT' : 'RETURN_INCREASE_POSTED_AS_DEBIT';
  } else if (difference === 0) {
    classification = 'CORRECT_DELTA';
    reasonCode = 'NO_ACTION_REQUIRED';
  }
  const autoApplicable = ['DEBT_RECREATED_AFTER_PAYMENT', 'RETURN_INCREASE_POSTED_AS_DEBIT', 'FINAL_STATE_RECONSTRUCTION'].includes(classification)
    && Boolean(correction)
    && !alreadyReversed
    && !alreadyRepaired
    && money(expectedDebtDelta) !== money(actual);
  return { ...deltas, expectedDebtDelta, actualDebtEffect: actual, difference, alreadyReversed, alreadyRepaired, classification, reasonCode, autoApplicable };
}
function publicRow({ ledger = {}, correction = null, receipt = null } = {}) {
  const classified = classifyCandidate({ ledger, correction, confirmedReceiptEvidence: receipt });
  return {
    orderId: text(ledger.orderId || ledger.salesOrderId || correction?.orderId || correction?.salesOrderId),
    orderCode: text(ledger.orderCode || ledger.salesOrderCode || correction?.orderCode || correction?.salesOrderCode),
    customerCode: text(ledger.customerCode || correction?.customerCode),
    correctionId: text(ledger.correctionId || ledger.sourceId || correction?.id),
    correctionVersion: text(ledger.deliveryCloseoutVersion || correction?.newCloseoutVersion),
    ledgerId: ledgerId(ledger),
    ledgerCode: text(ledger.code),
    category: text(ledger.category || ledger.ledgerType),
    currentDebit: money(ledger.debit),
    currentCredit: money(ledger.credit),
    confirmedReceiptEvidence: receipt ? { ledgerId: ledgerId(receipt), credit: money(receipt.credit), category: text(receipt.category || receipt.ledgerType) } : null,
    returnEvidence: correction ? { correctionId: text(correction.id), returnAdjustmentAmount: money(correction.returnAdjustmentAmount) } : null,
    risk: classified.autoApplicable ? 'controlled_reversal_required' : 'manual_review_or_no_action',
    proposedAction: classified.autoApplicable ? 'reverse_wrong_adjustment_then_post_correct_event_delta' : 'no_auto_apply',
    ...classified
  };
}
async function loadCorrectionForLedger(ledger = {}, options = {}) {
  const keys = [ledger.correctionId, ledger.sourceId, ledger.refId].map(text).filter(Boolean);
  if (!keys.length) return null;
  let query = DeliveryCloseoutCorrection.findOne({ $or: [{ id: { $in: keys } }, { correctionCode: { $in: keys } }, { code: { $in: keys } }] }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  return query;
}
async function loadReceiptEvidence(ledger = {}, options = {}) {
  const keys = [ledger.orderId, ledger.orderCode, ledger.salesOrderId, ledger.salesOrderCode].map(text).filter(Boolean);
  if (!keys.length) return null;
  let query = ArLedger.findOne({
    active: { $ne: false },
    reversed: { $ne: true },
    category: { $in: ['AR-DEBT-PAYMENT', 'AR-RECEIPT', 'AR-RECEIPT-CASH', 'AR-RECEIPT-BANK'] },
    credit: { $gt: 0 },
    $or: [{ orderId: { $in: keys } }, { orderCode: { $in: keys } }, { salesOrderId: { $in: keys } }, { salesOrderCode: { $in: keys } }]
  }).sort({ createdAt: -1 }).lean();
  if (options.session && typeof query.session === 'function') query = query.session(options.session);
  return query;
}
async function audit(argv = process.argv.slice(2), options = {}) {
  const limit = parseLimit(argv);
  const orderCodes = parseOrderCodes(argv);
  const filter = {
    category: 'AR-DEBT-ADJUSTMENT',
    sourceType: 'DELIVERY_CLOSEOUT_CORRECTION',
    active: { $ne: false },
    reversed: { $ne: true }
  };
  if (orderCodes.length) filter.$or = [{ orderCode: { $in: orderCodes } }, { salesOrderCode: { $in: orderCodes } }, { sourceCode: { $in: orderCodes } }];
  const ledgers = await ArLedger.find(filter).sort({ createdAt: -1, updatedAt: -1 }).limit(limit).lean();
  const rows = [];
  for (const ledger of ledgers) {
    const correction = await loadCorrectionForLedger(ledger, options);
    const receipt = await loadReceiptEvidence(ledger, options);
    const row = publicRow({ ledger, correction, receipt });
    if (row.classification !== 'CORRECT_DELTA') rows.push(row);
  }
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260C-R2',
    mode: 'dry_run_read_only',
    status: 'AUDIT_EXECUTED',
    mutation: false,
    limit,
    orderCodes,
    scannedCount: ledgers.length,
    candidateCount: rows.length,
    rows
  };
}
function disconnectedReport(error) {
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260C-R2',
    mode: 'dry_run_read_only',
    status: 'AUDIT_NOT_EXECUTED',
    mutation: false,
    scannedCount: 0,
    candidateCount: 0,
    connection: { ok: false, code: error?.name || 'MONGO_CONNECTION_FAILED', message: text(error?.message) },
    rows: []
  };
}
function writeCsv(report = {}, file = CSV_OUT) {
  const headers = ['orderId', 'orderCode', 'customerCode', 'correctionId', 'correctionVersion', 'ledgerId', 'category', 'currentDebit', 'currentCredit', 'actualDebtEffect', 'expectedDebtDelta', 'difference', 'returnDelta', 'cashDelta', 'bankDelta', 'rewardDelta', 'receivableDelta', 'alreadyReversed', 'alreadyRepaired', 'classification', 'reasonCode', 'autoApplicable', 'risk', 'proposedAction'];
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
    report = disconnectedReport(error);
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`);
  writeCsv(report);
  console.log(JSON.stringify({ status: report.status, scannedCount: report.scannedCount, candidateCount: report.candidateCount, json: path.basename(JSON_OUT), csv: path.basename(CSV_OUT) }, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

module.exports = { audit, classifyCandidate, publicRow, disconnectedReport, writeCsv, correctionDeltas, actualDebtEffect };
