'use strict';

const MongoStore = require('../models');
const dateUtil = require('../utils/date.util');
const deliveryFinance = require('../utils/deliveryFinance.util');
const { makeId, toNumber } = require('../utils/common.util');
const { DEBT_ZERO_TOLERANCE, normalizeDebtAmount, hasOpenDebt, isOverpaid } = require('../constants/finance.constants');

function clean(value) {
  return String(value || '').trim();
}

function orderKey(order = {}) {
  return clean(order.id || order._id || order.salesOrderId || order.orderId || order.code || order.orderCode || order.documentCode);
}

function orderCode(order = {}) {
  return clean(order.code || order.orderCode || order.documentCode || order.salesOrderCode || order.id || order._id);
}

function buildArDocumentCode(order = {}) {
  const code = orderCode(order) || orderKey(order) || makeId('ORDER');
  return `AR-${code}`;
}

function lineAmount(value) {
  return Math.max(0, Math.round(toNumber(value)));
}

function makeLine(order = {}, extra = {}) {
  const docCode = buildArDocumentCode(order);
  const sourceOrderId = orderKey(order);
  const sourceOrderCode = orderCode(order) || sourceOrderId;
  const debit = lineAmount(extra.debit);
  const credit = lineAmount(extra.credit);
  const amount = lineAmount(extra.amount ?? Math.max(debit, credit));
  return {
    id: `${docCode}-${extra.type}-${extra.method || extra.codeSuffix || 'LINE'}`,
    code: `${docCode}-${extra.type}-${extra.method || extra.codeSuffix || 'LINE'}`,
    type: extra.type,
    method: extra.method || '',
    date: dateUtil.toDateOnly(extra.date || order.deliveryDate || order.date || order.documentDate || dateUtil.todayVN()),
    debit,
    credit,
    amount,
    refType: extra.refType || 'AR_DOCUMENT',
    refId: sourceOrderId,
    refCode: sourceOrderCode,
    sourceOrderId,
    sourceOrderCode,
    note: extra.note || '',
    status: 'posted'
  };
}

function buildArDocumentLines(order = {}) {
  const code = orderCode(order) || orderKey(order);
  const receivable = lineAmount(deliveryFinance.deliveryDebtBase(order));
  const cash = lineAmount(order.cashCollected ?? order.cashAmount ?? 0);
  const bank = lineAmount(order.bankCollected ?? order.bankAmount ?? order.transferAmount ?? 0);
  const returnAmount = lineAmount(order.returnAmount ?? order.returnedAmount ?? 0);
  const bonus = lineAmount(order.rewardAmount ?? order.bonusAmount ?? order.discountAmount ?? order.allowanceAmount ?? 0);
  const lines = [];

  lines.push(makeLine(order, {
    type: 'AR-SALE',
    codeSuffix: 'SALE',
    debit: receivable,
    amount: receivable,
    note: `Ghi nhận phải thu đơn ${code}`
  }));
  if (cash > 0) lines.push(makeLine(order, {
    type: 'AR-RECEIPT',
    method: 'CASH',
    credit: cash,
    amount: cash,
    note: `Thu tiền mặt đơn ${code}`
  }));
  if (bank > 0) lines.push(makeLine(order, {
    type: 'AR-BANK',
    method: 'BANK',
    credit: bank,
    amount: bank,
    note: `Thu chuyển khoản đơn ${code}`
  }));
  if (returnAmount > 0) lines.push(makeLine(order, {
    type: 'AR-RETURN',
    method: 'RETURN',
    credit: returnAmount,
    amount: returnAmount,
    note: `Cấn trừ hàng trả đơn ${code}`
  }));
  if (bonus > 0) lines.push(makeLine(order, {
    type: 'AR-BONUS',
    method: 'BONUS',
    credit: bonus,
    amount: bonus,
    note: `Cấn trừ trả thưởng/chiết khấu đơn ${code}`
  }));
  return lines;
}

