#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const FundLedger = require('../src/models/FundLedger');
const OrderPaymentAllocation = require('../src/models/OrderPaymentAllocation');
const DeliveryCashSubmission = require('../src/models/DeliveryCashSubmission');
const dateUtil = require('../src/utils/date.util');
const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');
const HistoricalFundOwnershipPolicy = require('../src/services/accounting/HistoricalFundOwnershipPolicy');

const ROOT = path.resolve(__dirname, '..');
const AUDIT_FILE = path.join(ROOT, 'PHASE258C_HISTORICAL_FUND_OWNERSHIP_AUDIT.json');
const EVIDENCE_FILE = path.join(ROOT, 'PHASE258C_FUND_OPENING_BALANCE_RECOVERY_EVIDENCE.json');
const MANUAL_REVIEW_FILE = path.join(ROOT, 'PHASE258C_FUND_OWNERSHIP_MANUAL_REVIEW.json');
const READ_ONLY_CODE = 'PHASE258C_AUDIT_READ_ONLY';

function text(value = '') {
  return String(value ?? '').trim();
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function money(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed)) : 0;
}

function signedAmount(row = {}) {
  const sign = lower(row.direction) === 'out' ? -1 : 1;
  return sign * money(row.amount ?? row.debit ?? row.credit);
}

function valueOf(name, argv = process.argv.slice(2)) {
  const eq = `${name}=`;
  const direct = argv.find((item) => item.startsWith(eq));
  if (direct) return direct.slice(eq.length);
  const index = argv.indexOf(name);
  return index >= 0 ? text(argv[index + 1]) : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--apply')) {
    const error = new Error('Phase258C historical ownership audit is read-only; --apply is not supported.');
    error.code = READ_ONLY_CODE;
    throw error;
  }
  const openingDate = dateUtil.toDateOnly(valueOf('--opening-date', argv) || valueOf('--date', argv) || dateUtil.todayVN());
  return {
    openingDate,
    dateFrom: dateUtil.toDateOnly(valueOf('--date-from', argv) || '', ''),
    dateTo: dateUtil.toDateOnly(valueOf('--date-to', argv) || '', ''),
    outputDir: path.resolve(valueOf('--output-dir', argv) || ROOT),
    json: argv.includes('--json'),
    writeArtifacts: !argv.includes('--no-write')
  };
}

function maskedDatabase(uri = process.env.MONGODB_URI || process.env.MONGO_URI || '') {
  const raw = text(uri);
  if (!raw) return 'configured-by-default';
  return raw
    .replace(/\/\/([^:/@]+):([^@]+)@/, '//***:***@')
    .replace(/[?].*$/, '?***');
}

function sourceFilter() {
  const values = [
    HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION,
    HistoricalFundOwnershipPolicy.DELIVERY_CASH_SUBMISSION
  ];
  return {
    $or: [
      { sourceType: { $in: values } },
      { refType: { $in: values } },
      { referenceType: { $in: values } }
    ]
  };
}

function dateFilter(options = {}) {
  const clauses = [];
  if (options.dateFrom || options.dateTo) {
    const range = {};
    if (options.dateFrom) range.$gte = options.dateFrom;
    if (options.dateTo) range.$lte = options.dateTo;
    clauses.push({ date: range }, { accountingDate: range }, { remittanceDate: range }, { deliveryDate: range });
  }
  return clauses.length ? { $or: clauses } : {};
}

function buildLedgerFilter(options = {}) {
  const parts = [sourceFilter()];
  const date = dateFilter(options);
  if (Object.keys(date).length) parts.push(date);
  return parts.length === 1 ? parts[0] : { $and: parts };
}

function addAmount(bucket, row = {}) {
  const amount = money(row.amount ?? row.debit ?? row.credit);
  bucket.rows += 1;
  if (HistoricalFundOwnershipPolicy.fundTypeOf(row) === 'bank') bucket.bankAmount += amount;
  else bucket.cashAmount += amount;
}

function emptyBucket() {
  return { rows: 0, cashAmount: 0, bankAmount: 0 };
}

