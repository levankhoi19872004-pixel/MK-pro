'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const orderRepository = require('../src/repositories/orderRepository');
const productRepository = require('../src/repositories/productRepository');
const customerRepository = require('../src/repositories/customerRepository');
const userRepository = require('../src/repositories/userRepository');
const returnOrderRepository = require('../src/repositories/returnOrderRepository');
const inventoryService = require('../src/services/inventoryService');
const postingEngine = require('../src/engines/posting.engine');
const orderService = require('../src/services/orderService');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(originals)) target[key] = value;
  };
}

function fakeSession() {
  return {
    async withTransaction(work) { return work(); },
    async endSession() {}
  };
}

test('SalesOrder flow creates pending order and posts stock immediately without posting AR before accounting confirmation', async () => {
  const savedOrders = [];
  const product = { code: 'P001', name: 'OMO', salePrice: 10000, availableStock: 20 };
  const customer = { code: 'C001', name: 'Cửa hàng A', currentDebt: 50000 };
  let productSaveSession = null;
  let customerSaveSession = null;

  const restoreMongoose = patch(mongoose, { startSession: async () => fakeSession() });
  const restoreOrderRepo = patch(orderRepository, {
    findAll: async () => savedOrders,
    findByIdOrCode: async (id) => savedOrders.find((row) => row.id === id || row.code === id) || null,
    upsert: async (order, options = {}) => {
      assert.ok(options.session, 'order upsert must receive transaction session');
      savedOrders.push({ ...order });
      return order;
    }
  });
  const restoreProductRepo = patch(productRepository, {
    findAll: async () => [product],
    findByCodes: async (codes = []) => (codes.includes('P001') ? [product] : []),
    findByIdOrCode: async (code) => (code === 'P001' ? product : null),
    save: async (doc, options = {}) => {
      productSaveSession = options.session;
      return doc;
    }
  });
  const restoreCustomerRepo = patch(customerRepository, {
    findByIdOrCode: async (code) => (code === 'C001' ? customer : null),
    save: async (doc, options = {}) => {
      customerSaveSession = options.session;
      return doc;
    }
  });
  const restoreUserRepo = patch(userRepository, {
    findStaffByIdOrCode: async () => ({ id: 'S001', code: 'S001', name: 'NV bán hàng' })
  });
  const returnDrafts = [];
  const restoreReturnOrderRepo = patch(returnOrderRepository, {
    findAll: async () => returnDrafts,
    findByIdOrCode: async () => null,
    upsert: async (row) => { returnDrafts.push({ ...row }); return row; }
  });
  const restoreInventoryService = patch(inventoryService, {
    postStockMovement: async (doc, movement, options = {}) => {
      product.availableStock -= 2;
      product.stockQuantity = product.availableStock;
      await productRepository.save(product, options);
      return [];
    }
  });
  const restorePostingEngine = patch(postingEngine, {
    postSalesOrderAR: async () => null,
    reverseSalesOrderAR: async () => null
  });

  try {
    const result = await orderService.createOrder({
      customerCode: 'C001',
      staffCode: 'S001',
      paidAmount: 5000,
      items: [{ productCode: 'P001', quantity: 2, price: 10000 }]
    });

    assert.match(result.salesOrder.code, /^SO\d+$/);
    assert.equal(result.salesOrder.totalAmount, 20000);
    assert.equal(result.salesOrder.debtAmount, 15000);
    assert.equal(product.availableStock, 18);
    assert.equal(product.stockQuantity || product.availableStock, 18);
    assert.equal(result.salesOrder.stockPosted, true);
    assert.equal(customer.currentDebt, 50000);
    assert.ok(productSaveSession, 'create order must post stock immediately inside transaction');
    assert.equal(customerSaveSession, null, 'pending order must not post AR debt before accounting confirmation');
  } finally {
    restorePostingEngine();
    restoreInventoryService();
    restoreReturnOrderRepo();
    restoreUserRepo();
    restoreCustomerRepo();
    restoreProductRepo();
    restoreOrderRepo();
    restoreMongoose();
  }
});

test('SalesOrder cancel reverses stock and customer debt impact', async () => {
  const order = {
    id: 'SO-X',
    code: 'SO00009',
    customerCode: 'C001',
    items: [{ productCode: 'P001', quantity: 3, price: 10000, amount: 30000 }],
    totalAmount: 30000,
    paidAmount: 10000,
    debtAmount: 20000,
    status: 'posted',
    stockPosted: true
  };
  const product = { code: 'P001', availableStock: 7 };
  const customer = { code: 'C001', currentDebt: 90000 };

  const restoreMongoose = patch(mongoose, { startSession: async () => fakeSession() });
  const restoreOrderRepo = patch(orderRepository, {
    findByIdOrCode: async () => order,
    upsert: async (updated, options = {}) => {
      assert.ok(options.session, 'cancel upsert must receive transaction session');
      Object.assign(order, updated);
      return order;
    }
  });
  const restoreProductRepo = patch(productRepository, {
    findByIdOrCode: async () => product,
    save: async (doc) => doc
  });
  const restoreCustomerRepo = patch(customerRepository, {
    findByIdOrCode: async () => customer,
    save: async (doc) => doc
  });
  const restoreReturnOrderRepo = patch(returnOrderRepository, {
    findAll: async () => [],
    findByIdOrCode: async () => null,
    upsert: async (row) => row
  });
  const restoreInventoryService = patch(inventoryService, {
    reverseStockMovement: async () => { product.availableStock += 3; return []; }
  });
  const restorePostingEngine = patch(postingEngine, {
    postSalesOrderAR: async () => null,
    reverseSalesOrderAR: async () => null
  });

  try {
    const result = await orderService.cancelOrder('SO00009', { reason: 'test' });
    assert.equal(result.salesOrder.status, 'cancelled');
    assert.equal(product.availableStock, 10);
    assert.equal(customer.currentDebt, 90000, 'cancel order must not mutate customer debt cache directly; AR reversal is canonical');
  } finally {
    restorePostingEngine();
    restoreInventoryService();
    restoreReturnOrderRepo();
    restoreCustomerRepo();
    restoreProductRepo();
    restoreOrderRepo();
    restoreMongoose();
  }
});
