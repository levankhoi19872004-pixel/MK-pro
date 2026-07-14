#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const FundLedger = require('../src/models/FundLedger');
const dateUtil = require('../src/utils/date.util');
const FundLedgerBalancePolicy = require('../src/services/accounting/FundLedgerBalancePolicy');
const FundBalanceReadService = require('../src/services/accounting/FundBalanceReadService');

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(Math.abs(n)) : 0;
}

function lower(value = '') {
  return text(value).toLowerCase();
}

function valueOf(name, argv = process.argv.slice(2)) {
  const prefix = `${name}=`;
  const direct = argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length).trim();
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? text(argv[index + 1]) : '';
}

function parseArgs(argv = process.argv.slice(2)) {
  if (argv.includes('--apply')) throw new Error('This audit is read-only; --apply is not supported.');
  const date = valueOf('--date', argv);
  const dateFrom = valueOf('--date-from', argv) || valueOf('--dateFrom', argv) || date;
  const dateTo = valueOf('--date-to', argv) || valueOf('--dateTo', argv) || date || dateFrom;
  return {
    dateFrom: dateUtil.toDateOnly(dateFrom || dateUtil.todayVN()),
    dateTo: dateUtil.toDateOnly(dateTo || dateFrom || dateUtil.todayVN()),
    delivery: valueOf('--delivery', argv) || valueOf('--deliveryStaffCode', argv),
    fundType: lower(valueOf('--fund-type', argv) || valueOf('--fundType', argv)),
    json: argv.includes('--json')
  };
}

function ledgerDate(row = {}) {
  return dateUtil.toDateOnly(row.date || row.accountingDate || row.remittanceDate || row.createdAt || '', '');
}

function ledgerFundType(row = {}) {
  if (lower(row.fundType) === 'bank') return 'bank';
  const account = lower(row.account || row.bankAccountCode || '');
  return account.includes('bank') || account.startsWith('112') ? 'bank' : 'cash';
}

function ledgerDirection(row = {}) {
  return lower(row.direction) === 'out' ? 'out' : 'in';
}

function emptyTotals() {
  return { cash: 0, bank: 0, rows: 0 };
}

function add(totals, row = {}) {
  const fundType = ledgerFundType(row);
  if (ledgerDirection(row) !== 'in') return;
  if (fundType === 'bank') totals.bank += money(row.amount);
  else totals.cash += money(row.amount);
  totals.rows += 1;
}

function sourceTypeOf(row = {}) {
  return FundLedgerBalancePolicy.canonicalFundSourceType(row);
}

function buildRawFilter(options = {}) {
  const dateOr = [
    { date: { $gte: options.dateFrom, $lte: options.dateTo } },
    { accountingDate: { $gte: options.dateFrom, $lte: options.dateTo } },
    { remittanceDate: { $gte: options.dateFrom, $lte: options.dateTo } }
  ];
  const filter = {
    $and: [
      { $or: dateOr },
      {
        $or: [
          { sourceType: { $in: ['ORDER_PAYMENT_ALLOCATION', 'DELIVERY_CASH_SUBMISSION'] } },
          { refType: { $in: ['ORDER_PAYMENT_ALLOCATION', 'DELIVERY_CASH_SUBMISSION'] } },
          { referenceType: { $in: ['ORDER_PAYMENT_ALLOCATION', 'DELIVERY_CASH_SUBMISSION'] } }
        ]
      }
    ]
  };
  if (options.delivery) {
    const rx = new RegExp(options.delivery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$and.push({ $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }] });
  }
  if (['cash', 'bank'].includes(options.fundType)) filter.$and.push({ fundType: options.fundType });
  return filter;
}

function summarizeRows(rows = [], options = {}) {
  const opa = emptyTotals();
  const submission = emptyTotals();
  const raw = emptyTotals();
  const canonical = emptyTotals();
  const affectedDates = new Set();
  const affectedDeliveryStaff = new Set();

  for (const row of rows) {
    const date = ledgerDate(row);
    if (!date || date < options.dateFrom || date > options.dateTo) continue;
    if (options.fundType && ledgerFundType(row) !== options.fundType) continue;
    if (options.delivery && ![row.deliveryStaffCode, row.deliveryStaffName].some((value) => lower(value).includes(lower(options.delivery)))) continue;
    const sourceType = sourceTypeOf(row);
    add(raw, row);
    if (sourceType === 'ORDER_PAYMENT_ALLOCATION') add(opa, row);
    if (sourceType === 'DELIVERY_CASH_SUBMISSION') add(submission, row);
    if (FundLedgerBalancePolicy.affectsFundBalance(row) && FundBalanceReadService.isCanonicalFundLedgerRow(row)) add(canonical, row);
    affectedDates.add(date);
    if (row.deliveryStaffCode || row.deliveryStaffName) affectedDeliveryStaff.add(text(row.deliveryStaffCode || row.deliveryStaffName));
  }

  return {
    orderPaymentAllocationFund: opa,
    deliveryCashSubmissionFund: submission,
    rawFundInflow: { cash: raw.cash, bank: raw.bank },
    canonicalFundInflow: { cash: canonical.cash, bank: canonical.bank },
    duplicateCandidate: (opa.cash > 0 && submission.cash > 0) || (opa.bank > 0 && submission.bank > 0),
    differenceRemovedByPolicy: { cash: raw.cash - canonical.cash, bank: raw.bank - canonical.bank },
    affectedDates: Array.from(affectedDates).sort(),
    affectedDeliveryStaff: Array.from(affectedDeliveryStaff).sort()
  };
}

async function runAudit(options = {}) {
  const rows = await FundLedger.find(buildRawFilter(options)).lean();
  return {
    scope: {
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      deliveryStaffCode: options.delivery || '',
      fundType: options.fundType || 'all'
    },
    ...summarizeRows(rows || [], options)
  };
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const report = await runAudit(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Scope: ${report.scope.dateFrom}..${report.scope.dateTo} delivery=${report.scope.deliveryStaffCode || 'all'}`);
    console.log(`OPA cash/bank: ${report.orderPaymentAllocationFund.cash}/${report.orderPaymentAllocationFund.bank}`);
    console.log(`Delivery submission cash/bank: ${report.deliveryCashSubmissionFund.cash}/${report.deliveryCashSubmissionFund.bank}`);
    console.log(`Canonical cash/bank: ${report.canonicalFundInflow.cash}/${report.canonicalFundInflow.bank}`);
    console.log(`Duplicate candidate: ${report.duplicateCandidate}`);
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('[audit-delivery-fund-double-posting] failed:', error && error.stack ? error.stack : error);
      process.exitCode = 1;
    })
    .finally(async () => {
      try { if (mongoose.connection.readyState) await mongoose.disconnect(); } catch (_) {}
    });
}

module.exports = {
  parseArgs,
  buildRawFilter,
  summarizeRows,
  runAudit
};
