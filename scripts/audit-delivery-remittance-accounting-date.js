#!/usr/bin/env node
'use strict';

/**
 * Phase230 read-only audit.
 *
 * Reconciles deliveryDate, line-level remittanceDate and canonical fund-ledger
 * accounting date for delivery cash submissions. It never updates, deletes,
 * reverses or reposts production data.
 */

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const DeliveryCashSubmission = require('../src/models/DeliveryCashSubmission');
const FundLedger = require('../src/models/FundLedger');
const dateUtil = require('../src/utils/date.util');
const {
  normalizeLines,
  linesFromLegacyAmounts,
  canonicalMethod
} = require('../src/domain/fund/deliveryRemittanceLines');

function text(value = '') { return String(value ?? '').trim(); }
function money(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}
function dateOnly(value = '') { return dateUtil.toDateOnly(value, ''); }
function identity(row = {}) { return text(row.id || row.code || row._id); }

function parseArgs(argv = process.argv.slice(2)) {
  const value = (name, fallback = '') => {
    const arg = argv.find((item) => item.startsWith(`${name}=`));
    return arg ? arg.slice(name.length + 1) : fallback;
  };
  return {
    fixture: argv.includes('--fixture'),
    json: argv.includes('--json'),
    deliveryDate: dateOnly(value('--delivery-date', '')),
    deliveryStaffCode: text(value('--delivery-staff-code', '')),
    submissionCode: text(value('--submission-code', '')),
    limit: Math.min(5000, Math.max(1, Number(value('--limit', '1000')) || 1000))
  };
}

function fixtureData() {
  const submissions = [
    {
      id: 'SUB-CORRECT', code: 'NQGH-20260709-ghtp-CORRECT', deliveryDate: '2026-07-09',
      deliveryStaffCode: 'ghtp', status: 'confirmed', confirmedAt: '2026-07-10T02:00:00.000Z',
      remittanceLines: [{ lineId: 'CASH-CORRECT', method: 'cash', amount: 15533000, remittanceDate: '2026-07-10', status: 'confirmed', fundLedgerId: 'FL-CORRECT' }]
    },
    {
      id: 'SUB-WRONG', code: 'NQGH-20260709-ghtp-WRONG', deliveryDate: '2026-07-09',
      deliveryStaffCode: 'ghtp', status: 'confirmed', confirmedAt: '2026-07-10T02:10:00.000Z',
      remittanceLines: [{ lineId: 'CASH-WRONG', method: 'cash', amount: 15533000, remittanceDate: '2026-07-10', status: 'confirmed', fundLedgerId: 'FL-WRONG' }]
    },
    {
      id: 'SUB-LEGACY', code: 'NQGH-20260709-ghtp-LEGACY', deliveryDate: '2026-07-09',
      deliveryStaffCode: 'ghtp', status: 'confirmed', fundPosted: true, confirmedAt: '2026-07-10T03:00:00.000Z',
      submittedCashAmount: 1000000, remittanceLines: []
    }
  ];
  const ledgers = [
    {
      id: 'FL-CORRECT', code: 'FL-CORRECT', sourceType: 'DELIVERY_CASH_SUBMISSION', sourceId: 'SUB-CORRECT',
      sourceCode: 'NQGH-20260709-ghtp-CORRECT', sourceLineId: 'CASH-CORRECT', fundType: 'cash', amount: 15533000,
      date: '2026-07-10', accountingDate: '2026-07-10', remittanceDate: '2026-07-10', deliveryDate: '2026-07-09',
      createdAt: '2026-07-10T02:00:00.000Z'
    },
    {
      id: 'FL-WRONG', code: 'FL-WRONG', sourceType: 'DELIVERY_CASH_SUBMISSION', sourceId: 'SUB-WRONG',
      sourceCode: 'NQGH-20260709-ghtp-WRONG', sourceLineId: 'CASH-WRONG', fundType: 'cash', amount: 15533000,
      date: '2026-07-09', accountingDate: '2026-07-09', remittanceDate: '', deliveryDate: '2026-07-09',
      createdAt: '2026-07-10T02:10:00.000Z'
    },
    {
      id: 'FL-LEGACY', code: 'FL-LEGACY', sourceType: 'DELIVERY_CASH_SUBMISSION', sourceId: 'SUB-LEGACY',
      sourceCode: 'NQGH-20260709-ghtp-LEGACY', fundType: 'cash', amount: 1000000,
      date: '2026-07-09', accountingDate: '2026-07-09', remittanceDate: '', deliveryDate: '2026-07-09',
      createdAt: '2026-07-10T03:00:00.000Z'
    }
  ];
  return { submissions, ledgers };
}

