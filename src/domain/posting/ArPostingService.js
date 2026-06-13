'use strict';

const postingEngine = require('../../engines/posting.engine');
const paymentRepository = require('../../repositories/paymentRepository');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');


function sanitizeLedgerRow(row = {}) {
  const { _id, __v, ...clean } = row || {};
  return clean;
}

async function postBatch(rows = [], options = {}) {
  const posted = [];

  for (const row of (rows || []).filter(Boolean)) {
    const entry = sanitizeLedgerRow({
      ...row,
      status: row.status || 'posted',
      accountingConfirmed: row.accountingConfirmed ?? true,
      accountingStatus: row.accountingStatus || 'confirmed',
      updatedAt: dateUtil.nowIso()
    });

    await paymentRepository.upsert(entry, options);
    posted.push(entry);
  }

  return posted;
}

async function markReversed(rows = [], user = {}, options = {}) {
  const reversed = [];

  for (const row of (rows || []).filter(Boolean)) {
    const patched = sanitizeLedgerRow({
      ...row,
      reversed: true,
      status: 'reversed',
      reversedAt: row.reversedAt || dateUtil.nowIso(),
      reversedBy: user.id || user.code || user.name || row.reversedBy || 'system',
      updatedAt: dateUtil.nowIso()
    });

    await paymentRepository.upsert(patched, options);
    reversed.push(patched);
  }

  return reversed;
}


async function postExternalDebt(order = {}, options = {}) {
  const amount = Math.max(0, toNumber(order.debit ?? order.amount ?? order.totalAmount));
  if (amount <= 0) return null;

  const sourceId = String(order.orderId || order.sourceId || order.refId || order.id || order.code || '').trim();
  const sourceCode = String(order.orderCode || order.sourceCode || order.refCode || order.code || order.id || '').trim();
  const suppliedId = String(order.ledgerId || order.arLedgerId || order.id || '').trim();
  const suppliedCode = String(order.ledgerCode || order.arLedgerCode || order.code || '').trim();
  const entry = sanitizeLedgerRow({
    ...order,
    id: suppliedId.startsWith('AR-EXTERNAL-') ? suppliedId : `AR-EXTERNAL-${sourceId || sourceCode}`,
    code: suppliedCode.startsWith('AR-EXTERNAL-') ? suppliedCode : `AR-EXTERNAL-${sourceCode || sourceId}`,
    type: 'ar_external_debt',
    account: 'AR',
    orderType: 'external_debt',
    refType: order.refType || 'EXTERNAL_DEBT_ORDER',
    refId: order.refId || id,
    refCode: order.refCode || code,
    sourceType: order.sourceType || 'externalDebtOrder',
    sourceId: order.sourceId || id,
    sourceCode: order.sourceCode || code,
    debit: amount,
    credit: 0,
    amount,
    status: order.status || 'posted',
    accountingConfirmed: true,
    accountingStatus: 'confirmed',
    createdAt: order.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  });

  await paymentRepository.upsert(entry, options);
  return entry;
}

async function postSale(order = {}, options = {}) {
  return postingEngine.postSalesOrderAR(order, options);
}

async function postReceipt(receipt = {}, options = {}) {
  return postingEngine.postReceiptAR(receipt, options);
}

async function postReturn(returnOrder = {}, options = {}) {
  return postingEngine.postReturnOrderAR(returnOrder, options);
}

async function postReturnAllocations(returnOrder = {}, allocations = [], options = {}) {
  const rows = Array.isArray(allocations) ? allocations : [];
  const fallbackAmount = toNumber(returnOrder.debtReduction ?? returnOrder.amount ?? returnOrder.totalReturnAmount ?? returnOrder.totalAmount);
  const normalized = rows.length ? rows : [{
    orderId: returnOrder.salesOrderId || returnOrder.orderId || '',
    orderCode: returnOrder.salesOrderCode || returnOrder.orderCode || '',
    amount: fallbackAmount
  }];

  const entries = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const allocation = normalized[index] || {};
    const amount = toNumber(allocation.amount ?? allocation.allocatedAmount ?? allocation.paymentAmount);
    if (amount <= 0) continue;

    const orderId = String(allocation.orderId || allocation.salesOrderId || '').trim();
    const orderCode = String(allocation.orderCode || allocation.salesOrderCode || '').trim();
    const allocationKey = orderId || orderCode || String(index + 1);
    const entry = await postReturn({
      ...returnOrder,
      id: `${returnOrder.id || returnOrder.code}-${allocationKey}`,
      code: `${returnOrder.code || returnOrder.id}-${index + 1}`,
      salesOrderId: orderId,
      salesOrderCode: orderCode,
      orderId,
      orderCode,
      amount,
      debtReduction: amount,
      totalReturnAmount: amount,
      totalAmount: amount
    }, options);

    if (entry) entries.push(entry);
  }

  return entries;
}

async function reverseReceipt(receipt = {}, options = {}) {
  return postingEngine.reverseReceiptAR(receipt, options);
}

async function reverseSale(order = {}, options = {}) {
  return postingEngine.reverseSalesOrderAR(order, options);
}

async function reverseReturn(returnOrder = {}, options = {}) {
  return postingEngine.reverseReturnOrderAR(returnOrder, options);
}

async function postBonusAllowance(order = {}, options = {}) {
  return postingEngine.postBonusAllowanceAR(order, options);
}

module.exports = {
  postExternalDebt,
  postSale,
  postReceipt,
  postReturn,
  postReturnAllocations,
  reverseReceipt,
  reverseSale,
  reverseReturn,
  postBonusAllowance,
  postBatch,
  markReversed
};