function calculateArDocumentTotals(lines = []) {
  const totalReceivable = lineAmount(lines.reduce((sum, line) => sum + toNumber(line.debit), 0));
  const totalCredit = lineAmount(lines.reduce((sum, line) => sum + toNumber(line.credit), 0));
  const totalPaid = lineAmount(lines
    .filter((line) => ['AR-RECEIPT', 'AR-BANK'].includes(String(line.type || '').toUpperCase()))
    .reduce((sum, line) => sum + toNumber(line.credit), 0));
  const cashAmount = lineAmount(lines.filter((line) => String(line.method || '').toUpperCase() === 'CASH').reduce((sum, line) => sum + toNumber(line.credit), 0));
  const bankAmount = lineAmount(lines.filter((line) => String(line.method || '').toUpperCase() === 'BANK').reduce((sum, line) => sum + toNumber(line.credit), 0));
  const returnAmount = lineAmount(lines.filter((line) => String(line.type || '').toUpperCase() === 'AR-RETURN').reduce((sum, line) => sum + toNumber(line.credit), 0));
  const bonusAmount = lineAmount(lines.filter((line) => String(line.type || '').toUpperCase() === 'AR-BONUS').reduce((sum, line) => sum + toNumber(line.credit), 0));
  const rawDebt = totalReceivable - totalCredit;
  const remainingDebt = Math.abs(rawDebt) <= DEBT_ZERO_TOLERANCE ? 0 : rawDebt;
  return { totalReceivable, totalCredit, totalPaid, cashAmount, bankAmount, returnAmount, bonusAmount, remainingDebt };
}

function statusFromDebt(debt) {
  if (isOverpaid(debt)) return 'overpaid';
  return hasOpenDebt(debt) ? 'open' : 'closed';
}

