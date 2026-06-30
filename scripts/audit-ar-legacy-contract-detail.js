#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const ArLedger = require('../src/models/ArLedger');
const SalesOrder = require('../src/models/SalesOrder');
const ReturnOrder = require('../src/models/ReturnOrder');
const DebtCollection = require('../src/models/DebtCollection');
const FundLedger = require('../src/models/FundLedger');
const { buildLegacyDetail, ledgerTokens, clean } = require('./lib/arLegacyNormalizationCore');

function parseArgs(argv = process.argv.slice(2)) {
  const args = new Set(argv);
  const valueOf = (name) => {
    const prefix = `${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] || '' : '';
  };
  return { json: args.has('--json'), markdown: args.has('--markdown'), sourceId: valueOf('--sourceId'), customerCode: valueOf('--customerCode') };
}

function buildLedgerFilter(options = {}) {
  const filter = { account: 'AR' };
  if (options.customerCode) filter.customerCode = options.customerCode;
  if (options.sourceId) {
    const pattern = new RegExp(options.sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    filter.$or = [{ sourceId: options.sourceId }, { orderId: options.sourceId }, { salesOrderId: options.sourceId }, { code: pattern }, { id: pattern }];
  }
  return filter;
}

function inChunks(values = [], size = 500) {
  const out = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

async function findInChunks(Model, orParts = [], limit = 20000) {
  const rows = [];
  for (const parts of inChunks(orParts, 20)) {
    const found = await Model.find({ $or: parts }).limit(limit).lean();
    rows.push(...found);
  }
  const seen = new Set();
  return rows.filter((row) => {
    const key = clean(row._id || row.id || row.code);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadRelatedSources(ledgers = []) {
  const tokens = [...new Set(ledgers.flatMap(ledgerTokens).filter(Boolean))];
  const ledgerIds = ledgers.map((row) => clean(row.id || row.code || row._id)).filter(Boolean);
  if (!tokens.length) return { salesOrders: [], returnOrders: [], debtCollections: [], fundLedgers: [] };
  const salesOrders = await findInChunks(SalesOrder, [
    { id: { $in: tokens } }, { orderId: { $in: tokens } }, { salesOrderId: { $in: tokens } },
    { code: { $in: tokens } }, { orderCode: { $in: tokens } }, { salesOrderCode: { $in: tokens } }
  ]);
  const returnOrders = await findInChunks(ReturnOrder, [
    { id: { $in: tokens } }, { code: { $in: tokens } }, { returnOrderId: { $in: tokens } }, { returnOrderCode: { $in: tokens } },
    { sourceOrderId: { $in: tokens } }, { salesOrderId: { $in: tokens } }, { orderId: { $in: tokens } },
    { sourceOrderCode: { $in: tokens } }, { salesOrderCode: { $in: tokens } }, { orderCode: { $in: tokens } }
  ]);
  const debtCollections = await findInChunks(DebtCollection, [
    { id: { $in: tokens } }, { code: { $in: tokens } }, { idempotencyKey: { $in: tokens } }, { arLedgerIds: { $in: ledgerIds } }
  ]);
  const fundLedgers = await findInChunks(FundLedger, [
    { id: { $in: tokens } }, { code: { $in: tokens } }, { idempotencyKey: { $in: tokens } },
    { sourceId: { $in: tokens } }, { sourceCode: { $in: tokens } }, { refId: { $in: tokens } }, { refCode: { $in: tokens } }
  ]);
  return { salesOrders, returnOrders, debtCollections, fundLedgers };
}

function toMarkdown(report = {}) {
  const lines = [];
  lines.push('# PHASE81 AR Legacy Contract Detail Audit');
  lines.push('');
  lines.push(`- GeneratedAt: ${report.generatedAt}`);
  lines.push(`- ReadOnly: ${report.readOnly}`);
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- InvalidContractRows: ${report.summary.invalidContractRows}`);
  lines.push(`- MatchedSalesOrders: ${report.summary.matchedSalesOrders}`);
  lines.push(`- MatchedReturnOrders: ${report.summary.matchedReturnOrders}`);
  lines.push(`- MatchedDebtCollections: ${report.summary.matchedDebtCollections}`);
  lines.push('');
  lines.push('## By inferred kind');
  for (const [key, value] of Object.entries(report.summary.byKind || {}).sort()) lines.push(`- ${key || '(unknown)'}: ${value}`);
  lines.push('');
  lines.push('## Sample rows');
  for (const item of (report.details || []).slice(0, 80)) {
    lines.push(`- ${item.ledgerId} | kind=${item.kind || '(unknown)'} | ok=${item.validation.ok} | sales=${item.matchedSalesOrder?.id || ''} | return=${item.matchedReturnOrder?.id || ''} | collection=${item.matchedDebtCollection?.id || ''}`);
  }
  return `${lines.join('\n')}\n`;
}

async function buildReport(options = {}) {
  const ledgers = await ArLedger.find(buildLedgerFilter(options)).lean();
  const sources = await loadRelatedSources(ledgers);
  const details = buildLegacyDetail(ledgers, sources);
  const byKind = {};
  for (const item of details) byKind[item.kind || '(unknown)'] = (byKind[item.kind || '(unknown)'] || 0) + 1;
  return {
    mode: 'phase81-legacy-detail-audit',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    options,
    sourceCounts: Object.fromEntries(Object.entries(sources).map(([key, value]) => [key, value.length])),
    summary: {
      rows: ledgers.length,
      invalidContractRows: details.filter((item) => !item.validation.ok).length,
      matchedSalesOrders: details.filter((item) => item.matchedSalesOrder).length,
      matchedReturnOrders: details.filter((item) => item.matchedReturnOrder).length,
      matchedDebtCollections: details.filter((item) => item.matchedDebtCollection).length,
      byKind
    },
    details
  };
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const report = await buildReport(options);
  const reportsDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, 'ar-legacy-contract-detail.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(reportsDir, 'ar-legacy-contract-detail.md'), toMarkdown(report));
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else if (options.markdown) console.log(toMarkdown(report));
  else console.log('Đã tạo audit detail: reports/ar-legacy-contract-detail.json và reports/ar-legacy-contract-detail.md');
  await mongoose.connection.close();
}

if (require.main === module) main().catch(async (err) => { console.error('[audit-ar-legacy-contract-detail] failed:', err); try { await mongoose.connection.close(); } catch (_) {} process.exit(1); });
module.exports = { buildReport, loadRelatedSources, toMarkdown };
