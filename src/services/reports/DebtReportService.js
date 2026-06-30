'use strict';

const ArLedger = require('../../models/ArLedger');
const arCustomerDebtReadModel = require('../accounting/arCustomerDebtReadModel.service');
const phase79ArDebtReadModel = require('../arDebtReadModel.service');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount } = require('../../constants/finance.constants');
const {
  activeDocumentFilter,
  businessDateStages,
  businessDate,
  classifyArCredit,
  customerKey,
  dateRange,
  firstText,
  paginate,
  staffIdentity,
  text,
  toNumber
} = require('./ReportDomainUtils');

async function loadLedgersUntil(query = {}) {
  const { dateFrom, dateTo } = dateRange(query);
  const rows = await ArLedger.aggregate([
    { $match: activeDocumentFilter() },
    ...businessDateStages('0000-01-01', dateTo, ['date'], '_reportBusinessDate'),
    { $sort: { customerCode: 1, customerName: 1, _reportBusinessDate: 1, createdAt: 1, _id: 1 } }
  ]).allowDiskUse(true).exec();
  return { rows, dateFrom, dateTo };
}

function ledgerDebit(row = {}) {
  const debit = Math.max(0, toNumber(row.debit || row.arDebit));
  if (debit > 0) return debit;
  const type = [row.type, row.sourceType, row.source].map(text).join(' ');
  if (/(sale|external[_\s-]*debt|debit)/i.test(type) && toNumber(row.credit) <= 0) return Math.max(0, toNumber(row.amount));
  return 0;
}

function ledgerCredit(row = {}) {
  const credit = Math.max(0, toNumber(row.credit || row.arCredit));
  if (credit > 0) return credit;
  const type = [row.type, row.sourceType, row.source].map(text).join(' ');
  if (!/(sale|external[_\s-]*debt|debit)/i.test(type)) return Math.max(0, toNumber(row.amount));
  return 0;
}

function matchesQuery(row = {}, query = {}) {
  const customerCode = text(query.customerCode || query.code || query.customerId);
  if (customerCode && ![row.customerCode, row.customerId].map(text).includes(customerCode)) return false;
  const needle = text(query.q || query.search || query.keyword).toLowerCase();
  if (!needle) return true;
  return [row.customerCode, row.customerName, row.orderCode, row.salesOrderCode, row.refCode, row.code]
    .some((value) => text(value).toLowerCase().includes(needle));
}

async function periodDebtReport(query = {}) {
  const { rows: allLedgers, dateFrom, dateTo } = await loadLedgersUntil(query);
  const ledgers = allLedgers.filter((row) => matchesQuery(row, query));
  const grouped = new Map();

  for (const ledger of ledgers) {
    const key = customerKey(ledger);
    if (!key) continue;
    if (!grouped.has(key)) {
      const salesStaff = staffIdentity(ledger, 'sales');
      const deliveryStaff = staffIdentity(ledger, 'delivery');
      grouped.set(key, {
        customerId: firstText(ledger, ['customerId']),
        customerCode: firstText(ledger, ['customerCode']),
        customerName: firstText(ledger, ['customerName']),
        salesStaffCode: salesStaff.code,
        salesStaffName: salesStaff.name,
        deliveryStaffCode: deliveryStaff.code,
        deliveryStaffName: deliveryStaff.name,
        openingBalance: 0,
        debitInPeriod: 0,
        receiptInPeriod: 0,
        returnInPeriod: 0,
        adjustmentInPeriod: 0,
        otherCreditInPeriod: 0,
        totalCreditInPeriod: 0,
        closingBalance: 0,
        transactionCount: 0
      });
    }
    const target = grouped.get(key);
    const ledgerDate = ledger._reportBusinessDate || businessDate(ledger, ['date']);
    const debit = ledgerDebit(ledger);
    const credit = ledgerCredit(ledger);
    if (ledgerDate < dateFrom) {
      target.openingBalance += debit - credit;
      target.closingBalance += debit - credit;
      continue;
    }
    target.transactionCount += 1;
    target.debitInPeriod += debit;
    target.totalCreditInPeriod += credit;
    target.closingBalance += debit - credit;
    if (credit > 0) {
      const category = classifyArCredit(ledger);
      if (category === 'receipt') target.receiptInPeriod += credit;
      else if (category === 'return') target.returnInPeriod += credit;
      else if (category === 'adjustment') target.adjustmentInPeriod += credit;
      else target.otherCreditInPeriod += credit;
    }
    const salesStaff = staffIdentity(ledger, 'sales');
    const deliveryStaff = staffIdentity(ledger, 'delivery');
    if (!target.salesStaffCode && salesStaff.code) target.salesStaffCode = salesStaff.code;
    if (!target.salesStaffName && salesStaff.name) target.salesStaffName = salesStaff.name;
    if (!target.deliveryStaffCode && deliveryStaff.code) target.deliveryStaffCode = deliveryStaff.code;
    if (!target.deliveryStaffName && deliveryStaff.name) target.deliveryStaffName = deliveryStaff.name;
  }

  let rows = Array.from(grouped.values()).map((row) => ({
    ...row,
    openingBalance: normalizeDebtAmount(row.openingBalance),
    closingBalance: normalizeDebtAmount(row.openingBalance + row.debitInPeriod - row.totalCreditInPeriod)
  }));
  if (!['1', 'true', 'yes'].includes(text(query.includePaid).toLowerCase())) {
    rows = rows.filter((row) => Math.abs(row.closingBalance) > DEBT_ZERO_TOLERANCE || row.transactionCount > 0);
  }
  rows.sort((a, b) => Math.abs(b.closingBalance) - Math.abs(a.closingBalance)
    || a.customerName.localeCompare(b.customerName, 'vi'));

  const summary = rows.reduce((acc, row) => {
    acc.customerCount += 1;
    acc.openingBalance += toNumber(row.openingBalance);
    acc.debitInPeriod += toNumber(row.debitInPeriod);
    acc.receiptInPeriod += toNumber(row.receiptInPeriod);
    acc.returnInPeriod += toNumber(row.returnInPeriod);
    acc.adjustmentInPeriod += toNumber(row.adjustmentInPeriod);
    acc.otherCreditInPeriod += toNumber(row.otherCreditInPeriod);
    acc.totalCreditInPeriod += toNumber(row.totalCreditInPeriod);
    acc.closingBalance += toNumber(row.closingBalance);
    return acc;
  }, {
    customerCount: 0,
    openingBalance: 0,
    debitInPeriod: 0,
    receiptInPeriod: 0,
    returnInPeriod: 0,
    adjustmentInPeriod: 0,
    otherCreditInPeriod: 0,
    totalCreditInPeriod: 0,
    closingBalance: 0,
    debtZeroTolerance: DEBT_ZERO_TOLERANCE
  });
  const paged = paginate(rows, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    source: 'mongo_ar_ledgers_period',
    ledgerCollection: 'arLedgers',
    dateFrom,
    dateTo,
    debts: paged.rows,
    customerSummary: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    summary
  };
}

