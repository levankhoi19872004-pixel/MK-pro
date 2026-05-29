'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const orderRepository = require('../src/repositories/orderRepository');
const productRepository = require('../src/repositories/productRepository');
const customerRepository = require('../src/repositories/customerRepository');
const userRepository = require('../src/repositories/userRepository');
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

test('SalesOrder flow creates order, subtracts stock, and records customer debt in one transaction boundary', async () => {
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

  try {
    const result = await orderService.createOrder({
      customerCode: 'C001',
      staffCode: 'S001',
      paidAmount: 5000,
      items: [{ productCode: 'P001', quantity: 2, price: 10000 }]
    });

    assert.equal(result.salesOrder.code, 'SO00001');
    assert.equal(result.salesOrder.totalAmount, 20000);
    assert.equal(result.salesOrder.debtAmount, 15000);
    assert.equal(product.availableStock, 18);
    assert.equal(product.stockQuantity, 18);
    assert.equal(customer.currentDebt, 65000);
    assert.ok(productSaveSession, 'stock update must run inside transaction session');
    assert.ok(customerSaveSession, 'debt update must run inside transaction session');
  } finally {
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
    status: 'posted'
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

  try {
    const result = await orderService.cancelOrder('SO00009', { reason: 'test' });
    assert.equal(result.salesOrder.status, 'cancelled');
    assert.equal(product.availableStock, 10);
    assert.equal(customer.currentDebt, 70000);
  } finally {
    restoreCustomerRepo();
    restoreProductRepo();
    restoreOrderRepo();
    restoreMongoose();
  }
});
