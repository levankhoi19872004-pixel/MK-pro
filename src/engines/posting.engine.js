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

async function hasExistingSalesOrderAR(order = {}, options = {}) {
  const keys = [
    order.id,
    order._id,
    order.code,
    order.orderId,
    order.orderCode
  ].map((value) => String(value || '').trim()).filter(Boolean);
  if (!keys.length) return false;
  const rows = await paymentRepository.findAll({
    type: 'ar_sale',
    $or: [
      { id: { $in: keys.map((key) => `AR-SALE-${key}`) } },
      { orderId: { $in: keys } },
      { orderCode: { $in: keys } },
      { refId: { $in: keys } },
      { refCode: { $in: keys } }
    ]
  }, options);
  return Array.isArray(rows) && rows.some((row) => toNumber(row.debit ?? row.amount) >= 0);
}

async function postSalesOrderAR(order = {}, options = {}) {
  // ERP/DMS chuẩn: AR-SALE là phát sinh tăng nợ gốc khi đơn đã giao.
  // Không tự trừ paidAmount tại đây; receipt/return sẽ là bút toán credit riêng.
  // Quan trọng: app giao hàng có thể bấm lưu tiền nhiều lần. Nếu AR-SALE đã có,
  // không được upsert lại vì sẽ ghi đè phát sinh nợ gốc và làm công nợ lệch.
  if (options.skipIfExists && await hasExistingSalesOrderAR(order, options)) {
    return null;
  }

  const amount = Math.max(0, toNumber(
    order.debtBeforeCollection
    ?? order.totalAmount
    ?? order.amount
    ?? order.grandTotal
    ?? order.payableAmount
    ?? order.debtAmount
    ?? 0
  ));
  if (amount <= 0 && !options.postZero) return null;
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


function normalizeAllocations(doc = {}) {
  const rows = Array.isArray(doc.allocations) ? doc.allocations : [];
  return rows
    .map((row) => ({
      orderId: String(row.orderId || row.salesOrderId || row.id || '').trim(),
      orderCode: String(row.orderCode || row.salesOrderCode || row.code || '').trim(),
      amount: toNumber(row.amount ?? row.allocatedAmount ?? row.paymentAmount)
    }))
    .filter((row) => row.amount > 0);
}

async function postReceiptAR(receipt = {}, options = {}) {
  const amount = toNumber(receipt.amount ?? receipt.totalAmount ?? receipt.value);
  if (amount <= 0) return null;
  const allocations = normalizeAllocations(receipt);
  if (allocations.length) {
    const entries = [];
    for (let index = 0; index < allocations.length; index += 1) {
      const allocation = allocations[index];
      const entry = baseJournal(receipt, {
        id: `AR-RECEIPT-${receipt.id || receipt.code}-${allocation.orderId || allocation.orderCode || index + 1}`,
        code: `AR-RECEIPT-${receipt.code || receipt.id}-${index + 1}`,
        type: 'ar_receipt',
        refType: 'RECEIPT',
        refId: receipt.id || receipt._id || receipt.code,
        refCode: receipt.code || receipt.id,
        orderId: allocation.orderId,
        orderCode: allocation.orderCode,
        debit: 0,
        credit: allocation.amount,
        amount: allocation.amount,
        note: receipt.note || `Thu công nợ ${receipt.code || receipt.id}`
      });
      await paymentRepository.upsert(entry, options);
      entries.push(entry);
    }
    return entries;
  }
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
  const allocations = normalizeAllocations(receipt);
  if (allocations.length) {
    const entries = [];
    for (let index = 0; index < allocations.length; index += 1) {
      const allocation = allocations[index];
      const entry = baseJournal(receipt, {
        id: `AR-RECEIPT-VOID-${receipt.id || receipt.code}-${allocation.orderId || allocation.orderCode || index + 1}`,
        code: `AR-RECEIPT-VOID-${receipt.code || receipt.id}-${index + 1}`,
        type: 'receipt_void',
        journalType: 'RECEIPT_VOID',
        refType: 'receipt',
        refId: receipt.id || receipt._id || receipt.code,
        refCode: receipt.code || receipt.id,
        orderId: allocation.orderId,
        orderCode: allocation.orderCode,
        debit: allocation.amount,
        credit: 0,
        amount: allocation.amount,
        note: receipt.voidReason || `Hủy phiếu thu ${receipt.code || receipt.id} - hoàn công nợ`
      });
      await paymentRepository.upsert(entry, options);
      entries.push(entry);
    }
    return entries;
  }
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
  hasExistingSalesOrderAR,
  reverseSalesOrderAR,
  postReturnOrderAR,
  reverseReturnOrderAR,
  postReceiptAR,
  reverseReceiptAR
};
