'use strict';

const paymentRepository = require('../repositories/paymentRepository');
const { makeId, toNumber } = require('../utils/common.util');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function baseJournal(doc = {}, extra = {}) {
  return {
    id: extra.id || makeId('JR'),
    code: extra.code || `${extra.prefix || 'JR'}-${doc.code || doc.id || Date.now()}`,
    date: String(extra.date || doc.date || doc.documentDate || doc.orderDate || doc.createdAt || today()).slice(0, 10),
    type: extra.type || 'ar',
    account: extra.account || 'AR',
    refType: extra.refType || doc.refType || 'DOCUMENT',
    refId: String(extra.refId || doc.id || doc._id || doc.code || '').trim(),
    refCode: String(extra.refCode || doc.code || doc.orderCode || doc.refCode || '').trim(),
    orderId: String(extra.orderId || doc.orderId || doc.salesOrderId || doc.id || '').trim(),
    orderCode: String(extra.orderCode || doc.orderCode || doc.salesOrderCode || doc.code || '').trim(),
    customerId: String(extra.customerId || doc.customerId || '').trim(),
    customerCode: String(extra.customerCode || doc.customerCode || '').trim(),
    customerName: String(extra.customerName || doc.customerName || '').trim(),
    salesmanCode: String(extra.salesmanCode || doc.salesmanCode || doc.staffCode || doc.salesStaffCode || '').trim(),
    salesmanName: String(extra.salesmanName || doc.salesmanName || doc.staffName || doc.salesStaffName || '').trim(),
    deliveryStaffCode: String(extra.deliveryStaffCode || doc.deliveryStaffCode || '').trim(),
    deliveryStaffName: String(extra.deliveryStaffName || doc.deliveryStaffName || '').trim(),
    debit: toNumber(extra.debit),
    credit: toNumber(extra.credit),
    amount: toNumber(extra.amount ?? Math.max(toNumber(extra.debit), toNumber(extra.credit))),
    note: String(extra.note || doc.note || '').trim(),
    status: extra.status || 'posted',
    source: extra.source || 'posting_engine',
    createdAt: extra.createdAt || nowIso(),
    updatedAt: nowIso()
  };
}

async function postSalesOrderAR(order = {}, options = {}) {
  const amount = toNumber(order.debtAmount ?? Math.max(0, toNumber(order.totalAmount) - toNumber(order.paidAmount)));
  if (amount <= 0) return null;
  const entry = baseJournal(order, {
    id: `AR-SALE-${order.id || order.code}`,
    code: `AR-SALE-${order.code || order.id}`,
    type: 'ar_sale',
    refType: 'SALES_ORDER',
    refId: order.id || order._id || order.code,
    refCode: order.code || order.id,
    orderId: order.id || order._id || order.code,
    orderCode: order.code || order.id,
    debit: amount,
    credit: 0,
    amount,
    note: `Ghi nhận công nợ đơn bán ${order.code || order.id}`
  });
  await paymentRepository.upsert(entry, options);
  return entry;
}

async function reverseSalesOrderAR(order = {}, options = {}) {
  const amount = toNumber(order.debtAmount ?? Math.max(0, toNumber(order.totalAmount) - toNumber(order.paidAmount)));
  if (amount <= 0) return null;
  const entry = baseJournal(order, {
    id: `AR-SALE-REV-${order.id || order.code}`,
    code: `AR-SALE-REV-${order.code || order.id}`,
    type: 'ar_sale_reversal',
    refType: 'SALES_ORDER_REVERSAL',
    refId: order.id || order._id || order.code,
    refCode: order.code || order.id,
    orderId: order.id || order._id || order.code,
    orderCode: order.code || order.id,
    debit: 0,
    credit: amount,
    amount,
    note: `Đảo công nợ đơn bán ${order.code || order.id}`
  });
  await paymentRepository.upsert(entry, options);
  return entry;
}

async function postReturnOrderAR(returnOrder = {}, options = {}) {
  const amount = toNumber(returnOrder.debtReduction ?? returnOrder.totalAmount ?? returnOrder.amount);
  if (amount <= 0) return null;
  const entry = baseJournal(returnOrder, {
    id: `AR-RETURN-${returnOrder.id || returnOrder.code}`,
    code: `AR-RETURN-${returnOrder.code || returnOrder.id}`,
    type: 'ar_return',
    refType: 'RETURN_ORDER',
    refId: returnOrder.id || returnOrder._id || returnOrder.code,
    refCode: returnOrder.code || returnOrder.id,
    orderId: returnOrder.salesOrderId || returnOrder.orderId || '',
    orderCode: returnOrder.salesOrderCode || returnOrder.orderCode || '',
    debit: 0,
    credit: amount,
    amount,
    note: `Giảm công nợ trả hàng ${returnOrder.code || returnOrder.id}`
  });
  await paymentRepository.upsert(entry, options);
  return entry;
}

