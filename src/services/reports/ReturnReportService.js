'use strict';

const ReturnOrder = require('../../models/ReturnOrder');
const arLedgerReadService = require('../arLedgerRead.service');
const {
  activeDocumentFilter,
  returnConfirmedFilter,
  businessDateStages,
  businessDate,
  dateRange,
  deduplicateDocuments,
  firstNumber,
  firstText,
  paginate,
  staffIdentity,
  text,
  toNumber
} = require('./ReportDomainUtils');

function returnIdentityValues(row = {}) {
  return [
    row._id, row.id, row.code, row.returnOrderCode, row.documentCode,
    row.sourceId, row.sourceCode
  ].map(text).filter(Boolean);
}

async function loadConfirmedReturns(query = {}) {
  const { dateFrom, dateTo } = dateRange(query);
  const rows = await ReturnOrder.aggregate([
    { $match: activeDocumentFilter() },
    { $match: returnConfirmedFilter() },
    ...businessDateStages(dateFrom, dateTo, ['returnDate', 'date', 'documentDate', 'deliveryDate'], '_reportBusinessDate'),
    { $sort: { _reportBusinessDate: 1, updatedAt: 1, createdAt: 1, _id: 1 } }
  ]).allowDiskUse(true).exec();
  const deduplicated = deduplicateDocuments(rows, 'return');
  return { rows: deduplicated.rows, duplicateCount: deduplicated.duplicateCount, dateFrom, dateTo };
}

async function loadReturnArCredits(returns = []) {
  const keys = Array.from(new Set(returns.flatMap(returnIdentityValues)));
  if (!keys.length) return new Map();
  const ledgers = (await arLedgerReadService.getCanonicalLedgersByOrderKeys(keys, { status: 'all' }))
    .filter((ledger) => String(ledger.category || '').toUpperCase().includes('RETURN') && toNumber(ledger.credit) > 0);

  const keyToCanonical = new Map();
  for (const row of returns) {
    const canonical = text(row._id || row.id || row.code);
    for (const key of returnIdentityValues(row)) keyToCanonical.set(key, canonical);
  }
  const map = new Map();
  for (const ledger of ledgers) {
    const keysForLedger = [ledger.refId, ledger.sourceId, ledger.orderId, ledger.refCode, ledger.sourceCode, ledger.orderCode]
      .map(text)
      .filter(Boolean);
    const canonical = keysForLedger.map((key) => keyToCanonical.get(key)).find(Boolean);
    if (!canonical) continue;
    map.set(canonical, toNumber(map.get(canonical)) + Math.max(0, toNumber(ledger.credit || ledger.amount)));
  }
  return map;
}

function returnCanonicalKey(row = {}) {
  return text(row._id || row.id || row.code);
}

async function returnReport(query = {}) {
  const { rows: returns, duplicateCount, dateFrom, dateTo } = await loadConfirmedReturns(query);
  const arCredits = await loadReturnArCredits(returns);
  const needle = text(query.q || query.search || query.keyword).toLowerCase();
  let rows = returns.map((row) => {
    const salesStaff = staffIdentity(row, 'sales');
    const deliveryStaff = staffIdentity(row, 'delivery');
    const arAmount = toNumber(arCredits.get(returnCanonicalKey(row)));
    const documentAmount = Math.max(0, firstNumber(row, ['returnAmount', 'amount', 'debtReduction', 'totalAmount']));
    const amount = arAmount > 0 ? arAmount : documentAmount;
    return {
      id: text(row.id || row._id),
      code: firstText(row, ['code', 'returnOrderCode', 'documentCode', 'id']),
      date: row._reportBusinessDate || businessDate(row, ['returnDate', 'date', 'documentDate', 'deliveryDate']),
      salesOrderCode: firstText(row, ['salesOrderCode', 'orderCode', 'sourceOrderCode']),
      customerCode: firstText(row, ['customerCode', 'customerId']),
      customerName: firstText(row, ['customerName']),
      salesStaffCode: salesStaff.code,
      salesStaffName: salesStaff.name,
      deliveryStaffCode: deliveryStaff.code,
      deliveryStaffName: deliveryStaff.name,
      amount,
      documentAmount,
      arAmount,
      warehouseReceiveStatus: firstText(row, ['warehouseReceiveStatus', 'stockReceiveStatus', 'warehouseStatus']),
      returnState: firstText(row, ['returnState', 'returnStatus', 'status']),
      accountingStatus: firstText(row, ['accountingStatus']),
      arPosted: row.arPosted === true
    };
  });
  if (needle) {
    rows = rows.filter((row) => [row.code, row.salesOrderCode, row.customerCode, row.customerName, row.salesStaffName, row.deliveryStaffName]
      .some((value) => text(value).toLowerCase().includes(needle)));
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
  const summary = rows.reduce((acc, row) => {
    acc.returnCount += 1;
    acc.totalReturnAmount += toNumber(row.amount);
    acc.arBackedAmount += toNumber(row.arAmount);
    acc.documentBackedAmount += row.arAmount > 0 ? 0 : toNumber(row.documentAmount);
    return acc;
  }, { returnCount: 0, totalReturnAmount: 0, arBackedAmount: 0, documentBackedAmount: 0, duplicateReturnCount: duplicateCount });
  const paged = paginate(rows, query, { defaultLimit: 50, maxLimit: 200 });
  return {
    source: 'mongo_return_orders_confirmed',
    returnSource: 'returnOrders',
    arSource: 'arLedgers',
    dateFrom,
    dateTo,
    returns: paged.rows,
    items: paged.rows,
    meta: paged.meta,
    summary
  };
}

module.exports = {
  loadConfirmedReturns,
  loadReturnArCredits,
  returnReport
};
