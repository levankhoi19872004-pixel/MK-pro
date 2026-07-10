#!/usr/bin/env node
'use strict';

/**
 * Phase228 read-only audit.
 *
 * Verifies that cash/bank ending balances depend on dateTo and balance scope,
 * not on dateFrom or listing-only filters. This script never updates/deletes
 * fundLedgers and defaults to fixture mode when --fixture is supplied.
 */

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const FundLedger = require('../src/models/FundLedger');
const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');

function text(value) {
  return String(value ?? '').trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function parseArgs(argv = process.argv.slice(2)) {
  const value = (name, fallback = '') => {
    const item = argv.find((arg) => arg.startsWith(`${name}=`));
    return item ? item.slice(name.length + 1) : fallback;
  };
  return {
    fixture: argv.includes('--fixture'),
    json: argv.includes('--json'),
    dateFromA: value('--date-from-a', '2026-07-09'),
    dateFromB: value('--date-from-b', '2026-07-10'),
    dateTo: value('--date-to', '2026-07-10'),
    timezone: value('--timezone', 'Asia/Ho_Chi_Minh'),
    fundType: value('--fund-type', ''),
    account: value('--account', '')
  };
}

function fixtureRows() {
  const confirmed = {
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    active: true,
    reversed: false,
    isReversal: false,
    status: 'posted'
  };
  return [
    { ...confirmed, id: 'CASH-0901', date: '2026-07-09', createdAt: '2026-07-09T01:00:00.000Z', fundType: 'cash', account: 'CASH', direction: 'in', amount: 185855730 },
    { ...confirmed, id: 'CASH-0902', date: '2026-07-09', createdAt: '2026-07-09T02:00:00.000Z', fundType: 'cash', account: 'CASH', direction: 'out', amount: 100000 },
    { ...confirmed, id: 'BANK-0901', date: '2026-07-09', createdAt: '2026-07-09T03:00:00.000Z', fundType: 'bank', account: 'BANK', direction: 'in', amount: 172610381 },
    { ...confirmed, id: 'CASH-1001', date: '2026-07-10', createdAt: '2026-07-10T01:00:00.000Z', fundType: 'cash', account: 'CASH', direction: 'in', amount: 43831719 },
    { ...confirmed, id: 'CASH-1002', date: '2026-07-10', createdAt: '2026-07-10T02:00:00.000Z', fundType: 'cash', account: 'CASH', direction: 'out', amount: 400000 },
    { ...confirmed, id: 'BANK-1001', date: '2026-07-10', createdAt: '2026-07-10T03:00:00.000Z', fundType: 'bank', account: 'BANK', direction: 'in', amount: 19435318 }
  ];
}

function legacyRangeNet(rows = [], dateFrom, dateTo, fundType) {
  return rows
    .filter((row) => row.date >= dateFrom && row.date <= dateTo)
    .filter((row) => row.fundType === fundType)
    .reduce((sum, row) => sum + (row.direction === 'out' ? -number(row.amount) : number(row.amount)), 0);
}

function buildResult({ options, summaryA, summaryB, legacyA, legacyB, invalidLedgerCount = 0, excludedLedgerCount = 0, exclusionReasons = [] }) {
  const cashEndingA = number(summaryA.cashEndingBalance);
  const cashEndingB = number(summaryB.cashEndingBalance);
  const bankEndingA = number(summaryA.bankEndingBalance);
  const bankEndingB = number(summaryB.bankEndingBalance);
  const cashEndingMatch = cashEndingA === cashEndingB;
  const bankEndingMatch = bankEndingA === bankEndingB;
  let severity = 'OK';
  if (!cashEndingMatch || !bankEndingMatch) severity = 'P0_BALANCE_INCONSISTENCY';
  else if (number(legacyA.cash) !== number(legacyB.cash) || number(legacyA.bank) !== number(legacyB.bank) || invalidLedgerCount || excludedLedgerCount) severity = 'WARNING';

  return {
    readOnly: true,
    dateFromA: options.dateFromA,
    dateFromB: options.dateFromB,
    dateTo: options.dateTo,
    timezone: options.timezone,
    balanceScope: { fundType: options.fundType || 'all', account: options.account || 'all' },

    cashOpeningA: number(summaryA.cashOpeningBalance),
    cashInA: number(summaryA.cashInPeriod),
    cashOutA: number(summaryA.cashOutPeriod),
    cashEndingA,
    cashOpeningB: number(summaryB.cashOpeningBalance),
    cashInB: number(summaryB.cashInPeriod),
    cashOutB: number(summaryB.cashOutPeriod),
    cashEndingB,

    bankOpeningA: number(summaryA.bankOpeningBalance),
    bankInA: number(summaryA.bankInPeriod),
    bankOutA: number(summaryA.bankOutPeriod),
    bankEndingA,
    bankOpeningB: number(summaryB.bankOpeningBalance),
    bankInB: number(summaryB.bankInPeriod),
    bankOutB: number(summaryB.bankOutPeriod),
    bankEndingB,

    cashEndingMatch,
    bankEndingMatch,
    cashEndingDifference: cashEndingA - cashEndingB,
    bankEndingDifference: bankEndingA - bankEndingB,

    legacyRangeNetCashA: number(legacyA.cash),
    legacyRangeNetCashB: number(legacyB.cash),
    legacyRangeNetBankA: number(legacyA.bank),
    legacyRangeNetBankB: number(legacyB.bank),
    canonicalCashEnding: cashEndingA,
    canonicalBankEnding: bankEndingA,

    invalidLedgerCount: number(invalidLedgerCount),
    excludedLedgerCount: number(excludedLedgerCount),
    exclusionReasons,
    severity
  };
}

function runFixture(options) {
  const rows = fixtureRows();
  const queryA = { dateFrom: options.dateFromA, dateTo: options.dateTo, timezone: options.timezone, fundType: options.fundType, account: options.account, full: true };
  const queryB = { dateFrom: options.dateFromB, dateTo: options.dateTo, timezone: options.timezone, fundType: options.fundType, account: options.account, full: true };
  const resultA = FundBalanceReadService.calculateFixture(rows, queryA);
  const resultB = FundBalanceReadService.calculateFixture(rows, queryB);
  return buildResult({
    options,
    summaryA: resultA.summary,
    summaryB: resultB.summary,
    legacyA: {
      cash: legacyRangeNet(rows, options.dateFromA, options.dateTo, 'cash'),
      bank: legacyRangeNet(rows, options.dateFromA, options.dateTo, 'bank')
    },
    legacyB: {
      cash: legacyRangeNet(rows, options.dateFromB, options.dateTo, 'cash'),
      bank: legacyRangeNet(rows, options.dateFromB, options.dateTo, 'bank')
    },
    invalidLedgerCount: 0,
    excludedLedgerCount: 0,
    exclusionReasons: []
  });
}

async function legacyRangeAggregate(dateFrom, dateTo) {
  const rows = await FundLedger.aggregate([
    {
      $match: {
        status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] },
        date: { $gte: dateFrom, $lte: dateTo }
      }
    },
    {
      $group: {
        _id: { fundType: '$fundType', direction: '$direction' },
        amount: { $sum: { $ifNull: ['$amount', 0] } }
      }
    }
  ]).option({ comment: 'phase228.audit.legacy-range-net' }).exec();
  const result = { cash: 0, bank: 0 };
  for (const row of rows || []) {
    const fundType = row._id?.fundType === 'bank' ? 'bank' : 'cash';
    result[fundType] += row._id?.direction === 'out' ? -number(row.amount) : number(row.amount);
  }
  return result;
}