async function reverseReturnOrderAR(returnOrder = {}, options = {}) {
  const amount = toNumber(returnOrder.debtReduction ?? returnOrder.totalAmount ?? returnOrder.amount);
  if (amount <= 0) return null;
  const entry = baseJournal(returnOrder, {
    id: `AR-RETURN-REV-${returnOrder.id || returnOrder.code}`,
    code: `AR-RETURN-REV-${returnOrder.code || returnOrder.id}`,
    type: 'ar_return_reversal',
    refType: 'RETURN_ORDER_REVERSAL',
    refId: returnOrder.id || returnOrder._id || returnOrder.code,
    refCode: returnOrder.code || returnOrder.id,
    orderId: returnOrder.salesOrderId || returnOrder.orderId || '',
    orderCode: returnOrder.salesOrderCode || returnOrder.orderCode || '',
    debit: amount,
    credit: 0,
    amount,
    note: `Đảo giảm công nợ trả hàng ${returnOrder.code || returnOrder.id}`
  });
  await paymentRepository.upsert(entry, options);
  return entry;
}


async function postReceiptAR(receipt = {}, options = {}) {
  const amount = toNumber(receipt.amount ?? receipt.totalAmount ?? receipt.value);
  if (amount <= 0) return null;
  const entry = baseJournal(receipt, {
    id: `AR-RECEIPT-${receipt.id || receipt.code}`,
    code: `AR-RECEIPT-${receipt.code || receipt.id}`,
    type: 'ar_receipt',
    refType: 'RECEIPT',
    refId: receipt.id || receipt._id || receipt.code,
    refCode: receipt.code || receipt.id,
    orderId: receipt.orderId || receipt.salesOrderId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    debit: 0,
    credit: amount,
    amount,
    note: receipt.note || `Thu công nợ ${receipt.code || receipt.id}`
  });
  await paymentRepository.upsert(entry, options);
  return entry;
}

async function reverseReceiptAR(receipt = {}, options = {}) {
  const amount = toNumber(receipt.amount ?? receipt.totalAmount ?? receipt.value);
  if (amount <= 0) return null;
  const entry = baseJournal(receipt, {
    id: `AR-RECEIPT-VOID-${receipt.id || receipt.code}`,
    code: `AR-RECEIPT-VOID-${receipt.code || receipt.id}`,
    type: 'receipt_void',
    journalType: 'RECEIPT_VOID',
    refType: 'receipt',
    refId: receipt.id || receipt._id || receipt.code,
    refCode: receipt.code || receipt.id,
    orderId: receipt.orderId || receipt.salesOrderId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    debit: amount,
    credit: 0,
    amount,
    note: receipt.voidReason || `Hủy phiếu thu ${receipt.code || receipt.id} - hoàn công nợ`
  });
  await paymentRepository.upsert(entry, options);
  return entry;
}

async function postDocument(doc = {}, options = {}) {
  const kind = String(options.kind || doc.kind || doc.refType || '').toUpperCase();
  if (kind === 'SALES_ORDER') return postSalesOrderAR(doc, options);
  if (kind === 'SALES_ORDER_REVERSAL') return reverseSalesOrderAR(doc, options);
  if (kind === 'RETURN_ORDER') return postReturnOrderAR(doc, options);
  if (kind === 'RETURN_ORDER_REVERSAL') return reverseReturnOrderAR(doc, options);
  if (kind === 'RECEIPT') return postReceiptAR(doc, options);
  if (kind === 'RECEIPT_VOID') return reverseReceiptAR(doc, options);
  throw new Error(`posting.engine.js: chưa hỗ trợ loại chứng từ ${kind || 'UNKNOWN'}`);
}

module.exports = {
  postDocument,
  postSalesOrderAR,
  reverseSalesOrderAR,
  postReturnOrderAR,
  reverseReturnOrderAR,
  postReceiptAR,
  reverseReceiptAR
};
