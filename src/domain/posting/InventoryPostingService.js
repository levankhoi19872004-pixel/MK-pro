'use strict';

const inventoryService = require('../../services/inventoryService');

async function postImportIn(importOrder = {}, options = {}) {
  return inventoryService.postStockMovement(importOrder, {
    type: 'IMPORT',
    direction: 'IN',
    refType: 'IMPORT_ORDER',
    refId: importOrder.id || importOrder.code,
    refCode: importOrder.code || importOrder.id,
    date: importOrder.date || importOrder.documentDate,
    note: 'Nhập kho'
  }, options);
}

async function postSaleOut(order = {}, options = {}) {
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
  return inventoryService.rebuildSnapshotsFromTransactions(options);
}

module.exports = {
  postImportIn,
  postSaleOut,
  postReturnIn,
  reverseMovement,
  reconcileInventory
};
