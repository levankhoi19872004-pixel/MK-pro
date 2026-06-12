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

async function reverseMovement(document = {}, movement = {}, options = {}) {
  return inventoryService.reverseStockMovement(document, movement, options);
}

async function reconcileInventory(options = {}) {
  return inventoryService.rebuildCurrentInventoryFromTransactions(options);
}

module.exports = {
  postImportIn,
  postSaleOut,
  postReturnIn,
  reverseMovement,
  reconcileInventory
};