function summarizeSourceRows(rows = []) {
  const summary = {
    opaRows: 0,
    dcsRows: 0,
    opaCashAmount: 0,
    opaBankAmount: 0,
    dcsCashAmount: 0,
    dcsBankAmount: 0
  };
  for (const row of rows) {
    const sourceType = HistoricalFundOwnershipPolicy.sourceTypeOf(row);
    const fundType = HistoricalFundOwnershipPolicy.fundTypeOf(row);
    const amount = money(row.amount ?? row.debit ?? row.credit);
    if (sourceType === HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION) {
      summary.opaRows += 1;
      if (fundType === 'bank') summary.opaBankAmount += amount;
      else summary.opaCashAmount += amount;
    }
    if (sourceType === HistoricalFundOwnershipPolicy.DELIVERY_CASH_SUBMISSION) {
      summary.dcsRows += 1;
      if (fundType === 'bank') summary.dcsBankAmount += amount;
      else summary.dcsCashAmount += amount;
    }
  }
  return summary;
}

function classificationSummary(classifications = []) {
  const out = {
    provenDuplicate: emptyBucket(),
    legacyOnly: emptyBucket(),
    partialOverlap: emptyBucket(),
    ambiguous: emptyBucket()
  };
  const byName = {
    [HistoricalFundOwnershipPolicy.CLASSIFICATION.PROVEN_DUPLICATE]: out.provenDuplicate,
    [HistoricalFundOwnershipPolicy.CLASSIFICATION.LEGACY_ONLY]: out.legacyOnly,
    [HistoricalFundOwnershipPolicy.CLASSIFICATION.PARTIAL_OVERLAP]: out.partialOverlap,
    [HistoricalFundOwnershipPolicy.CLASSIFICATION.AMBIGUOUS]: out.ambiguous
  };
  for (const item of classifications) {
    const bucket = byName[item.classification];
    if (!bucket) continue;
    addAmount(bucket, {
      amount: item.originalAmount,
      fundType: item.evidence?.groupKey?.split('|')?.[2] || 'cash'
    });
  }
  return out;
}

function balanceOf(rows = [], predicate = () => true, beforeDate = '') {
  const result = { cash: 0, bank: 0, total: 0 };
  for (const row of rows) {
    const date = FundBalanceReadService.canonicalDateOfRow(row);
    if (beforeDate && (!date || date >= beforeDate)) continue;
    if (!predicate(row)) continue;
    const signed = signedAmount(row);
    if (HistoricalFundOwnershipPolicy.fundTypeOf(row) === 'bank') result.bank += signed;
    else result.cash += signed;
    result.total += signed;
  }
  return result;
}

function phase258bPredicate(row = {}) {
  return HistoricalFundOwnershipPolicy.sourceTypeOf(row) !== HistoricalFundOwnershipPolicy.ORDER_PAYMENT_ALLOCATION;
}

function phase258cPredicate(ownershipByLedgerId) {
  return (row = {}) => HistoricalFundOwnershipPolicy.isBalanceAffecting(row, { ownershipByLedgerId });
}

function manualReviewRows(classifications = []) {
  return classifications
    .filter((item) => [
      HistoricalFundOwnershipPolicy.CLASSIFICATION.PARTIAL_OVERLAP,
      HistoricalFundOwnershipPolicy.CLASSIFICATION.AMBIGUOUS
    ].includes(item.classification))
    .map((item) => ({
      ledgerId: item.ledgerId,
      classification: item.classification,
      confidence: item.confidence,
      originalAmount: item.originalAmount,
      matchedAmount: item.matchedAmount,
      remainingLegacyAmount: item.remainingLegacyAmount,
      reason: item.evidence?.reason || '',
      groupKey: item.evidence?.groupKey || '',
      opaRows: item.evidence?.opaRows || 0,
      dcsRows: item.evidence?.dcsRows || 0,
      opaAmount: item.evidence?.opaAmount || 0,
      dcsAmount: item.evidence?.dcsAmount || 0
    }));
}