async function arLedgerDetailReport(query = {}) {
  const { rows: allLedgers, dateFrom, dateTo } = await loadLedgersUntil(query);
  const filtered = allLedgers.filter((row) => matchesQuery(row, query));
  const openingByCustomer = new Map();
  const period = [];

  for (const ledger of filtered) {
    const key = customerKey(ledger);
    if (!key) continue;
    const ledgerDate = ledger._reportBusinessDate || businessDate(ledger, ['date']);
    const debit = ledgerDebit(ledger);
    const credit = ledgerCredit(ledger);
    if (ledgerDate < dateFrom) {
      openingByCustomer.set(key, toNumber(openingByCustomer.get(key)) + debit - credit);
      continue;
    }
    period.push({ ledger, key, ledgerDate, debit, credit });
  }

  period.sort((a, b) => a.key.localeCompare(b.key, 'vi')
    || a.ledgerDate.localeCompare(b.ledgerDate)
    || text(a.ledger.createdAt).localeCompare(text(b.ledger.createdAt))
    || text(a.ledger._id).localeCompare(text(b.ledger._id)));
  const running = new Map(openingByCustomer);
  const rows = period.map(({ ledger, key, ledgerDate, debit, credit }) => {
    const openingBalance = toNumber(running.get(key));
    const closingBalance = normalizeDebtAmount(openingBalance + debit - credit);
    running.set(key, closingBalance);
    return {
      id: text(ledger.id || ledger._id),
      date: ledgerDate,
      customerCode: firstText(ledger, ['customerCode', 'customerId']),
      customerName: firstText(ledger, ['customerName']),
      documentCode: firstText(ledger, ['code', 'referenceCode', 'refCode', 'orderCode', 'salesOrderCode']),
      type: firstText(ledger, ['type', 'sourceType', 'source']),
      description: firstText(ledger, ['description', 'note']),
      openingBalance,
      debit,
      credit,
      creditCategory: credit > 0 ? classifyArCredit(ledger) : '',
      closingBalance
    };
  });
  const summary = rows.reduce((acc, row) => {
    acc.transactionCount += 1;
    acc.debitInPeriod += row.debit;
    acc.creditInPeriod += row.credit;
    return acc;
  }, {
    customerCount: new Set(rows.map((row) => row.customerCode || row.customerName)).size,
    transactionCount: 0,
    openingBalance: Array.from(openingByCustomer.values()).reduce((sum, value) => sum + toNumber(value), 0),
    debitInPeriod: 0,
    creditInPeriod: 0,
    closingBalance: Array.from(running.values()).reduce((sum, value) => sum + toNumber(value), 0)
  });
  const paged = paginate(rows, query, { defaultLimit: 100, maxLimit: 500 });
  return {
    source: 'mongo_ar_ledgers_detail',
    ledgerCollection: 'arLedgers',
    dateFrom,
    dateTo,
    ledger: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    summary
  };
}

module.exports = {
  // Customer debt screen read model: arLedgers is the only SSoT for current/open debt.
  debtReport: arCustomerDebtReadModel.debtReport,
  debtInit: arCustomerDebtReadModel.debtInit,
  debtCustomers: phase79ArDebtReadModel.getDebtCustomers,
  debtCustomerDetail: (query = {}) => phase79ArDebtReadModel.getDebtOrders(query.customerCode || query.code || query.customerId || query.id || query.q, query),
  debtArLedger: arCustomerDebtReadModel.debtArLedger,
  debtBySalesmanReport: arCustomerDebtReadModel.debtBySalesmanReport,
  debtByDeliveryReport: arCustomerDebtReadModel.debtByDeliveryReport,
  periodDebtReport,
  arLedgerDetailReport
};