function buildArDocument(order = {}, existing = {}, options = {}) {
  const now = dateUtil.nowIso();
  const lines = buildArDocumentLines(order);
  const totals = calculateArDocumentTotals(lines);
  const sourceOrderId = orderKey(order);
  const sourceOrderCode = orderCode(order) || sourceOrderId;
  const code = buildArDocumentCode(order);
  const version = Math.max(0, toNumber(existing.version)) + 1;
  const confirmedBy = clean(options.confirmedBy || order.accountingConfirmedBy || order.reAccountingBy || 'accountant');
  return {
    ...(existing || {}),
    id: existing.id || code,
    code,
    sourceType: 'sales_order',
    sourceOrderId,
    sourceOrderCode,
    orderId: sourceOrderId,
    orderCode: sourceOrderCode,
    salesOrderId: sourceOrderId,
    salesOrderCode: sourceOrderCode,
    customerId: clean(order.customerId),
    customerCode: clean(order.customerCode),
    customerName: clean(order.customerName),
    salesmanCode: clean(order.salesmanCode || order.staffCode || order.salesStaffCode),
    salesmanName: clean(order.salesmanName || order.staffName || order.salesStaffName),
    salesStaffCode: clean(order.salesStaffCode || order.salesmanCode || order.staffCode),
    salesStaffName: clean(order.salesStaffName || order.salesmanName || order.staffName),
    deliveryStaffCode: clean(order.deliveryStaffCode),
    deliveryStaffName: clean(order.deliveryStaffName),
    documentDate: dateUtil.toDateOnly(order.documentDate || order.orderDate || order.date || order.deliveryDate || dateUtil.todayVN()),
    deliveryDate: dateUtil.toDateOnly(order.deliveryDate || order.date || order.documentDate || dateUtil.todayVN()),
    ...totals,
    rawRemainingDebt: totals.totalReceivable - totals.totalCredit,
    status: statusFromDebt(totals.remainingDebt),
    accountingStatus: 'confirmed',
    locked: true,
    version,
    lines: lines.map((line) => ({ ...line, arDocumentCode: code, arDocumentId: existing.id || code, version })),
    source: options.mode === 'reconfirm' ? 'delivery_reaccounting' : 'delivery_accounting_confirmed',
    confirmedAt: now,
    confirmedBy,
    reopenedAt: clean(order.reopenedAt || order.unlockedAt),
    reopenedBy: clean(order.reopenedBy || order.unlockedBy),
    reopenReason: clean(order.reopenReason || order.unlockReason),
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function buildFindFilter(order = {}) {
  const sourceOrderId = orderKey(order);
  const sourceOrderCode = orderCode(order) || sourceOrderId;
  const code = buildArDocumentCode(order);
  const ors = [{ code }];
  if (sourceOrderId) ors.push({ sourceOrderId }, { orderId: sourceOrderId }, { salesOrderId: sourceOrderId });
  if (sourceOrderCode) ors.push({ sourceOrderCode }, { orderCode: sourceOrderCode }, { salesOrderCode: sourceOrderCode });
  return { $or: ors };
}

async function syncArLedgersFromDocument(doc = {}, options = {}) {
  if (!doc || !doc.code || !MongoStore.arLedgers) return [];
  const now = dateUtil.nowIso();
  await MongoStore.arLedgers.updateMany({ arDocumentCode: doc.code, status: { $ne: 'replaced' } }, {
    $set: { status: 'replaced', replacedAt: now, updatedAt: now }
  }, { session: options.session });

  const rows = (doc.lines || []).map((line) => ({
    id: line.id,
    code: line.code,
    type: String(line.type || '').toLowerCase().replace(/-/g, '_'),
    date: line.date || doc.documentDate,
    account: 'AR',
    customerId: doc.customerId || '',
    customerCode: doc.customerCode || '',
    customerName: doc.customerName || '',
    salesmanCode: doc.salesmanCode || doc.salesStaffCode || '',
    salesmanName: doc.salesmanName || doc.salesStaffName || '',
    salesStaffCode: doc.salesStaffCode || doc.salesmanCode || '',
    salesStaffName: doc.salesStaffName || doc.salesmanName || '',
    deliveryStaffCode: doc.deliveryStaffCode || '',
    deliveryStaffName: doc.deliveryStaffName || '',
    orderId: doc.sourceOrderId || doc.orderId || '',
    orderCode: doc.sourceOrderCode || doc.orderCode || '',
    salesOrderId: doc.sourceOrderId || doc.salesOrderId || '',
    salesOrderCode: doc.sourceOrderCode || doc.salesOrderCode || '',
    refType: 'AR_DOCUMENT',
    refId: doc.id || doc.code,
    refCode: doc.code,
    arDocumentId: doc.id || doc.code,
    arDocumentCode: doc.code,
    arDocumentVersion: doc.version,
    amount: line.amount,
    debit: line.debit,
    credit: line.credit,
    note: line.note,
    status: 'posted',
    source: doc.source || 'ar_document_service',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    createdAt: now,
    updatedAt: now
  }));

  for (const row of rows) {
    await MongoStore.arLedgers.findOneAndUpdate({ id: row.id }, row, { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session });
  }
  return rows;
}

async function upsertArDocumentForOrder(order = {}, options = {}) {
  if (!MongoStore.arDocuments) throw new Error('Chưa khai báo model arDocuments');
  const existing = await MongoStore.arDocuments.findOne(buildFindFilter(order)).session(options.session || null).lean().catch(() => null);
  const doc = buildArDocument(order, existing || {}, options);
  await MongoStore.arDocuments.findOneAndUpdate({ code: doc.code }, doc, { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session });
  await syncArLedgersFromDocument(doc, options);
  return doc;
}

async function markArDocumentNeedsReconfirm(order = {}, options = {}) {
  if (!MongoStore.arDocuments) return null;
  const existing = await MongoStore.arDocuments.findOne(buildFindFilter(order)).session(options.session || null).lean().catch(() => null);
  if (!existing) return null;
  const now = dateUtil.nowIso();
  const patch = {
    accountingStatus: 'needs_reconfirm',
    status: 'needs_reconfirm',
    locked: false,
    reopenedAt: clean(order.reopenedAt || order.unlockedAt || now),
    reopenedBy: clean(order.reopenedBy || order.unlockedBy || options.unlockedBy || 'admin'),
    reopenReason: clean(order.reopenReason || order.unlockReason || options.reason),
    updatedAt: now
  };
  await MongoStore.arDocuments.updateOne({ code: existing.code }, { $set: patch }, { session: options.session });
  await MongoStore.arLedgers.updateMany({ arDocumentCode: existing.code, status: 'posted' }, {
    $set: { accountingStatus: 'needs_reconfirm', updatedAt: now }
  }, { session: options.session }).catch(() => null);
  return { ...existing, ...patch };
}

module.exports = {
  buildArDocumentCode,
  buildArDocumentLines,
  calculateArDocumentTotals,
  buildArDocument,
  upsertArDocumentForOrder,
  markArDocumentNeedsReconfirm
};
