'use strict';

// Canonical Posting Engine facade. Các flow mới import từ src/core/posting/posting.engine.
// File src/engines/posting.engine.js được giữ để tương thích ngược với code hiện tại.
const legacyPostingEngine = require('../../engines/posting.engine');
const inventoryService = require('../../services/inventoryService');
const fundService = require('../../services/fundService');
const eventLogService = require('../../services/eventLogService');

function sourceIdentity(source = {}) {
  return String(
    source.id ||
    source._id ||
    source.code ||
    source.orderCode ||
    source.returnOrderCode ||
    source.receiptCode ||
    source.sourceId ||
    source.sourceCode ||
    ''
  ).trim();
}

function idempotencyKey(sourceType, source = {}, entryType = '', productCode = '') {
  return [sourceType, sourceIdentity(source), entryType, productCode]
    .map((v) => String(v || '').trim())
    .join(':');
}

function fundIdempotencyKey(source = {}, entryType = 'FUND', direction = '', account = '') {
  return ['FUND', sourceIdentity(source), entryType, direction, account]
    .map((v) => String(v || '').trim())
    .join(':');
}

async function recordPostingAudit(eventType, source = {}, ledger = null, context = {}) {
  if (context.skipAudit === true || typeof eventLogService?.recordEvent !== 'function') return null;
  return eventLogService.recordEvent({
    eventType,
    aggregateType: source.sourceType || source.kind || eventType,
    aggregateId: source.id || source._id || source.sourceId,
    aggregateCode: source.code || source.sourceCode || source.orderCode || source.returnOrderCode,
    source: 'posting_engine',
    sourceType: source.sourceType || source.kind || eventType,
    sourceId: source.sourceId || source.id || source._id,
    sourceCode: source.sourceCode || source.code || source.orderCode || source.returnOrderCode,
    ledgerId: ledger?.id || ledger?._id || ledger?.ledger?.id || ledger?.ledger?._id,
    amount: source.amount ?? source.totalAmount ?? ledger?.amount ?? ledger?.ledger?.amount,
    idempotencyKey: context.idempotencyKey || source.idempotencyKey || ledger?.idempotencyKey || ledger?.ledger?.idempotencyKey,
    payload: { source, ledger },
    createdBy: context.createdBy || context.userId || source.createdBy
  }, context).catch((error) => {
    if (process.env.NODE_ENV === 'test') return null;
    console.warn('[posting.audit] failed:', error.message);
    return null;
  });
}

async function postSale(order, context = {}) {
  const result = await legacyPostingEngine.postSalesOrderAR(order, {
    ...context,
    idempotencyKey: context.idempotencyKey || idempotencyKey('SALE', order, 'AR-SALE')
  });
  await recordPostingAudit('POST_AR_SALE', order, result, context);
  return result;
}

async function postReceipt(receipt, context = {}) {
  if (typeof legacyPostingEngine.postReceiptAR === 'function') {
    const result = await legacyPostingEngine.postReceiptAR(receipt, {
      ...context,
      idempotencyKey: context.idempotencyKey || idempotencyKey('RECEIPT', receipt, 'AR-RECEIPT')
    });
    await recordPostingAudit('POST_AR_RECEIPT', receipt, result, context);
    return result;
  }
  throw new Error('postReceipt chưa được nối vào Posting Engine legacy');
}

async function postReturn(returnOrder, context = {}) {
  const result = await legacyPostingEngine.postReturnOrderAR(returnOrder, {
    ...context,
    idempotencyKey: context.idempotencyKey || idempotencyKey('RETURN', returnOrder, 'AR-RETURN')
  });
  await recordPostingAudit('POST_AR_RETURN', returnOrder, result, context);
  return result;
}

async function postCancelOrder(order, context = {}) {
  const result = await legacyPostingEngine.reverseSalesOrderAR(order, {
    ...context,
    idempotencyKey: context.idempotencyKey || idempotencyKey('SALE', order, 'AR-SALE-REVERSAL')
  });
  await recordPostingAudit('POST_AR_SALE_REVERSAL', order, result, context);
  return result;
}

async function postInventoryMovement(movement = {}, context = {}) {
  const document = movement.document || movement.sourceDocument || {
    id: movement.sourceId || movement.refId || movement.id,
    code: movement.sourceCode || movement.refCode || movement.code,
    date: movement.date,
    items: [{
      productId: movement.productId,
      productCode: movement.productCode,
      productName: movement.productName,
      qty: Math.abs(Number(movement.qty ?? movement.quantity ?? 0)),
      warehouseId: movement.warehouseId,
      warehouseCode: movement.warehouseCode
    }]
  };
  const normalizedMovement = {
    ...movement,
    refId: movement.refId || movement.sourceId || document.id,
    refCode: movement.refCode || movement.sourceCode || document.code,
    sourceId: movement.sourceId || movement.refId || document.id,
    sourceCode: movement.sourceCode || movement.refCode || document.code,
    type: movement.type || movement.entryType || 'INVENTORY',
    direction: movement.direction
  };
  const result = await inventoryService.postStockMovement(document, normalizedMovement, context);
  await recordPostingAudit('POST_INVENTORY_MOVEMENT', normalizedMovement, result?.[0] || result, context);
  return result;
}

