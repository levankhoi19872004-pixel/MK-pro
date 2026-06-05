'use strict';

const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const orderService = require('./src/services/orderService');
const returnOrderService = require('./src/services/returnOrderService');
const orderRepository = require('./src/repositories/orderRepository');
const returnOrderRepository = require('./src/repositories/returnOrderRepository');
const productRepository = require('./src/repositories/productRepository');
const customerRepository = require('./src/repositories/customerRepository');
const userRepository = require('./src/repositories/userRepository');
const inventoryService = require('./src/services/inventoryService');
const postingEngine = require('./src/engines/posting.engine');
const tx = require('./src/utils/transaction.util');
const auditService = require('./src/services/auditService');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => Object.assign(target, originals);
}

(async () => {
  const orders = [];
  const returns = [];
  const restores = [];

  restores.push(patch(mongoose, { startSession: async () => ({ async withTransaction(fn) { return fn(); }, async endSession() {} }) }));
  restores.push(patch(tx, { withMongoTransaction: async (fn) => fn({ fake: true }) }));
  restores.push(patch(auditService, { log: async () => null }));
  restores.push(patch(inventoryService, { postStockMovement: async () => {}, reverseStockMovement: async () => {} }));
  restores.push(patch(postingEngine, { postSalesOrderAR: async () => {}, reverseSalesOrderAR: async () => {} }));
  restores.push(patch(productRepository, {
    findAll: async () => [{ code: 'P001', name: 'OMO', salePrice: 10000, unit: 'chai' }],
    findByCodes: async () => [{ code: 'P001', name: 'OMO', salePrice: 10000, unit: 'chai' }],
    findByIdOrCode: async () => ({ code: 'P001', name: 'OMO', salePrice: 10000, unit: 'chai' }),
    save: async (row) => row
  }));
  restores.push(patch(customerRepository, { findByIdOrCode: async () => ({ id: 'C001', code: 'C001', name: 'Khách A', currentDebt: 0 }), save: async (row) => row }));
  restores.push(patch(userRepository, { findStaffByIdOrCode: async (key) => ({ id: key, code: key, name: key === 'GH01' ? 'NV giao' : 'NV bán' }) }));
  restores.push(patch(orderRepository, {
    findAll: async () => orders,
    findByIdOrCode: async (key) => orders.find((row) => row.id === key || row.code === key) || null,
    findManyByIdentity: async (keys = []) => orders.filter((row) => keys.includes(row.id) || keys.includes(row.code)),
    upsert: async (row) => {
      const idx = orders.findIndex((x) => x.id === row.id || x.code === row.code);
      if (idx >= 0) orders[idx] = { ...orders[idx], ...row };
      else orders.push({ ...row });
      return row;
    }
  }));
  restores.push(patch(returnOrderRepository, {
    findAll: async () => returns,
    findByIdOrCode: async (key) => returns.find((row) => row.id === key || row.code === key) || null,
    upsert: async (row) => {
      const idx = returns.findIndex((x) => x.id === row.id || x.code === row.code || x.salesOrderId === row.salesOrderId || x.salesOrderCode === row.salesOrderCode);
      if (idx >= 0) returns[idx] = { ...returns[idx], ...row };
      else returns.push({ ...row });
      return row;
    }
  }));

  try {
    const created = await orderService.createOrder({ customerCode: 'C001', staffCode: 'S001', items: [{ productCode: 'P001', quantity: 10, price: 10000 }] });
    assert.equal(returns.length, 0, 'tạo đơn con không được sinh returnOrder draft rỗng');

    await orderService.updateOrder(created.salesOrder.id, { items: [{ productCode: 'P001', quantity: 12, price: 10000 }] });
    assert.equal(returns.length, 0, 'sửa đơn con không tạo returnOrder khi chưa có số lượng trả');

    await returnOrderService.updateReturnDraftItemsBySalesOrder(created.salesOrder.id, { items: [{ productCode: 'P001', unit: 'chai', price: 10000, returnQty: 2 }] });
    assert.equal(returns.length, 1, 'chỉ tạo returnOrder khi returnQty > 0');
    assert.equal(returns[0].status, 'waiting_receive');
    assert.equal(returns[0].totalReturnAmount, 20000);

    const tooMuch = await returnOrderService.updateReturnDraftItemsBySalesOrder(created.salesOrder.id, { items: [{ productCode: 'P001', unit: 'chai', price: 10000, returnQty: 20 }] }).catch((err) => ({ error: err.message }));
    assert.match(tooMuch.error, /không được lớn hơn số lượng/);

    await returnOrderService.updateReturnDraftItemsBySalesOrder(created.salesOrder.id, { items: [{ productCode: 'P001', unit: 'chai', price: 10000, returnQty: 0 }] });
    assert.equal(returns[0].status, 'cleared', 'trả về 0 thì clear returnOrder, không xóa đơn gốc');
    assert.equal(returns[0].totalReturnAmount, 0);

    console.log('RETURN_DRAFT_FLOW_TEST_OK');
  } finally {
    while (restores.length) restores.pop()();
  }
})();
