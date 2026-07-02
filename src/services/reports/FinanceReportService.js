'use strict';

const FundLedger = require('../../models/FundLedger');
const ReturnReportService = require('./ReturnReportService');
const {
  activeDocumentFilter,
  businessDateStages,
  businessDate,
  dateRange,
  firstText,
  lower,
  paginate,
  text,
  toNumber
} = require('./ReportDomainUtils');

function fundTypeOf(row = {}) {
  const explicit = lower(row.fundType || row.fund || row.accountType);
  if (explicit.includes('bank') || explicit.includes('ngan')) return 'bank';
  if (explicit.includes('cash') || explicit.includes('tien') || explicit.includes('quy')) return 'cash';
  const account = lower(row.account);
  return account.includes('bank') || account.startsWith('112') ? 'bank' : 'cash';
}

function directionOf(row = {}) {
  const explicit = lower(row.direction);
  if (explicit === 'in' || explicit === 'out') return explicit;
  const value = [row.type, row.transactionType, row.sourceType, row.note].map(lower).join(' ');
  if (/(out|payment|chi|withdraw|transfer[_\s-]*out)/i.test(value)) return 'out';
  return 'in';
}

function accountKeyOf(row = {}) {
  const fundType = fundTypeOf(row);
  const account = firstText(row, ['account', 'fundCode', 'bankAccountCode']) || (fundType === 'bank' ? 'BANK' : 'CASH');
  return `${fundType}:${account}`;
}


function fundLedgerCanonicalFilter(extra = {}) {
  return {
    ...activeDocumentFilter(),
    active: { $ne: false },
    isDeleted: { $ne: true },
    deletedAt: { $in: [null, ''] },
    status: { $nin: ['void', 'cancelled', 'canceled', 'deleted', 'duplicate_cancelled'] },
    reversed: { $ne: true },
    isReversal: { $ne: true },
    reversalOf: { $in: [null, ''] },
    $or: [
      { accountingConfirmed: true },
      { accountingStatus: { $in: ['confirmed', 'posted', 'locked'] } },
      { posted: true }
    ],
    ...extra
  };
}

async function loadFundLedgersUntil(query = {}) {
  const { dateFrom, dateTo } = dateRange(query);
  const rows = await FundLedger.aggregate([
    { $match: fundLedgerCanonicalFilter() },
    ...businessDateStages('0000-01-01', dateTo, ['date'], '_reportBusinessDate'),
    { $sort: { fundType: 1, account: 1, _reportBusinessDate: 1, createdAt: 1, _id: 1 } }
  ]).allowDiskUse(true).exec();
  return { rows, dateFrom, dateTo };
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
    summary.openingBalance += account.openingBalance;
    summary.fundIn += account.inAmount;
    summary.fundOut += account.outAmount;
    summary.endingBalance += account.endingBalance;
    if (account.fundType === 'bank') {
      summary.bankOpeningBalance += account.openingBalance;
      summary.bankIn += account.inAmount;
      summary.bankOut += account.outAmount;
      summary.bankBalance += account.endingBalance;
    } else {
      summary.cashOpeningBalance += account.openingBalance;
      summary.cashIn += account.inAmount;
      summary.cashOut += account.outAmount;
      summary.cashBalance += account.endingBalance;
    }
  }
  summary.totalFundIn = summary.fundIn;
  summary.totalFundOut = summary.fundOut;
  summary.totalFundBalance = summary.endingBalance;
  return summary;
}

async function financeReport(query = {}) {
  const { rows: ledgers, dateFrom, dateTo } = await loadFundLedgersUntil(query);
  const accountMap = new Map();
  const periodRows = [];

  for (const ledger of ledgers) {
    const key = accountKeyOf(ledger);
    const fundType = fundTypeOf(ledger);
    const account = firstText(ledger, ['account', 'fundCode', 'bankAccountCode']) || (fundType === 'bank' ? 'BANK' : 'CASH');
    if (!accountMap.has(key)) {
      accountMap.set(key, { key, fundType, account, openingBalance: 0, inAmount: 0, outAmount: 0, endingBalance: 0, transactionCount: 0 });
    }
    const target = accountMap.get(key);
    const ledgerDate = ledger._reportBusinessDate || businessDate(ledger, ['date']);
    const amount = Math.abs(toNumber(ledger.amount));
    const direction = directionOf(ledger);
    const signed = direction === 'out' ? -amount : amount;
    if (ledgerDate < dateFrom) {
      target.openingBalance += signed;
      target.endingBalance += signed;
      continue;
    }
    target.transactionCount += 1;
    target.endingBalance += signed;
    if (direction === 'out') target.outAmount += amount;
    else target.inAmount += amount;
    periodRows.push({ ledger, ledgerDate, key, fundType, account, direction, amount });
  }

  const accounts = Array.from(accountMap.values()).map((row) => ({
    ...row,
    endingBalance: row.openingBalance + row.inAmount - row.outAmount
  })).sort((a, b) => a.fundType.localeCompare(b.fundType) || a.account.localeCompare(b.account));

  const running = new Map(accounts.map((row) => [row.key, row.openingBalance]));
  periodRows.sort((a, b) => a.key.localeCompare(b.key)
    || a.ledgerDate.localeCompare(b.ledgerDate)
    || text(a.ledger.createdAt).localeCompare(text(b.ledger.createdAt))
    || text(a.ledger._id).localeCompare(text(b.ledger._id)));
  const rows = periodRows.map(({ ledger, ledgerDate, key, fundType, account, direction, amount }) => {
    const openingBalance = toNumber(running.get(key));
    const endingBalance = openingBalance + (direction === 'out' ? -amount : amount);
    running.set(key, endingBalance);
    return {
      id: text(ledger.id || ledger._id),
      date: ledgerDate,
      code: firstText(ledger, ['code', 'referenceCode', 'refCode', 'sourceCode']),
      type: firstText(ledger, ['sourceType', 'type', 'refType']),
      fundType,
      account,
      counterparty: firstText(ledger, ['customerName', 'deliveryStaffName', 'staffName', 'partnerName']),
      direction,
      openingBalance,
      inAmount: direction === 'in' ? amount : 0,
      outAmount: direction === 'out' ? amount : 0,
      endingBalance,
      note: firstText(ledger, ['note'])
    };
  });

  const returnData = await ReturnReportService.returnReport({ ...query, full: '1', export: '1' });

  const summary = {
    ...summarizeAccounts(accounts),
    receiptCount: rows.filter((row) => row.direction === 'in').length,
    returnCount: toNumber(returnData.summary?.returnCount),
    totalReturns: toNumber(returnData.summary?.totalReturnAmount)
  };
  const paged = paginate(rows, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    source: 'mongo_fund_ledgers_period',
    fundSource: 'fundLedgers',
    dateFrom,
    dateTo,
    accounts,
    fundLedger: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    summary,
    // Compatibility payloads đều lấy từ ledger chuẩn, không đọc cashbooks/bankbooks.
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
  financeReport
};
