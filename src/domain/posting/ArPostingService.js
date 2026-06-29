'use strict';

const path = require('node:path');
const postingEngine = require('../../engines/posting.engine');
const paymentRepository = require('../../repositories/paymentRepository');
function returnOrderRepository() { return require(path.join(__dirname, '../../repositories/returnOrderRepository.js')); }
const returnArPostingService = require('../../services/accounting/returnArPostingService');
const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');

function cleanString(value = '') {
  return String(value || '').trim();
}

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

async function postExternalDebt(input = {}, options = {}) {
  // Canonical external-debt writer: validate source/customer/amount/date/reason,
  // build deterministic idempotency key and prevent replay/conflict.
  // Lazy-load to keep non-external AR posting tests/routes from loading Mongoose models unnecessarily.
  const externalDebtArPostingService = require('../../services/accounting/externalDebtArPostingService');
  return externalDebtArPostingService.postExternalDebt(input, options);
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

function normalizeReturnAllocationRows(allocations = []) {
  const rows = Array.isArray(allocations) ? allocations : [];
  return rows.map((row = {}, index) => ({
    index,
    allocationId: cleanString(row.allocationId || row.id || ''),
    allocationCode: cleanString(row.allocationCode || row.code || ''),
    returnOrderId: cleanString(row.returnOrderId || row.returnId || row.sourceReturnOrderId || ''),
    returnOrderCode: cleanString(row.returnOrderCode || row.returnCode || row.sourceReturnOrderCode || ''),
    orderId: cleanString(row.orderId || row.salesOrderId || row.sourceOrderId || ''),
    orderCode: cleanString(row.orderCode || row.salesOrderCode || row.sourceOrderCode || ''),
    amount: toNumber(row.amount ?? row.allocatedAmount ?? row.paymentAmount),
    raw: row
  }));
}

function returnOrderKeyFrom(row = {}) {
  return cleanString(row.returnOrderId || row.returnOrderCode);
}

function baseReturnOrderKey(returnOrder = {}) {
  return cleanString(returnOrder.returnOrderId || returnOrder.id || returnOrder._id || returnOrder.returnOrderCode || returnOrder.code);
}

function allocationDetails(rows = []) {
  return rows.map((row) => ({
    allocationId: row.allocationId,
    allocationCode: row.allocationCode,
    returnOrderId: row.returnOrderId,
    returnOrderCode: row.returnOrderCode,
    orderId: row.orderId,
    orderCode: row.orderCode,
    amount: row.amount
  }));
}

function resultEnvelope(results = []) {
  const entries = results.map((row) => row.entry).filter(Boolean);
  return {
    posted: results.filter((row) => row.posted).length,
    skipped: results.filter((row) => !row.posted).length,
    results,
    entries
  };
}

async function resolveAllocationReturnOrder(ref = {}, options = {}) {
  const key = cleanString(ref.returnOrderId || ref.returnOrderCode || ref.id || ref.code);
  if (!key) return null;
  return returnOrderRepository().findByIdOrCode(key, options);
}

function enrichReturnOrderWithAllocationMetadata(returnOrder = {}, rows = []) {
  const details = allocationDetails(rows);
  return {
    ...returnOrder,
    allocationDetails: details,
    returnAllocationRefs: details.map((row) => cleanString(row.allocationId || row.allocationCode)).filter(Boolean),
    metadata: {
      ...(returnOrder.metadata || {}),
      allocations: details,
      allocationPostingMode: 'single_ar_return_per_return_order'
    }
  };
}

async function postReturnAllocations(returnOrder = {}, allocations = [], options = {}) {
  // P0 rule: allocation là chi tiết phân bổ nội bộ. Không được đổi id/code của returnOrder
  // để biến mỗi allocation thành một AR-RETURN riêng. Writer duy nhất là returnArPostingService.
  const rows = normalizeReturnAllocationRows(allocations);
  const byReturnOrderKey = new Map();
  const baseKey = baseReturnOrderKey(returnOrder);
  const results = [];

  for (const row of rows) {
    const key = returnOrderKeyFrom(row) || baseKey;
    if (!key) continue;
    if (!byReturnOrderKey.has(key)) byReturnOrderKey.set(key, []);
    byReturnOrderKey.get(key).push(row);
  }

  if (!rows.length && baseKey) {
    byReturnOrderKey.set(baseKey, []);
  }

  if (!byReturnOrderKey.size) {
    const result = {
      posted: false,
      entry: null,
      reason: 'missing_return_order_id',
      skippedAllocations: rows.length,
      message: 'Không tạo AR-RETURN vì allocation không xác định được returnOrder gốc.'
    };
    results.push(result);
    return options.returnResult ? resultEnvelope(results) : [];
  }

  for (const [key, groupedRows] of byReturnOrderKey.entries()) {
    const explicitAllocationKey = groupedRows.some((row) => returnOrderKeyFrom(row));
    const sourceReturnOrder = explicitAllocationKey
      ? await resolveAllocationReturnOrder({ id: key, code: key }, options)
      : returnOrder;

    if (!sourceReturnOrder || !baseReturnOrderKey(sourceReturnOrder)) {
      results.push({
        posted: false,
        entry: null,
        reason: 'return_order_not_found',
        returnOrderKey: key,
        skippedAllocations: groupedRows.length
      });
      continue;
    }

    const postResult = await returnArPostingService.postReturnOrderToAR(
      enrichReturnOrderWithAllocationMetadata(sourceReturnOrder, groupedRows),
      { ...options, returnResult: true }
    );

    results.push({
      ...postResult,
      returnOrderKey: baseReturnOrderKey(sourceReturnOrder),
      allocationCount: groupedRows.length,
      allocationDetails: allocationDetails(groupedRows)
    });
  }

  return options.returnResult ? resultEnvelope(results) : results.map((row) => row.entry).filter(Boolean);
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
  markReversed,
  _internal: {
    normalizeReturnAllocationRows,
    returnOrderKeyFrom,
    baseReturnOrderKey,
    allocationDetails,
    enrichReturnOrderWithAllocationMetadata
  }
};