async function exclusionAudit(dateTo) {
  const rawMatch = {
    $or: [
      { date: { $lte: dateTo } },
      {
        $and: [
          { $or: [{ date: { $exists: false } }, { date: '' }, { date: null }] },
          { createdAt: { $lte: `${dateTo}T16:59:59.999Z` } }
        ]
      }
    ]
  };
  const rows = await FundLedger.find(rawMatch)
    .select('date createdAt amount debit credit status active isDeleted deleted deletedAt reversed isReversal reversalOf accountingConfirmed accountingStatus posted')
    .lean();
  const invalid = [];
  const excluded = [];
  for (const row of rows || []) {
    const amount = Math.abs(number(row.amount ?? row.debit ?? row.credit));
    if (!amount || !FundBalanceReadService.canonicalDateOfRow(row)) invalid.push(row);
    else if (!FundBalanceReadService.isCanonicalFundLedgerRow(row)) excluded.push(row);
  }
  const reasonCounts = {};
  for (const row of excluded) {
    let reason = 'NOT_CANONICAL_ACTIVE_CONFIRMED';
    if (row.isDeleted === true || row.deleted === true || text(row.deletedAt)) reason = 'DELETED';
    else if (row.reversed === true || row.isReversal === true || text(row.reversalOf)) reason = 'REVERSAL_EXCLUDED_BY_CURRENT_POLICY';
    else if (['draft', 'pending', 'submitted'].includes(text(row.status).toLowerCase())) reason = 'UNCONFIRMED_STATUS';
    else if (row.accountingConfirmed !== true && !['confirmed', 'posted', 'locked', 'accounting_confirmed'].includes(text(row.accountingStatus).toLowerCase()) && row.posted !== true) reason = 'NOT_ACCOUNTING_CONFIRMED';
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  }
  return {
    invalidLedgerCount: invalid.length,
    excludedLedgerCount: excluded.length,
    exclusionReasons: Object.entries(reasonCounts).map(([reason, count]) => ({ reason, count }))
  };
}

async function runProduction(options) {
  await connectDB();
  const common = { dateTo: options.dateTo, timezone: options.timezone, fundType: options.fundType, account: options.account };
  const summaryA = await FundBalanceReadService.getFundBalanceSummary({ ...common, dateFrom: options.dateFromA });
  const summaryB = await FundBalanceReadService.getFundBalanceSummary({ ...common, dateFrom: options.dateFromB });
  const legacyA = await legacyRangeAggregate(options.dateFromA, options.dateTo);
  const legacyB = await legacyRangeAggregate(options.dateFromB, options.dateTo);
  const exclusions = await exclusionAudit(options.dateTo);
  return buildResult({ options, summaryA, summaryB, legacyA, legacyB, ...exclusions });
}

async function main() {
  const options = parseArgs();
  let result;
  try {
    result = options.fixture ? runFixture(options) : await runProduction(options);
    process.stdout.write(`${JSON.stringify(result, null, options.json ? 2 : 2)}\n`);
    if (result.severity === 'P0_BALANCE_INCONSISTENCY') process.exitCode = 2;
  } finally {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, readOnly: true, error: error.message, code: error.code || 'AUDIT_FAILED' }, null, 2));
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  fixtureRows,
  legacyRangeNet,
  buildResult,
  runFixture
};
