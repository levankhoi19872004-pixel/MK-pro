'use strict';

const dateUtil = require('../utils/date.util');
const { toNumber } = require('../utils/common.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt } = require('../constants/finance.constants');
const MongoStore = require('../models');

function clean(value) {
  return String(value || '').trim();
}

function roundMoney(value) {
  return Math.round(toNumber(value));
}

function activeDocFilter(extra = {}) {
  return {
    status: { $nin: ['cancelled', 'canceled', 'void', 'deleted', 'removed', 'reversed'] },
    accountingStatus: { $nin: ['unlocked', 'draft_adjusting'] },
    ...extra
  };
}

function docDate(row = {}) {
  return dateUtil.toDateOnly(row.documentDate || row.deliveryDate || row.createdAt || dateUtil.todayVN());
}

function normalizeDocSnapshot(row = {}) {
  const debt = normalizeDebtAmount(row.remainingDebt);
  const saleAmount = roundMoney(row.totalReceivable);
  const returnAmount = roundMoney(row.returnAmount);
  const receiptAmount = roundMoney(row.totalPaid);
  const bonusAmount = roundMoney(row.bonusAmount);
  return {
    arDocumentId: clean(row.id || row._id),
    arDocumentCode: clean(row.code),
    orderId: clean(row.sourceOrderId || row.orderId || row.salesOrderId),
    orderCode: clean(row.sourceOrderCode || row.orderCode || row.salesOrderCode),
    documentDate: docDate(row),
    saleAmount,
    returnAmount,
    receiptAmount,
    cashAmount: roundMoney(row.cashAmount),
    bankAmount: roundMoney(row.bankAmount),
    bonusAmount,
    totalCredit: roundMoney(row.totalCredit || (receiptAmount + returnAmount + bonusAmount)),
    currentDebt: debt,
    status: hasOpenDebt(debt) ? 'open' : 'paid',
    version: toNumber(row.version)
  };
}

function sessionOptions(options = {}) {
  return options.session ? { session: options.session } : {};
}

async function findArDocuments(filter = {}, options = {}) {
  let query = MongoStore.arDocuments.find(activeDocFilter(filter)).lean();
  if (options.session) query = query.session(options.session);
  return query;
}

async function rebuildCustomerBalance(customerCode, options = {}) {
  const code = clean(customerCode);
  if (!code) return null;

  const docs = await findArDocuments({ customerCode: code }, options);
  const now = dateUtil.nowIso();
  const orderSnapshots = docs.map(normalizeDocSnapshot).sort((a, b) => String(b.documentDate).localeCompare(String(a.documentDate)));

  const totals = orderSnapshots.reduce((acc, row) => {
    acc.saleAmount += row.saleAmount;
    acc.returnAmount += row.returnAmount;
    acc.receiptAmount += row.receiptAmount;
    acc.cashAmount += row.cashAmount;
    acc.bankAmount += row.bankAmount;
    acc.bonusAmount += row.bonusAmount;
    acc.totalCredit += row.totalCredit;
    acc.currentDebt += row.currentDebt;
    acc.orderCount += 1;
    if (hasOpenDebt(row.currentDebt)) acc.openOrderCount += 1;
    return acc;
  }, {
    saleAmount: 0,
    returnAmount: 0,
    receiptAmount: 0,
    cashAmount: 0,
    bankAmount: 0,
    bonusAmount: 0,
    totalCredit: 0,
    currentDebt: 0,
    orderCount: 0,
    openOrderCount: 0
  });

  totals.currentDebt = normalizeDebtAmount(totals.currentDebt);
  const first = docs[0] || {};
  const balance = {
    id: `CB-${code}`,
    customerId: clean(first.customerId),
    customerCode: code,
    customerName: clean(first.customerName) || code,
    ...totals,
    overdueCount: 0,
    lastDocumentDate: orderSnapshots[0]?.documentDate || '',
    lastUpdatedFrom: 'arDocuments',
    debtZeroTolerance: DEBT_ZERO_TOLERANCE,
    orderSnapshots,
    updatedAt: now,
    createdAt: now
  };

  await MongoStore.customerBalances.updateOne(
    { customerCode: code },
    { $set: balance, $setOnInsert: { createdAt: now } },
    { upsert: true, ...sessionOptions(options) }
  );

  return balance;
}

function salesSnapshotKey(row = {}) {
  return [
    row.documentDate,
    row.salesmanCode || row.salesStaffCode || '',
    row.customerCode || ''
  ].map(clean).join('|');
}

async function rebuildSalesSnapshot(date, options = {}) {
  const normalizedDate = dateUtil.toDateOnly(date || dateUtil.todayVN());
  if (!normalizedDate) return [];

  const docs = await findArDocuments({ documentDate: normalizedDate }, options);
  const now = dateUtil.nowIso();
  const map = new Map();

  for (const doc of docs) {
    const snap = normalizeDocSnapshot(doc);
    const row = {
      date: normalizedDate,
      customerId: clean(doc.customerId),
      customerCode: clean(doc.customerCode),
      customerName: clean(doc.customerName) || clean(doc.customerCode),
      salesmanCode: clean(doc.salesmanCode || doc.salesStaffCode),
      salesmanName: clean(doc.salesmanName || doc.salesStaffName),
      salesStaffCode: clean(doc.salesStaffCode || doc.salesmanCode),
      salesStaffName: clean(doc.salesStaffName || doc.salesmanName),
      deliveryStaffCode: clean(doc.deliveryStaffCode),
      deliveryStaffName: clean(doc.deliveryStaffName),
      saleAmount: 0,
      returnAmount: 0,
      netSalesAmount: 0,
      receiptAmount: 0,
      currentDebt: 0,
      orderCount: 0
    };
    const key = salesSnapshotKey(row);
    if (!map.has(key)) map.set(key, row);
    const target = map.get(key);
    target.saleAmount += snap.saleAmount;
    target.returnAmount += snap.returnAmount;
    target.netSalesAmount += snap.saleAmount - snap.returnAmount;
    target.receiptAmount += snap.receiptAmount;
    target.currentDebt += snap.currentDebt;
    target.orderCount += 1;
  }

  const rows = Array.from(map.values()).map((row) => ({
    ...row,
    id: `SS-${row.date}-${row.salesmanCode || 'NO_SALE'}-${row.customerCode || 'NO_CUSTOMER'}`,
    currentDebt: normalizeDebtAmount(row.currentDebt),
    updatedAt: now,
    createdAt: now
  }));

  await MongoStore.salesSnapshots.deleteMany({ date: normalizedDate }, sessionOptions(options));
  if (rows.length) await MongoStore.salesSnapshots.insertMany(rows, { ordered: false, ...sessionOptions(options) });
  return rows;
}

async function rebuildCashSnapshot(date, options = {}) {
  const normalizedDate = dateUtil.toDateOnly(date || dateUtil.todayVN());
  if (!normalizedDate) return null;

  const docs = await findArDocuments({ documentDate: normalizedDate }, options);
  const now = dateUtil.nowIso();
  const totals = docs.map(normalizeDocSnapshot).reduce((acc, row) => {
    acc.cashAmount += row.cashAmount;
    acc.bankAmount += row.bankAmount;
    acc.receiptAmount += row.receiptAmount;
    acc.returnAmount += row.returnAmount;
    acc.bonusAmount += row.bonusAmount;
    acc.orderCount += 1;
    return acc;
  }, { cashAmount: 0, bankAmount: 0, receiptAmount: 0, returnAmount: 0, bonusAmount: 0, orderCount: 0 });

  const snapshot = {
    id: `CS-${normalizedDate}`,
    date: normalizedDate,
    ...totals,
    updatedAt: now,
    createdAt: now
  };

  await MongoStore.cashSnapshots.updateOne(
    { date: normalizedDate },
    { $set: snapshot, $setOnInsert: { createdAt: now } },
    { upsert: true, ...sessionOptions(options) }
  );

  return snapshot;
}

async function rebuildAccountingSnapshotsForOrders(orders = [], options = {}) {
  const customerCodes = new Set();
  const dates = new Set();

  for (const order of orders || []) {
    const customerCode = clean(order.customerCode);
    if (customerCode) customerCodes.add(customerCode);
    const date = dateUtil.toDateOnly(order.documentDate || order.deliveryDate || order.orderDate || order.date || dateUtil.todayVN());
    if (date) dates.add(date);
  }

  const customerBalances = [];
  for (const customerCode of customerCodes) {
    const balance = await rebuildCustomerBalance(customerCode, options);
    if (balance) customerBalances.push(balance);
  }

  const salesSnapshots = [];
  const cashSnapshots = [];
  for (const date of dates) {
    salesSnapshots.push(...await rebuildSalesSnapshot(date, options));
    const cash = await rebuildCashSnapshot(date, options);
    if (cash) cashSnapshots.push(cash);
  }

  return {
    customerBalances,
    salesSnapshots,
    cashSnapshots,
    customerCount: customerBalances.length,
    dateCount: dates.size
  };
}

module.exports = {
  rebuildCustomerBalance,
  rebuildSalesSnapshot,
  rebuildCashSnapshot,
  rebuildAccountingSnapshotsForOrders,
  normalizeDocSnapshot
};