async function runAudit(options = {}) {
  const filter = buildLedgerFilter(options);
  const ledgers = await FundLedger.find(filter).lean();
  const [allocationCount, submissionCount] = await Promise.all([
    OrderPaymentAllocation.countDocuments({}),
    DeliveryCashSubmission.countDocuments({})
  ]);
  const ownershipByLedgerId = HistoricalFundOwnershipPolicy.classifyOwnership(ledgers);
  const classifications = Array.from(ownershipByLedgerId.values());
  const phase258b = balanceOf(ledgers, phase258bPredicate, options.openingDate);
  const phase258c = balanceOf(ledgers, phase258cPredicate(ownershipByLedgerId), options.openingDate);
  const raw = balanceOf(ledgers, () => true, options.openingDate);

  const audit = {
    generatedAt: dateUtil.nowIso(),
    mode: 'read-only',
    database: maskedDatabase(),
    scope: {
      dateFrom: options.dateFrom || 'all',
      dateTo: options.dateTo || 'all',
      openingDate: options.openingDate
    },
    summary: {
      ...summarizeSourceRows(ledgers),
      orderPaymentAllocationDocuments: allocationCount,
      deliveryCashSubmissionDocuments: submissionCount
    },
    classification: classificationSummary(classifications),
    openingBalanceImpact: {
      phase258b,
      phase258c,
      delta: {
        cash: phase258c.cash - phase258b.cash,
        bank: phase258c.bank - phase258b.bank,
        total: phase258c.total - phase258b.total
      }
    }
  };

  const evidence = {
    generatedAt: audit.generatedAt,
    mode: 'read-only-production-audit',
    openingDate: options.openingDate,
    balanceBeforePhase258B: raw,
    balanceByPhase258B: phase258b,
    balanceByPhase258C: phase258c,
    provenDuplicateRemoved: audit.classification.provenDuplicate,
    legacyOnlyRestored: audit.classification.legacyOnly,
    ambiguousPreserved: audit.classification.ambiguous,
    partialOverlapManualReview: audit.classification.partialOverlap,
    cashResult: { phase258b: phase258b.cash, phase258c: phase258c.cash, delta: phase258c.cash - phase258b.cash },
    bankResult: { phase258b: phase258b.bank, phase258c: phase258c.bank, delta: phase258c.bank - phase258b.bank }
  };

  const manualReview = {
    generatedAt: audit.generatedAt,
    mode: 'read-only',
    count: manualReviewRows(classifications).length,
    rows: manualReviewRows(classifications)
  };

  return { audit, evidence, manualReview };
}

function writeArtifacts(result = {}, outputDir = ROOT) {
  fs.mkdirSync(outputDir, { recursive: true });
  const targets = [
    [AUDIT_FILE, result.audit],
    [EVIDENCE_FILE, result.evidence],
    [MANUAL_REVIEW_FILE, result.manualReview]
  ].map(([file, data]) => [path.join(outputDir, path.basename(file)), data]);
  for (const [file, data] of targets) {
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  }
  return targets.map(([file]) => file);
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await runAudit(options);
  if (options.writeArtifacts) result.artifacts = writeArtifacts(result, options.outputDir);
  if (options.json) console.log(JSON.stringify(result.audit, null, 2));
  else {
    console.log(`PHASE258C_AUDIT_READ_ONLY opening=${options.openingDate}`);
    console.log(`OPA rows=${result.audit.summary.opaRows} DCS rows=${result.audit.summary.dcsRows}`);
    console.log(`Phase258C delta cash=${result.audit.openingBalanceImpact.delta.cash} bank=${result.audit.openingBalanceImpact.delta.bank}`);
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      const code = error.code || 'PHASE258C_AUDIT_FAILED';
      console.error(`${code}: ${error.message}`);
      process.exitCode = code === READ_ONLY_CODE ? 2 : 1;
    })
    .finally(async () => {
      try { if (mongoose.connection.readyState) await mongoose.disconnect(); } catch (_) {}
    });
}

module.exports = {
  READ_ONLY_CODE,
  parseArgs,
  buildLedgerFilter,
  runAudit,
  writeArtifacts,
  manualReviewRows,
  phase258bPredicate,
  phase258cPredicate
};
