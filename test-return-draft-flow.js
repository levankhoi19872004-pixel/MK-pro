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
const masterOrderRepository = require('./src/repositories/masterOrderRepository');
const MongoStore = require('./src/models');
const inventoryService = require('./src/services/inventoryService');
const postingEngine = require('./src/engines/posting.engine');
const auditService = require('./src/services/auditService');
const tx = require('./src/utils/transaction.util');

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
  const masters = [];
  const restores = [];

  restores.push(patch(mongoose, { startSession: async () => ({ async withTransaction(fn) { return fn(); }, async endSession() {} }) }));
  restores.push(patch(tx, { withMongoTransaction: async (fn) => fn({ fake: true }) }));
  restores.push(patch(inventoryService, { postStockMovement: async () => {}, reverseStockMovement: async () => {} }));
  restores.push(patch(postingEngine, { postSalesOrderAR: async () => {}, reverseSalesOrderAR: async () => {} }));
  restores.push(patch(auditService, { log: async () => null }));
  restores.push(patch(productRepository, { findAll: async () => [{ code: 'P001', name: 'OMO', salePrice: 10000, unit: 'chai' }], findByCodes: async (codes = []) => (codes.includes('P001') ? [{ code: 'P001', name: 'OMO', salePrice: 10000, unit: 'chai' }] : []), findByIdOrCode: async () => ({ code: 'P001', name: 'OMO', salePrice: 10000, unit: 'chai' }), save: async (row) => row }));
  restores.push(patch(customerRepository, { findByIdOrCode: async () => ({ id: 'C001', code: 'C001', name: 'Khách A', currentDebt: 0 }), save: async (row) => row }));
  restores.push(patch(userRepository, {
    findStaffByIdOrCode: async (key) => ({
      id: key,
      code: key,
      staffCode: key,
      name: key === 'GH01' ? 'NV giao' : 'NV bán'
    }),

    // Test phải mock đúng helper mới đang được masterOrderLegacy.service.js sử dụng.
    // Không để unit test gọi thật User.findOne() vào MongoDB.
    findBusinessStaffByCode: async (key) => ({
      id: key,
      code: key,
      staffCode: key,
      name: key === 'GH01' ? 'NV giao' : 'NV bán'
    })
  }));
  restores.push(patch(orderRepository, {
    findAll: async () => orders,
    findByIdOrCode: async (key) => orders.find((row) => row.id === key || row.code === key) || null,
    findManyByIdentity: async (keys = []) => orders.filter((row) => keys.includes(row.id) || keys.includes(row.code)),
    upsert: async (row) => {
      const idx = orders.findIndex((x) => x.id === row.id || x.code === row.code);
      if (idx >= 0) orders[idx] = { ...row };
      else orders.push({ ...row });
      return row;
    }
  }));
  restores.push(patch(returnOrderRepository, {
    findAll: async () => returns,
    findByIdOrCode: async (key) => returns.find((row) => row.id === key || row.code === key) || null,
    upsert: async (row) => {
      const idx = returns.findIndex((x) => x.id === row.id || x.code === row.code || x.salesOrderId === row.salesOrderId || x.salesOrderCode === row.salesOrderCode);
      if (idx >= 0) returns[idx] = { ...row };
      else returns.push({ ...row });
      return row;
    }
  }));
  restores.push(patch(masterOrderRepository, {
    findAll: async () => masters,
    findByIdOrCode: async (key) => masters.find((row) => row.id === key || row.code === key) || null,
    upsert: async (row) => {
      const idx = masters.findIndex((x) => x.id === row.id || x.code === row.code);
      if (idx >= 0) masters[idx] = { ...row };
      else masters.push({ ...row });
      return row;
    }
  }));
  restores.push(patch(MongoStore.salesOrders, { bulkWrite: async (ops = []) => {
    for (const op of ops) {
      const filter = op.updateOne?.filter?.$or || [];
      const patch = op.updateOne?.update?.$set || {};
      const unset = op.updateOne?.update?.$unset || {};
      for (const order of orders) {
        if (filter.some((cond) => Object.entries(cond).some(([k, v]) => v && order[k] === v))) {
          Object.assign(order, patch);
          Object.keys(unset).forEach((key) => delete order[key]);
        }
      }
    }
    return { modifiedCount: ops.length };
  } }));
  restores.push(patch(MongoStore.returnOrders, { updateMany: async (filter = {}, update = {}) => {
    const patch = update.$set || {};
    const unset = update.$unset || {};
    for (const row of returns) {
      Object.assign(row, patch);
      Object.keys(unset).forEach((key) => delete row[key]);
    }
    return { modifiedCount: returns.length };
  } }));

  try {
    const created = await orderService.createOrder({ customerCode: 'C001', staffCode: 'S001', items: [{ productCode: 'P001', quantity: 10, price: 10000 }] });
    assert.equal(returns.length, 0, 'tạo đơn con không ghi returnOrder draft rỗng theo cơ chế lazy');

    await returnOrderService.updateReturnDraftItemsBySalesOrder(created.salesOrder.id, { items: [{ productCode: 'P001', unit: 'chai', price: 10000, returnQty: 0 }] });
    assert.equal(returns.length, 0, 'lưu returnQty=0 không tạo returnOrder rỗng');

    
    await orderService.updateOrder(created.salesOrder.id, { items: [{ productCode: 'P001', quantity: 12, price: 10000 }] });
    assert.equal(returns.length, 0, 'sửa đơn con không tạo returnOrder rỗng');
    assert.equal(returns.length, 0, 'sửa đơn con vẫn không tạo returnOrder rỗng');

    await returnOrderService.updateReturnDraftItemsBySalesOrder(created.salesOrder.id, { items: [{ productCode: 'P001', unit: 'chai', price: 10000, returnQty: 2 }] });
    assert.equal(returns[0].status, 'waiting_receive');
    assert.equal(returns[0].totalReturnAmount, 20000);

    const tooMuch = await returnOrderService.updateReturnDraftItemsBySalesOrder(created.salesOrder.id, { items: [{ productCode: 'P001', unit: 'chai', price: 10000, returnQty: 20 }] }).catch((err) => ({ error: err.message }));
    assert.match(tooMuch.error, /không được lớn hơn số lượng (bán|giao)/);

    // Chuẩn mới: phiếu waiting_receive chưa nhập kho chưa khóa hủy đơn; chỉ phiếu đã nhận kho/ghi sổ mới khóa.

    await returnOrderService.updateReturnDraftItemsBySalesOrder(created.salesOrder.id, { items: [{ productCode: 'P001', unit: 'chai', price: 10000, returnQty: 0 }] });
    assert.equal(returns[0].status, 'cleared', 'trả về 0 thì clear phiếu trả và không còn tiền trả');
    assert.equal(returns[0].totalReturnAmount, 0);
    assert.equal(returns[0].items.length, 0);

    const masterService = require('./src/services/masterOrderService');
    const master = await masterService.createMasterOrder({ childOrderIds: [created.salesOrder.id], deliveryStaffCode: 'GH01', deliveryDate: '2026-06-02' });
    assert.ok(master.masterOrder.id, 'tạo đơn tổng thành công');
    assert.equal(returns[0].masterOrderId, master.masterOrder.id, 'gộp đơn tổng chỉ gắn masterOrderId vào returnOrder');
    assert.equal(returns[0].deliveryStaffCode, 'GH01');

    await masterService.cancelMasterOrder(master.masterOrder.id, { reason: 'test' });
    assert.equal(returns[0].masterOrderId || '', '', 'hủy đơn tổng phải gỡ masterOrderId khỏi returnOrder');
    assert.equal(returns[0].status, 'cleared', 'hủy đơn tổng không hủy returnOrder đã clear');

    console.log('RETURN_DRAFT_FLOW_TEST_OK');
  } finally {
    while (restores.length) restores.pop()();
  }
})();
