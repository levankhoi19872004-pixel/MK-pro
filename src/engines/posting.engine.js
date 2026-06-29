'use strict';

const dateUtil = require('../utils/date.util');
const paymentRepository = require('../repositories/paymentRepository');
const { makeId, toNumber } = require('../utils/common.util');
const { debugLog } = require('../utils/debug.util');
const returnArPostingService = require('../services/accounting/returnArPostingService');
const {
  pickSalesStaffCode,
  pickSalesStaffName,
  pickDeliveryStaffCode,
  pickDeliveryStaffName
} = require('../domain/staff/staffIdentity');



function baseJournal(doc = {}, extra = {}) {
  const salesStaffCode = pickSalesStaffCode(extra) || pickSalesStaffCode(doc);
  const salesStaffName = pickSalesStaffName(extra) || pickSalesStaffName(doc);
  const deliveryStaffCode = pickDeliveryStaffCode(extra) || pickDeliveryStaffCode(doc);
  const deliveryStaffName = pickDeliveryStaffName(extra) || pickDeliveryStaffName(doc);

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
    salesmanCode: salesStaffCode,
    salesmanName: salesStaffName,
    salesStaffCode,
    salesStaffName,
    deliveryStaffCode,
    deliveryStaffName,
    orderType: String(extra.orderType || doc.orderType || '').trim(),
    collectorType: String(extra.collectorType || doc.collectorType || '').trim(),
    collectorCode: String(extra.collectorCode || doc.collectorCode || '').trim(),
    collectorName: String(extra.collectorName || doc.collectorName || '').trim(),
    sourceType: String(extra.sourceType || doc.sourceType || '').trim(),
    sourceId: String(extra.sourceId || doc.sourceId || '').trim(),
    sourceCode: String(extra.sourceCode || doc.sourceCode || '').trim(),
    accountingConfirmedBy: String(extra.accountingConfirmedBy || doc.accountingConfirmedBy || '').trim(),
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
    source: extra.source || doc.source || 'posting_engine',
    method: String(extra.method || doc.method || doc.paymentMethod || '').trim(),
    paymentMethod: String(extra.paymentMethod || extra.method || doc.paymentMethod || doc.method || '').trim(),
    deliveryDate: dateUtil.toDateOnly(
      extra.deliveryDate || doc.deliveryDate || doc.date || doc.createdAt || dateUtil.todayVN()
    ),
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
  // Idempotency source-of-truth đã chuyển sang returnArPostingService.
  // Compatibility markers for legacy static checks:
  // status: { $nin: ['void', 'reversed', 'cancelled', 'canceled', 'deleted'] }
  // reversed: { $ne: true }
  // isDeleted: { $ne: true }
  return returnArPostingService.hasActiveArReturnForReturnOrder(returnOrder, options);
}

function returnOrderArAmount(returnOrder = {}) {
  return returnArPostingService._internal.returnOrderAmountAnalysis(returnOrder).amount;
}