function buildLedgerIndexes(ledgers = []) {
  const byId = new Map();
  const byLine = new Map();
  const bySubmission = new Map();
  for (const ledger of ledgers || []) {
    for (const key of [ledger.id, ledger.code, ledger._id].map(text).filter(Boolean)) byId.set(key, ledger);
    if (text(ledger.sourceLineId)) byLine.set(text(ledger.sourceLineId), ledger);
    for (const key of [ledger.sourceId, ledger.sourceCode, ledger.referenceId, ledger.referenceCode].map(text).filter(Boolean)) {
      if (!bySubmission.has(key)) bySubmission.set(key, []);
      bySubmission.get(key).push(ledger);
    }
  }
  return { byId, byLine, bySubmission };
}

function legacyLines(submission = {}, relatedLedgers = []) {
  if (relatedLedgers.length) {
    return relatedLedgers.map((ledger, index) => ({
      lineId: text(ledger.sourceLineId) || `LEGACY-${identity(ledger) || index + 1}`,
      method: ledger.fundType,
      amount: money(ledger.amount),
      remittanceDate: dateOnly(ledger.remittanceDate || ''),
      status: 'confirmed',
      fundLedgerId: identity(ledger),
      legacyDerived: true,
      manualReviewRequired: !dateOnly(ledger.remittanceDate || '')
    }));
  }
  return linesFromLegacyAmounts(submission, {
    submissionIdentity: identity(submission),
    defaultRemittanceDate: '',
    defaultStatus: text(submission.status).toLowerCase() === 'confirmed' ? 'confirmed' : 'draft'
  });
}

function findLedgerForLine(submission, line, indexes, usedLedgerIds) {
  const explicit = indexes.byId.get(text(line.fundLedgerId));
  if (explicit) return explicit;
  const byLine = indexes.byLine.get(text(line.lineId));
  if (byLine) return byLine;
  const related = [
    ...(indexes.bySubmission.get(text(submission.id)) || []),
    ...(indexes.bySubmission.get(text(submission.code)) || [])
  ];
  return related.find((ledger) => {
    const id = identity(ledger);
    if (usedLedgerIds.has(id)) return false;
    return canonicalMethod(ledger.fundType) === canonicalMethod(line.method)
      && money(ledger.amount) === money(line.amount);
  }) || null;
}

function auditLine(submission, line, ledger) {
  const deliveryDate = dateOnly(submission.deliveryDate);
  const declaredRemittanceDate = dateOnly(line.remittanceDate);
  const fundLedgerDate = dateOnly(ledger?.date);
  const fundLedgerAccountingDate = dateOnly(ledger?.accountingDate || ledger?.date);
  const confirmedAt = text(line.confirmedAt || submission.confirmedAt || ledger?.createdAt);
  const confirmedDate = dateOnly(confirmedAt);
  const dateMatchesRemittance = Boolean(declaredRemittanceDate
    && fundLedgerDate === declaredRemittanceDate
    && fundLedgerAccountingDate === declaredRemittanceDate);
  const dateMatchesDelivery = Boolean(deliveryDate
    && fundLedgerDate === deliveryDate
    && fundLedgerAccountingDate === deliveryDate);
  const suspectedBackdatedPosting = Boolean(
    dateMatchesDelivery
    && ((declaredRemittanceDate && declaredRemittanceDate !== deliveryDate)
      || (!declaredRemittanceDate && confirmedDate && confirmedDate > deliveryDate))
  );

  let severity = 'OK';
  let mismatchReason = '';
  if (!ledger) {
    severity = text(line.status).toLowerCase() === 'confirmed' ? 'P0_REMITTANCE_LEDGER_DATE_MISMATCH' : 'WARNING_MISSING_REMITTANCE_DATE';
    mismatchReason = 'CONFIRMED_LINE_WITHOUT_FUND_LEDGER';
  } else if (!declaredRemittanceDate) {
    severity = 'WARNING_MISSING_REMITTANCE_DATE';
    mismatchReason = suspectedBackdatedPosting
      ? 'LEGACY_LINE_MISSING_REMITTANCE_DATE_AND_POSTED_ON_DELIVERY_DATE'
      : 'LEGACY_LINE_MISSING_DECLARED_REMITTANCE_DATE';
  } else if (suspectedBackdatedPosting) {
    severity = 'P0_FUND_LEDGER_POSTED_ON_DELIVERY_DATE';
    mismatchReason = 'FUND_LEDGER_DATE_EQUALS_DELIVERY_DATE_INSTEAD_OF_REMITTANCE_DATE';
  } else if (!dateMatchesRemittance) {
    severity = 'P0_REMITTANCE_LEDGER_DATE_MISMATCH';
    mismatchReason = 'FUND_LEDGER_DATE_OR_ACCOUNTING_DATE_DIFFERS_FROM_REMITTANCE_DATE';
  }

  return {
    remittanceCode: text(submission.code),
    remittanceId: identity(submission),
    deliveryStaffCode: text(submission.deliveryStaffCode),
    deliveryDate,
    remittanceLineId: text(line.lineId),
    method: canonicalMethod(line.method || line.fundType),
    amount: money(line.amount),
    declaredRemittanceDate,
    fundLedgerId: identity(ledger || {}),
    fundLedgerDate,
    fundLedgerAccountingDate,
    confirmedAt,
    dateMatchesRemittance,
    dateMatchesDelivery,
    suspectedBackdatedPosting,
    mismatchReason,
    severity,
    readOnly: true,
    remediationPlan: severity.startsWith('P0_')
      ? {
        applyAutomatically: false,
        steps: [
          'Create accounting-safe reversal for the original fund ledger on its original accounting date.',
          'Create one replacement fund ledger on the declared remittanceDate.',
          'Link reversal and replacement to the original submission, line and ledger.',
          'Never hard-delete or directly mutate the posted ledger date.'
        ]
      }
      : null
  };
}

