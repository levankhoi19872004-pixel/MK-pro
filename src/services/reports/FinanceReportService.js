'use strict';

const ReturnReportService = require('./ReturnReportService');
const FundBalanceReadService = require('../accounting/FundBalanceReadService');
const { firstText, paginate, text, toNumber } = require('./ReportDomainUtils');

function fundTypeOf(row = {}) {
  return FundBalanceReadService.fundTypeOfRow(row);
}

function directionOf(row = {}) {
  return FundBalanceReadService.directionOfRow(row);
}

function accountKeyOf(row = {}) {
  const fundType = fundTypeOf(row);
  const account = FundBalanceReadService.accountOfRow(row, fundType);
  return `${fundType}:${account}`;
}

function fundLedgerCanonicalFilter(extra = {}) {
  return FundBalanceReadService.fundLedgerCanonicalFilter(extra);
}

async function loadFundLedgersUntil(query = {}) {
  const result = await FundBalanceReadService.listFundLedgers({ ...query, full: '1', limit: 50000 });
  return {
    rows: result.rows || [],
    dateFrom: result.summary?.period?.dateFrom || '',
    dateTo: result.summary?.period?.dateTo || ''
  };
}

function summarizeAccounts(accounts = []) {
  const summary = {
    openingBalance: 0,
    fundIn: 0,
    fundOut: 0,
    endingBalance: 0,
    cashOpeningBalance: 0,
    cashIn: 0,
    cashOut: 0,
    cashBalance: 0,
    bankOpeningBalance: 0,
    bankIn: 0,
    bankOut: 0,
    bankBalance: 0
  };
  for (const account of accounts) {
    const openingBalance = toNumber(account.openingBalance);
    const inAmount = toNumber(account.inAmount ?? account.inPeriod);
    const outAmount = toNumber(account.outAmount ?? account.outPeriod);
    const endingBalance = toNumber(account.endingBalance);
    summary.openingBalance += openingBalance;
    summary.fundIn += inAmount;
    summary.fundOut += outAmount;
    summary.endingBalance += endingBalance;
    if (account.fundType === 'bank') {
      summary.bankOpeningBalance += openingBalance;
      summary.bankIn += inAmount;
      summary.bankOut += outAmount;
      summary.bankBalance += endingBalance;
    } else {
      summary.cashOpeningBalance += openingBalance;
      summary.cashIn += inAmount;
      summary.cashOut += outAmount;
      summary.cashBalance += endingBalance;
    }
  }
  summary.totalFundIn = summary.fundIn;
  summary.totalFundOut = summary.fundOut;
  summary.totalFundBalance = summary.endingBalance;
  return summary;
}

function reportRowFromFundLedger(ledger = {}) {
  const amount = Math.abs(toNumber(ledger.amount));
  const direction = directionOf(ledger);
  const endingBalance = toNumber(ledger.runningBalanceAfterTransaction);
  const openingBalance = endingBalance - (direction === 'out' ? -amount : amount);
  return {
    id: text(ledger.id || ledger._id),
    date: text(ledger.date),
    code: firstText(ledger, ['code', 'referenceCode', 'refCode', 'sourceCode']),
    type: firstText(ledger, ['sourceType', 'type', 'refType']),
    fundType: fundTypeOf(ledger),
    account: FundBalanceReadService.accountOfRow(ledger),
    counterparty: firstText(ledger, ['customerName', 'deliveryStaffName', 'staffName', 'partnerName', 'counterpartyName']),
    direction,
    openingBalance,
    inAmount: direction === 'in' ? amount : 0,
    outAmount: direction === 'out' ? amount : 0,
    endingBalance,
    runningBalanceAfterTransaction: endingBalance,
    note: firstText(ledger, ['note'])
  };
}

async function financeReport(query = {}) {
  const fundData = await FundBalanceReadService.listFundLedgers(query);
  const canonicalSummary = fundData.summary || {};
  const accounts = (canonicalSummary.accounts || []).map((row) => ({
    ...row,
    inAmount: toNumber(row.inPeriod),
    outAmount: toNumber(row.outPeriod),
    transactionCount: toNumber(row.periodLedgerCount)
  }));
  const rows = (fundData.rows || []).map(reportRowFromFundLedger);
  const returnData = await ReturnReportService.returnReport({ ...query, full: '1', export: '1' });
  const groupCounts = canonicalSummary.groups || [];
  const receiptCount = groupCounts
    .filter((row) => row.direction === 'in')
    .reduce((sum, row) => sum + toNumber(row.count), 0);

  const summary = {
    ...summarizeAccounts(accounts),
    cashOpeningBalance: toNumber(canonicalSummary.cashOpeningBalance),
    cashIn: toNumber(canonicalSummary.cashInPeriod),
    cashOut: toNumber(canonicalSummary.cashOutPeriod),
    cashBalance: toNumber(canonicalSummary.cashEndingBalance),
    bankOpeningBalance: toNumber(canonicalSummary.bankOpeningBalance),
    bankIn: toNumber(canonicalSummary.bankInPeriod),
    bankOut: toNumber(canonicalSummary.bankOutPeriod),
    bankBalance: toNumber(canonicalSummary.bankEndingBalance),
    openingBalance: toNumber(canonicalSummary.totalOpeningBalance),
    fundIn: toNumber(canonicalSummary.totalInPeriod),
    fundOut: toNumber(canonicalSummary.totalOutPeriod),
    endingBalance: toNumber(canonicalSummary.totalEndingBalance),
    totalFundIn: toNumber(canonicalSummary.totalInPeriod),
    totalFundOut: toNumber(canonicalSummary.totalOutPeriod),
    totalFundBalance: toNumber(canonicalSummary.totalEndingBalance),
    receiptCount,
    returnCount: toNumber(returnData.summary?.returnCount),
    totalReturns: toNumber(returnData.summary?.totalReturnAmount)
  };

  return {
    source: 'mongo_fund_ledgers_canonical_balance_service',
    fundSource: 'fundLedgers',
    dateFrom: canonicalSummary.period?.dateFrom || '',
    dateTo: canonicalSummary.period?.dateTo || '',
    accounts,
    fundLedger: rows,
    items: rows,
    meta: fundData.meta,
    summary,
    receipts: rows.filter((row) => row.direction === 'in'),
    cashbook: rows.filter((row) => row.fundType === 'cash'),
    bankbook: rows.filter((row) => row.fundType === 'bank'),
    returns: returnData.returns || []
  };
}

module.exports = {
  fundTypeOf,
  directionOf,
  accountKeyOf,
  fundLedgerCanonicalFilter,
  loadFundLedgersUntil,
  summarizeAccounts,
  financeReport,
  reportRowFromFundLedger
};