function postInventorySale(order, context = {}) {
  return inventoryService.postStockMovement(order, {
    type: 'SALE',
    direction: 'OUT',
    sourceType: 'SALE_ORDER',
    refId: order.id || order._id,
    refCode: order.code || order.orderCode
  }, context);
}

function postInventoryReturn(returnOrder, context = {}) {
  return inventoryService.postStockMovement(returnOrder, {
    type: 'RETURN',
    direction: 'IN',
    sourceType: 'RETURN_ORDER',
    refId: returnOrder.id || returnOrder._id,
    refCode: returnOrder.code || returnOrder.returnOrderCode
  }, context);
}

function postInventoryImport(importDoc, context = {}) {
  return inventoryService.postStockMovement(importDoc, {
    type: 'IMPORT',
    direction: 'IN',
    sourceType: 'IMPORT',
    refId: importDoc.id || importDoc._id,
    refCode: importDoc.code || importDoc.importCode
  }, context);
}

function postInventoryAdjustment(adjustment, context = {}) {
  return postInventoryMovement({
    ...adjustment,
    type: adjustment.type || 'ADJUSTMENT',
    direction: adjustment.direction || (Number(adjustment.qty ?? adjustment.quantity ?? 0) >= 0 ? 'IN' : 'OUT'),
    sourceType: adjustment.sourceType || 'INVENTORY_ADJUSTMENT',
    sourceId: adjustment.sourceId || adjustment.id || adjustment._id,
    sourceCode: adjustment.sourceCode || adjustment.code
  }, context);
}

async function postFundReceipt(receipt, context = {}) {
  const input = {
    ...receipt,
    sourceType: receipt.sourceType || 'RECEIPT',
    sourceId: receipt.sourceId || receipt.id || receipt._id || receipt.code,
    sourceCode: receipt.sourceCode || receipt.code || receipt.id,
    entryType: receipt.entryType || 'RECEIPT',
    direction: receipt.direction || 'IN',
    amount: receipt.amount ?? receipt.totalAmount ?? receipt.cashAmount ?? receipt.bankAmount,
    idempotencyKey: receipt.idempotencyKey || context.idempotencyKey || fundIdempotencyKey(receipt, 'RECEIPT', receipt.direction || 'IN', receipt.account || receipt.fundType || '')
  };
  const result = await fundService.postFundLedger(input, context);
  await recordPostingAudit('POST_FUND_LEDGER', input, result?.ledger || result, context);
  return result;
}

function postExpense(expense, context = {}) {
  return fundService.postFundLedger({
    ...expense,
    sourceType: expense.sourceType || 'EXPENSE',
    sourceId: expense.sourceId || expense.id || expense._id || expense.code,
    sourceCode: expense.sourceCode || expense.code || expense.id,
    entryType: expense.entryType || 'EXPENSE',
    direction: 'OUT',
    idempotencyKey: expense.idempotencyKey || context.idempotencyKey || fundIdempotencyKey(expense, 'EXPENSE', 'OUT', expense.account || expense.fundType || '')
  }, context);
}

async function postFundTransfer(transfer, context = {}) {
  if (typeof fundService.confirmFundTransfer === 'function' && !context.skipConfirmFundTransfer) {
    return fundService.confirmFundTransfer(transfer.id || transfer._id || transfer.code, context);
  }
  if (typeof legacyPostingEngine.postFundTransfer === 'function') {
    return legacyPostingEngine.postFundTransfer(transfer, {
      ...context,
      idempotencyKey: context.idempotencyKey || idempotencyKey('FUND_TRANSFER', transfer, 'FUND-TRANSFER')
    });
  }
  throw new Error('postFundTransfer chưa được nối vào Posting Engine legacy');
}

async function postBulkInventoryMovements(movements = [], context = {}) {
  const results = [];
  for (const movement of movements) {
    results.push(await postInventoryMovement(movement, context));
  }
  return results;
}

async function postBulkSalesAR(orders = [], context = {}) {
  const results = [];
  for (const order of orders) {
    results.push(await postSale(order, context));
  }
  return results;
}

module.exports = {
  idempotencyKey,
  fundIdempotencyKey,
  postSale,
  postReceipt,
  postReturn,
  postCancelOrder,
  postInventoryMovement,
  postInventorySale,
  postInventoryReturn,
  postInventoryImport,
  postInventoryAdjustment,
  postBulkInventoryMovements,
  postBulkSalesAR,
  postFundReceipt,
  postExpense,
  postFundTransfer,
  recordPostingAudit,
  legacyPostingEngine
};