function auditData(submissions = [], ledgers = [], options = {}) {
  const indexes = buildLedgerIndexes(ledgers);
  const rows = [];
  for (const submission of submissions || []) {
    if (options.deliveryDate && dateOnly(submission.deliveryDate) !== options.deliveryDate) continue;
    if (options.deliveryStaffCode && text(submission.deliveryStaffCode) !== options.deliveryStaffCode) continue;
    if (options.submissionCode && text(submission.code) !== options.submissionCode) continue;
    const related = [
      ...(indexes.bySubmission.get(text(submission.id)) || []),
      ...(indexes.bySubmission.get(text(submission.code)) || [])
    ].filter((ledger, index, all) => all.findIndex((item) => identity(item) === identity(ledger)) === index);
    const persisted = normalizeLines(submission.remittanceLines, { submissionIdentity: identity(submission) });
    const lines = persisted.length ? persisted : legacyLines(submission, related);
    const used = new Set();
    for (const line of lines) {
      const ledger = findLedgerForLine(submission, line, indexes, used);
      if (ledger) used.add(identity(ledger));
      rows.push(auditLine(submission, line, ledger));
    }
  }
  const counts = rows.reduce((result, row) => {
    result[row.severity] = (result[row.severity] || 0) + 1;
    return result;
  }, {});
  const hasP0 = rows.some((row) => row.severity.startsWith('P0_'));
  const hasWarning = rows.some((row) => row.severity.startsWith('WARNING_'));
  return {
    readOnly: true,
    generatedAt: new Date().toISOString(),
    filters: {
      deliveryDate: options.deliveryDate || '',
      deliveryStaffCode: options.deliveryStaffCode || '',
      submissionCode: options.submissionCode || ''
    },
    submissionCount: new Set(rows.map((row) => row.remittanceId)).size,
    lineCount: rows.length,
    countsBySeverity: counts,
    severity: hasP0 ? 'P0_REMITTANCE_ACCOUNTING_DATE_MISMATCH' : (hasWarning ? 'WARNING' : 'OK'),
    rows,
    writesPerformed: 0
  };
}

async function runProduction(options) {
  await connectDB();
  const submissionFilter = { status: { $in: ['confirmed', 'partially_confirmed'] } };
  if (options.deliveryDate) submissionFilter.deliveryDate = options.deliveryDate;
  if (options.deliveryStaffCode) submissionFilter.deliveryStaffCode = options.deliveryStaffCode;
  if (options.submissionCode) submissionFilter.code = options.submissionCode;
  const submissions = await DeliveryCashSubmission.find(submissionFilter).limit(options.limit).lean();
  const ids = submissions.map((row) => text(row.id)).filter(Boolean);
  const codes = submissions.map((row) => text(row.code)).filter(Boolean);
  const or = [];
  if (ids.length) or.push({ sourceId: { $in: ids } }, { referenceId: { $in: ids } });
  if (codes.length) or.push({ sourceCode: { $in: codes } }, { referenceCode: { $in: codes } });
  const ledgers = or.length
    ? await FundLedger.find({ sourceType: 'DELIVERY_CASH_SUBMISSION', $or: or }).lean()
    : [];
  return auditData(submissions, ledgers, options);
}

async function main() {
  const options = parseArgs();
  try {
    const data = options.fixture ? fixtureData() : null;
    const result = options.fixture
      ? auditData(data.submissions, data.ledgers, options)
      : await runProduction(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.severity.startsWith('P0_')) process.exitCode = 2;
  } finally {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, readOnly: true, writesPerformed: 0, error: error.message, code: error.code || 'AUDIT_FAILED' }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  fixtureData,
  auditLine,
  auditData,
  runProduction
};
