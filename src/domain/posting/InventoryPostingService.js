'use strict';

const inventoryService = require('../../services/inventoryService');

async function postImportIn(importOrder = {}, options = {}) {
  const movement = {
    type: 'IMPORT',
    direction: 'IN',
    refType: 'IMPORT_ORDER',
    refId: importOrder.id || importOrder.code,
    refCode: importOrder.code || importOrder.id,
    date: importOrder.date || importOrder.documentDate,
    note: 'Nhập kho'
  };

  if (inventoryService.postStockMovementBulkImportIn && options.disableBulkImportPosting !== true) {
    return inventoryService.postStockMovementBulkImportIn(importOrder, movement, options);
  }

  return inventoryService.postStockMovement(importOrder, movement, options);
}


async function postSalesOrdersBulkOut(orders = [], options = {}) {
  if (!options.session && options.allowUnsafeNoSession !== true) {
    const err = new Error('postSalesOrdersBulkOut cần chạy trong Mongo session để đảm bảo atomic inventory posting');
    err.code = 'INVENTORY_SESSION_REQUIRED';
    throw err;
  }

  if (inventoryService.postStockMovementBulkSalesOut && options.disableBulkSalesPosting !== true) {
    return inventoryService.postStockMovementBulkSalesOut(orders, options);
  }

  const transactions = [];
  for (const order of Array.isArray(orders) ? orders : []) {
    const rows = await postSaleOut(order, options);
    transactions.push(...(Array.isArray(rows) ? rows : []));
  }
  return transactions;
}

async function postSaleOut(order = {}, options = {}) {
  if (!options.session && options.allowUnsafeNoSession !== true) {
    const err = new Error('postSaleOut cần chạy trong Mongo session để đảm bảo atomic inventory posting');
    err.code = 'INVENTORY_SESSION_REQUIRED';
    throw err;
  }

  return inventoryService.postStockMovement(order, {
    type: 'SALE',
    direction: 'OUT',
    refType: 'SALES_ORDER',
    refId: order.id || order._id || order.code,
    refCode: order.code || order.id,
    date: order.date || order.orderDate || order.createdAt,
    note: 'Xuất kho theo đơn bán'
  }, options);
}


async function postSaleEditDelta(order = {}, items = [], direction = 'OUT', options = {}) {
  if (!options.session && options.allowUnsafeNoSession !== true) {
    const err = new Error('postSaleEditDelta cần chạy trong Mongo session để đảm bảo atomic inventory posting');
    err.code = 'INVENTORY_SESSION_REQUIRED';
    throw err;
  }

  const normalizedDirection = String(direction || '').toUpperCase() === 'IN' ? 'IN' : 'OUT';
  const commandId = String(options.commandId || options.idempotencyKey || Date.now()).trim();
  const orderIdentity = String(order.id || order._id || order.code || '').trim();
  const refId = `${orderIdentity}:EDIT:${commandId}:${normalizedDirection}`;

  return inventoryService.postStockMovement({
    ...order,
    id: refId,
    items: Array.isArray(items) ? items : []
  }, {
    type: normalizedDirection === 'IN' ? 'SALE_EDIT_IN' : 'SALE_EDIT_OUT',
    direction: normalizedDirection,
    refType: 'SALES_ORDER_EDIT',
    refId,
    refCode: order.code || order.id,
    date: order.date || order.orderDate || order.createdAt,
    note: normalizedDirection === 'IN'
      ? `Hoàn tồn do sửa đơn bán ${order.code || order.id || ''}`
      : `Trừ thêm tồn do sửa đơn bán ${order.code || order.id || ''}`
  }, options);
}

async function postReturnIn(returnOrder = {}, options = {}) {
  return inventoryService.postStockMovement(returnOrder, {
    type: 'RETURN',
    direction: 'IN',
    refType: 'RETURN_ORDER',
    refId: returnOrder.id || returnOrder.code,
    refCode: returnOrder.code || returnOrder.id,
    date: returnOrder.date || returnOrder.documentDate,
    note: 'Nhập lại kho theo phiếu trả hàng'
  }, options);
}


function requireSession(options = {}, operation = 'inventory posting') {
  if (!options.session && options.allowUnsafeNoSession !== true) {
    const err = new Error(`${operation} cần chạy trong Mongo session để đảm bảo atomic inventory posting`);
    err.code = 'INVENTORY_SESSION_REQUIRED';
    throw err;
  }
}

async function postPurchaseIn(receipt = {}, options = {}) {
  requireSession(options, 'postPurchaseIn');
  return inventoryService.postStockMovement(receipt, {
    type: 'PURCHASE',
    direction: 'IN',
    refType: 'GOODS_RECEIPT',
    refId: receipt.id || receipt.code,
    refCode: receipt.code || receipt.id,
    date: receipt.receiptDate || receipt.date || receipt.createdAt,
    note: `Nhập kho mua hàng ${receipt.code || ''}`.trim()
  }, options);
}

async function postPurchaseReturnOut(purchaseReturn = {}, options = {}) {
  requireSession(options, 'postPurchaseReturnOut');
  return inventoryService.postStockMovement(purchaseReturn, {
    type: 'PURCHASE_RETURN',
    direction: 'OUT',
    refType: 'PURCHASE_RETURN',
    refId: purchaseReturn.id || purchaseReturn.code,
    refCode: purchaseReturn.code || purchaseReturn.id,
    date: purchaseReturn.returnDate || purchaseReturn.date || purchaseReturn.createdAt,
    note: `Xuất trả nhà cung cấp ${purchaseReturn.code || ''}`.trim()
  }, options);
}

async function postAdjustment(document = {}, direction = 'IN', options = {}) {
  requireSession(options, 'postAdjustment');
  const normalizedDirection = String(direction || '').toUpperCase() === 'OUT' ? 'OUT' : 'IN';
  return inventoryService.postStockMovement(document, {
    type: normalizedDirection === 'IN' ? 'STOCK_ADJUSTMENT_IN' : 'STOCK_ADJUSTMENT_OUT',
    direction: normalizedDirection,
    refType: 'STOCK_COUNT',
    refId: document.id || document.code,
    refCode: document.code || document.id,
    date: document.countDate || document.date || document.createdAt,
    note: document.note || 'Điều chỉnh theo kiểm kê'
  }, options);
}

async function reverseMovement(document = {}, movement = {}, options = {}) {
  return inventoryService.reverseStockMovement(document, movement, options);
}

async function reconcileInventory(options = {}) {
  return inventoryService.rebuildCurrentInventoryFromTransactions(options);
}

module.exports = {
  postImportIn,
  postSaleOut,
  postSalesOrdersBulkOut,
  postSaleEditDelta,
  postReturnIn,
  postPurchaseIn,
  postPurchaseReturnOut,
  postAdjustment,
  reverseMovement,
  reconcileInventory
};
