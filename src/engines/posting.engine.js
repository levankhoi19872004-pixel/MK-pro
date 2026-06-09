'use strict';

const dateUtil = require('../utils/date.util');
const paymentRepository = require('../repositories/paymentRepository');
const { makeId, toNumber } = require('../utils/common.util');



function baseJournal(doc = {}, extra = {}) {
  return {
    id: extra.id || makeId('JR'),
    code: extra.code || `${extra.prefix || 'JR'}-${doc.code || doc.id || Date.now()}`,
    date: dateUtil.toDateOnly(extra.date || doc.date || doc.documentDate || doc.orderDate || doc.createdAt || dateUtil.todayVN()),
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
    deliveryStaffCode: String(extra.deliveryStaffCode || doc.deliveryStaffCode || doc.deliveryCode || doc.nvghCode || '').trim(),
    deliveryStaffName: String(extra.deliveryStaffName || doc.deliveryStaffName || doc.deliveryName || doc.nvghName || '').trim(),
    masterOrderId: String(extra.masterOrderId || doc.masterOrderId || doc.deliveryMasterId || '').trim(),
    masterOrderCode: String(extra.masterOrderCode || doc.masterOrderCode || doc.deliveryMasterCode || '').trim(),
    accountingBatchId: String(extra.accountingBatchId || doc.accountingBatchId || '').trim(),
    accountingConfirmed: extra.accountingConfirmed ?? doc.accountingConfirmed ?? true,
    accountingStatus: String(extra.accountingStatus || doc.accountingStatus || 'confirmed').trim(),
    debit: toNumber(extra.debit),
    credit: toNumber(extra.credit),
    amount: toNumber(extra.amount ?? Math.max(toNumber(extra.debit), toNumber(extra.credit))),
    note: String(extra.note || doc.note || '').trim(),
    status: extra.status || 'posted',
    source: extra.source || 'posting_engine',
    createdAt: extra.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
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


async function hasExistingReturnOrderAR(returnOrder = {}, options = {}) {
  const returnOrderId = String(returnOrder.id || returnOrder._id || returnOrder.returnOrderId || '').trim();
  const returnOrderCode = String(returnOrder.code || returnOrder.returnOrderCode || '').trim();
  const exactKeys = [returnOrderId, returnOrderCode].filter(Boolean);
  if (!exactKeys.length) return false;

  const rows = await paymentRepository.findAll({
    type: 'ar_return',
    $or: [
      { id: { $in: exactKeys.map((key) => `AR-RETURN-${key}`) } },
      { code: { $in: exactKeys.map((key) => `AR-RETURN-${key}`) } },
      { refId: { $in: exactKeys } },
      { refCode: { $in: exactKeys } },
      { returnOrderId: { $in: exactKeys } },
      { returnOrderCode: { $in: exactKeys } }
    ]
  }, options);
  return Array.isArray(rows) && rows.some((row) => toNumber(row.credit ?? row.amount) > 0);
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

function firstPositiveArAmount(values = []) {
  for (const value of values) {
    const amount = toNumber(value);
    if (amount > 0) return amount;
  }
  return 0;
}

function returnOrderArAmount(returnOrder = {}) {
  // Ưu tiên số dương đầu tiên. Không dùng ?? với totalAmount trước amount,
  // vì returnOrders thực tế có thể totalAmount=0 nhưng amount/debtReduction > 0.
  return Math.max(0, Math.round(firstPositiveArAmount([
    returnOrder.debtReduction,
    returnOrder.amount,
    returnOrder.totalReturnAmount,
    returnOrder.totalAmount,
    returnOrder.returnAmount,
    returnOrder.totalValue
  ])));
}

async function postReturnOrderAR(returnOrder = {}, options = {}) {
  if (options.skipIfExists && await hasExistingReturnOrderAR(returnOrder, options)) {
    return null;
  }
  const amount = returnOrderArAmount(returnOrder);
  if (amount <= 0) return null;

  const returnOrderId = String(returnOrder.id || returnOrder._id || returnOrder.code || '').trim();
  const returnOrderCode = String(returnOrder.code || returnOrder.id || '').trim();
  const salesOrderId = String(returnOrder.salesOrderId || returnOrder.orderId || returnOrder.sourceOrderId || '').trim();
  const salesOrderCode = String(returnOrder.salesOrderCode || returnOrder.orderCode || returnOrder.sourceOrderCode || '').trim();

  const entry = {
    ...baseJournal(returnOrder, {
      id: `AR-RETURN-${returnOrderId || returnOrderCode}`,
      code: `AR-RETURN-${returnOrderCode || returnOrderId}`,
      type: 'ar_return',
      refType: 'RETURN_ORDER',
      refId: returnOrderId || returnOrderCode,
      refCode: returnOrderCode || returnOrderId,
      orderId: salesOrderId,
      orderCode: salesOrderCode,
      accountingConfirmed: true,
      accountingStatus: 'confirmed',
      masterOrderId: returnOrder.masterOrderId || '',
      masterOrderCode: returnOrder.masterOrderCode || '',
      deliveryStaffCode: returnOrder.deliveryStaffCode || returnOrder.staffCode || '',
      deliveryStaffName: returnOrder.deliveryStaffName || returnOrder.staffName || '',
      salesmanCode: returnOrder.salesmanCode || returnOrder.salesStaffCode || '',
      salesmanName: returnOrder.salesmanName || returnOrder.salesStaffName || '',
      debit: 0,
      credit: amount,
      amount,
      source: returnOrder.source || 'returnOrders',
      note: returnOrder.note || `Giảm công nợ từ phiếu trả hàng ${returnOrderCode || returnOrderId}`
    }),
    returnOrderId: returnOrderId || returnOrderCode,
    returnOrderCode: returnOrderCode || returnOrderId,
    items: Array.isArray(returnOrder.items) ? returnOrder.items : []
  };
  await paymentRepository.upsert(entry, options);
  return entry;
}

async function reverseReturnOrderAR(returnOrder = {}, options = {}) {
  const amount = returnOrderArAmount(returnOrder);
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

async function postBonusAllowanceAR(doc = {}, options = {}) {
  const amount = toNumber(
    doc.rewardAmount
    ?? doc.displayRewardAmount
    ?? doc.bonusAmount
    ?? doc.allowanceAmount
    ?? doc.discountAmount
    ?? 0
  );
  const key = doc.id || doc._id || doc.code || doc.orderId || doc.orderCode;
  const journalId = `AR-BONUS-${key}`;

  // Nếu kế toán sửa tiền trả thưởng về 0 thì phải xóa bút toán cấn trừ cũ,
  // tránh AR Ledger vẫn còn giữ credit cũ làm lệch công nợ.
  if (amount <= 0) {
    if (key && typeof paymentRepository.deleteOne === 'function') {
      await paymentRepository.deleteOne(journalId, options);
    }
    return null;
  }

  const entry = baseJournal(doc, {
    id: journalId,
    code: `AR-BONUS-${doc.code || doc.orderCode || doc.id}`,
    type: 'ar_bonus',
    refType: 'BONUS_ALLOWANCE',
    refId: doc.id || doc._id || doc.code,
    refCode: doc.code || doc.orderCode || doc.id,
    orderId: doc.id || doc._id || doc.orderId || doc.code,
    orderCode: doc.code || doc.orderCode || doc.id,
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    masterOrderId: doc.masterOrderId || doc.deliveryMasterId || '',
    masterOrderCode: doc.masterOrderCode || doc.deliveryMasterCode || '',
    deliveryStaffCode: doc.deliveryStaffCode || doc.deliveryCode || doc.nvghCode || '',
    deliveryStaffName: doc.deliveryStaffName || doc.deliveryName || doc.nvghName || '',
    salesmanCode: doc.salesmanCode || doc.salesStaffCode || doc.nvbhCode || doc.staffCode || '',
    salesmanName: doc.salesmanName || doc.salesStaffName || doc.nvbhName || doc.staffName || '',
    debit: 0,
    credit: amount,
    amount,
    note: doc.bonusNote || doc.rewardNote || `Cấn trừ công nợ trả thưởng ${doc.code || doc.orderCode || doc.id}`
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
        accountingConfirmed: true,
        accountingStatus: 'confirmed',
        masterOrderId: receipt.masterOrderId || '',
        masterOrderCode: receipt.masterOrderCode || '',
        deliveryStaffCode: receipt.deliveryStaffCode || '',
        deliveryStaffName: receipt.deliveryStaffName || '',
        salesmanCode: receipt.salesmanCode || '',
        salesmanName: receipt.salesmanName || '',
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
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    masterOrderId: receipt.masterOrderId || '',
    masterOrderCode: receipt.masterOrderCode || '',
    deliveryStaffCode: receipt.deliveryStaffCode || '',
    deliveryStaffName: receipt.deliveryStaffName || '',
    salesmanCode: receipt.salesmanCode || '',
    salesmanName: receipt.salesmanName || '',
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
  if (['BONUS', 'ALLOWANCE', 'DISCOUNT', 'REWARD', 'BONUS_ALLOWANCE'].includes(kind)) return postBonusAllowanceAR(doc, options);
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
  reverseReceiptAR,
  postBonusAllowanceAR
};