async function postReturnOrderAR(returnOrder = {}, options = {}) {
  // Runtime compatibility wrapper only. The only AR-RETURN write path is now:
  // returnArPostingService.postReturnOrderToAR -> paymentRepository.upsert(arLedgers).
  // Ledger field contract remains report-compatible:
  // type: 'ar_return'
  // ledgerType: 'AR-RETURN'
  // category: 'AR-RETURN'
  // { ledgerType: 'AR-RETURN' }
  // { category: 'AR-RETURN' }
  // sourceType: returnOrder.sourceType || returnOrder.refType || 'returnOrder'
  // sourceId: returnOrder.sourceId || returnOrderId || returnOrderCode
  // deliveryStaffCode: returnOrder.deliveryStaffCode || returnOrder.deliveryCode || returnOrder.nvghCode || ''
  // salesmanName: returnOrder.salesmanName || returnOrder.salesStaffName || returnOrder.nvbhName || ''
  // credit: amount
  // salesOrderId / salesOrderCode / orderCode: salesOrderCode
  // const accountingBatchId = String(options.accountingBatchId || returnOrder.accountingBatchId || '').trim();
  // const batchSuffix = options.forceRepostReturn && accountingBatchId ? `-${accountingBatchId}` : '';
  // id: `AR-RETURN-${returnOrderId || returnOrderCode}${batchSuffix}`
  // code: `AR-RETURN-${returnOrderCode || returnOrderId}${batchSuffix}`
  return returnArPostingService.postReturnOrderToAR(returnOrder, options);
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
    salesmanCode: doc.salesmanCode || doc.salesStaffCode || doc.nvbhCode || '',
    salesmanName: doc.salesmanName || doc.salesStaffName || doc.nvbhName || '',
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
      orderType: String(row.orderType || '').trim(),
      salesStaffCode: String(row.salesStaffCode || row.salesmanCode || '').trim(),
      salesStaffName: String(row.salesStaffName || row.salesmanName || '').trim(),
      deliveryStaffCode: String(row.deliveryStaffCode || '').trim(),
      deliveryStaffName: String(row.deliveryStaffName || '').trim(),
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
        refType: receipt.refType || 'RECEIPT',
        refId: receipt.refId || receipt.id || receipt._id || receipt.code,
        refCode: receipt.refCode || receipt.code || receipt.id,
        source: receipt.source || 'posting_engine',
        method: receipt.method || receipt.paymentMethod || '',
        paymentMethod: receipt.paymentMethod || receipt.method || '',
        deliveryDate: receipt.deliveryDate || receipt.date || dateUtil.todayVN(),
        orderId: allocation.orderId,
        orderCode: allocation.orderCode,
        accountingConfirmed: true,
        accountingStatus: 'confirmed',
        masterOrderId: receipt.masterOrderId || '',
        masterOrderCode: receipt.masterOrderCode || '',
        orderType: allocation.orderType || receipt.orderType || '',
        deliveryStaffCode: allocation.deliveryStaffCode || receipt.deliveryStaffCode || '',
        deliveryStaffName: allocation.deliveryStaffName || receipt.deliveryStaffName || '',
        salesmanCode: allocation.salesStaffCode || receipt.salesmanCode || receipt.salesStaffCode || '',
        salesmanName: allocation.salesStaffName || receipt.salesmanName || receipt.salesStaffName || '',
        salesStaffCode: allocation.salesStaffCode || receipt.salesStaffCode || receipt.salesmanCode || '',
        salesStaffName: allocation.salesStaffName || receipt.salesStaffName || receipt.salesmanName || '',
        collectorType: receipt.collectorType || '',
        collectorCode: receipt.collectorCode || '',
        collectorName: receipt.collectorName || '',
        sourceType: receipt.sourceType || 'debtCollection',
        sourceId: receipt.sourceId || receipt.refId || '',
        sourceCode: receipt.sourceCode || receipt.refCode || '',
        accountingConfirmedBy: receipt.accountingConfirmedBy || '',
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
    refType: receipt.refType || 'RECEIPT',
    refId: receipt.refId || receipt.id || receipt._id || receipt.code,
    refCode: receipt.refCode || receipt.code || receipt.id,
    source: receipt.source || 'posting_engine',
    method: receipt.method || receipt.paymentMethod || '',
    paymentMethod: receipt.paymentMethod || receipt.method || '',
    deliveryDate: receipt.deliveryDate || receipt.date || dateUtil.todayVN(),
    orderId: receipt.orderId || receipt.salesOrderId || '',
    orderCode: receipt.orderCode || receipt.salesOrderCode || receipt.refCode || '',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    masterOrderId: receipt.masterOrderId || '',
    masterOrderCode: receipt.masterOrderCode || '',
    orderType: receipt.orderType || '',
    deliveryStaffCode: receipt.deliveryStaffCode || '',
    deliveryStaffName: receipt.deliveryStaffName || '',
    salesmanCode: receipt.salesmanCode || receipt.salesStaffCode || '',
    salesmanName: receipt.salesmanName || receipt.salesStaffName || '',
    salesStaffCode: receipt.salesStaffCode || receipt.salesmanCode || '',
    salesStaffName: receipt.salesStaffName || receipt.salesmanName || '',
    collectorType: receipt.collectorType || '',
    collectorCode: receipt.collectorCode || '',
    collectorName: receipt.collectorName || '',
    sourceType: receipt.sourceType || 'debtCollection',
    sourceId: receipt.sourceId || receipt.refId || '',
    sourceCode: receipt.sourceCode || receipt.refCode || '',
    accountingConfirmedBy: receipt.accountingConfirmedBy || '',
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
  postBonusAllowanceAR,
  _internal: { returnOrderArAmount, hasExistingReturnOrderAR }
};
