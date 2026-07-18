#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const ArLedger = require('../../src/models/ArLedger');
const { resolveDebtLedgerOwnership } = require('../../src/domain/ar/DebtLedgerOwnershipResolver');
const { CATEGORY_SEMANTIC_REGISTRY } = require('../../src/domain/ar/debtLedgerSemanticRegistry');

const ROOT = path.resolve(__dirname, '../..');
const JSON_OUT = path.join(ROOT, 'PHASE260D_R3_MIXED_LEDGER_AUDIT.json');
const CSV_OUT = path.join(ROOT, 'PHASE260D_R3_MIXED_LEDGER_AUDIT.csv');
const ACTIVE_CATEGORIES = Object.keys(CATEGORY_SEMANTIC_REGISTRY);

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
  return argv.includes('--allow-disconnected') || ['1', 'true', 'yes'].includes(lower(process.env.PHASE260D_AUDIT_ALLOW_DISCONNECTED));
}
function parseLimit(argv = process.argv.slice(2)) {
  const parsed = Number(argValue(argv, '--limit') || process.env.PHASE260D_AUDIT_LIMIT || 5000);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.floor(parsed), 50000)) : 5000;
}
function parseOrderCodes(argv = process.argv.slice(2)) {
  const raw = [argValue(argv, '--order-code'), argValue(argv, '--order-codes'), process.env.PHASE260D_AUDIT_ORDER_CODES]
    .filter(Boolean).join(',');
  return [...new Set(raw.split(',').map(text).filter(Boolean))];
}
function ledgerId(row = {}) {
  return text(row.id || row._id || row.code || row.ledgerId || row.idempotencyKey);
}
function byDecisionKey(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const role = row.semanticRole || '';
    const identity = row.businessEventIdentity || '';
    const key = `${role}::${identity}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}
function rowByLedgerId(rows = []) {
  const map = new Map();
  for (const row of rows) map.set(ledgerId(row), row);
  return map;
}
function decisionRows(ownership = {}) {
  const selected = rowByLedgerId(ownership.selectedEntries || []);
  const shadowed = rowByLedgerId(ownership.shadowedEntries || []);
  const duplicates = rowByLedgerId(ownership.duplicateEntries || []);
  const all = [...(ownership.selectedEntries || []), ...(ownership.shadowedEntries || []), ...(ownership.duplicateEntries || [])];
  const grouped = byDecisionKey(all);
  const rows = [];

  for (const decision of ownership.ownershipDecisions || []) {
    const ids = [...decision.selectedLedgerIds, ...decision.shadowedLedgerIds, ...decision.duplicateLedgerIds];
    if (!decision.shadowedLedgerIds.length && !decision.duplicateLedgerIds.length) continue;
    const entries = ids.map((id) => selected.get(id) || shadowed.get(id) || duplicates.get(id)).filter(Boolean);
    const currentNetEffect = entries.reduce((sum, item) => sum + money(item.ownershipEffect), 0);
    const selectedNetEffect = decision.selectedLedgerIds.reduce((sum, id) => sum + money((selected.get(id) || {}).ownershipEffect), 0);
    const classification = decision.duplicateLedgerIds.length ? 'ACTUAL_DUPLICATE_FINANCIAL_EFFECT' : 'PROJECTION_SHADOW';
    rows.push({
      orderId: text(entries[0]?.orderId || entries[0]?.salesOrderId),
      orderCode: text(entries[0]?.orderCode || entries[0]?.salesOrderCode),
      customerCode: text(entries[0]?.customerCode),
      semanticRole: text(decision.semanticRole),
      businessEventIdentity: text(decision.businessEventIdentity),
      sourceType: text(entries[0]?.sourceType),
      sourceId: text(entries[0]?.sourceId),
      sourceVersion: text(entries[0]?.sourceVersion || entries[0]?.metadata?.sourceVersion),
      ledgerIds: ids,
      categories: entries.map((item) => text(item.category || item.ledgerType)),
      ledgerFamilies: entries.map((item) => text(item.ledgerFamily)),
      debitTotal: entries.reduce((sum, item) => sum + money(item.debit), 0),
      creditTotal: entries.reduce((sum, item) => sum + money(item.credit), 0),
      currentNetEffect,
      expectedNetEffect: selectedNetEffect,
      projectionSelectedLedgerIds: decision.selectedLedgerIds,
      projectionShadowedLedgerIds: decision.shadowedLedgerIds,
      actualDuplicateLedgerIds: decision.duplicateLedgerIds,
      classification,
      reasonCode: decision.reasonCode,
      autoApplicable: false,
      proposedAction: classification === 'PROJECTION_SHADOW' ? 'PROJECTION_EXCLUDE_ONLY' : 'MANUAL_REVIEW_OR_CONTROLLED_REVERSAL',
      risk: classification === 'PROJECTION_SHADOW' ? 'none_runtime_projection_only' : 'high_requires_accounting_review',
      evidenceCompleteness: decision.confidencePolicy || ''
    });
  }

  for (const [key, entries] of grouped.entries()) {
    if ((ownership.ownershipDecisions || []).some((decision) => `${decision.semanticRole}::${decision.businessEventIdentity}` === key)) continue;
    rows.push(...entries.filter((entry) => entry.ownershipClassification === 'ACTUAL_DUPLICATE_FINANCIAL_EFFECT').map((entry) => ({
      orderId: text(entry.orderId || entry.salesOrderId),
      orderCode: text(entry.orderCode || entry.salesOrderCode),
      customerCode: text(entry.customerCode),
      semanticRole: text(entry.semanticRole),
      businessEventIdentity: text(entry.businessEventIdentity),
      sourceType: text(entry.sourceType),
      sourceId: text(entry.sourceId),
      sourceVersion: text(entry.sourceVersion || entry.metadata?.sourceVersion),
      ledgerIds: [ledgerId(entry)],
      categories: [text(entry.category || entry.ledgerType)],
      ledgerFamilies: [text(entry.ledgerFamily)],
      debitTotal: money(entry.debit),
      creditTotal: money(entry.credit),
      currentNetEffect: money(entry.ownershipEffect),
      expectedNetEffect: 0,
      projectionSelectedLedgerIds: [],
      projectionShadowedLedgerIds: [],
      actualDuplicateLedgerIds: [ledgerId(entry)],
      classification: 'ACTUAL_DUPLICATE_FINANCIAL_EFFECT',
      reasonCode: entry.ownershipReasonCode || 'MULTIPLE_ACTIVE_LEDGER_SAME_BUSINESS_EVENT',
      autoApplicable: false,
      proposedAction: 'MANUAL_REVIEW_OR_CONTROLLED_REVERSAL',
      risk: 'high_requires_accounting_review',
      evidenceCompleteness: 'MANUAL_REVIEW_REQUIRED'
    })));
  }

  return rows;
}
async function audit(argv = process.argv.slice(2)) {
  const limit = parseLimit(argv);
  const orderCodes = parseOrderCodes(argv);
  const filter = {
    active: { $ne: false },
    reversed: { $ne: true },
    category: { $in: ACTIVE_CATEGORIES }
  };
  if (orderCodes.length) filter.$or = [{ orderCode: { $in: orderCodes } }, { salesOrderCode: { $in: orderCodes } }, { sourceCode: { $in: orderCodes } }];
  const ledgers = await ArLedger.find(filter).sort({ orderCode: 1, createdAt: 1, _id: 1 }).limit(limit).lean();
  const ownership = resolveDebtLedgerOwnership(ledgers);
  const rows = decisionRows(ownership);
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260D-R3',
    mode: 'dry_run_read_only',
    status: 'AUDIT_EXECUTED',
    mutation: false,
    limit,
    orderCodes,
    scannedCount: ledgers.length,
    decisionCount: (ownership.ownershipDecisions || []).length,
    candidateCount: rows.length,
    diagnostics: ownership.diagnostics,
    rows
  };
}
function disconnectedReport(error, argv = process.argv.slice(2)) {
  return {
    generatedAt: new Date().toISOString(),
    phase: 'Phase260D-R3',
    mode: 'dry_run_read_only',
    status: 'PRODUCTION_AUDIT_NOT_EXECUTED',
    mutation: false,
    orderCodes: parseOrderCodes(argv),
    scannedCount: 0,
    decisionCount: 0,
    candidateCount: 0,
    connection: { ok: false, code: error?.name || 'MONGO_CONNECTION_FAILED', message: text(error?.message) },
    rows: []
  };
}
function writeCsv(report = {}, file = CSV_OUT) {
  const headers = ['orderCode', 'customerCode', 'semanticRole', 'businessEventIdentity', 'ledgerIds', 'categories', 'ledgerFamilies', 'currentNetEffect', 'expectedNetEffect', 'projectionSelectedLedgerIds', 'projectionShadowedLedgerIds', 'actualDuplicateLedgerIds', 'classification', 'reasonCode', 'autoApplicable', 'proposedAction', 'risk', 'evidenceCompleteness'];
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
  console.log(JSON.stringify({ status: report.status, scannedCount: report.scannedCount, candidateCount: report.candidateCount, json: path.basename(JSON_OUT), csv: path.basename(CSV_OUT) }, null, 2));
}
if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

module.exports = { audit, disconnectedReport, decisionRows, writeCsv };
