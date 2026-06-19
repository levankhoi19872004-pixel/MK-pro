'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const Customer = require('../src/models/Customer');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const SalesOrder = require('../src/models/SalesOrder');
const importRules = require('../src/rules/importRules');

function read(relativePath) {
  return require('./helpers/sourceBundle.util').readSource(path.join(__dirname, '..', relativePath));
}

function query(rows) {
  return {
    select() { return this; },
    session() { return this; },
    lean() { return Promise.resolve(rows); }
  };
}

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

function baseOrder(overrides = {}) {
  return {
    documentCode: 'DMS-NEW-001',
    customerCode: 'KH-NEW-001',
    customerName: 'Cửa hàng mới',
    salesStaffCode: 'NV01',
    lineDetails: [{ productCode: 'SP01', saleQuantity: 1, requestedQuantity: 1 }],
    errors: [],
    warnings: [],
    valid: true,
    ...overrides
  };
}

async function withValidationModels(work) {
  const restores = [
    patch(Customer, { find: () => query([]) }),
    patch(Product, { find: () => query([{ _id: 'p1', code: 'SP01', name: 'Sản phẩm 1', isActive: true }]) }),
    patch(User, { find: () => query([{ _id: 'u1', staffCode: 'NV01', fullName: 'Nhân viên 1', role: 'sales', isActive: true }]) }),
    patch(SalesOrder, { find: () => query([]) })
  ];
  try {
    await work();
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
}

test('preview validation accepts a new customer when code and name are present', async () => {
  await withValidationModels(async () => {
    const [row] = await importRules.validateImportBatch([baseOrder()]);
    assert.equal(row.valid, true);
    assert.equal(row.canImport, true);
    assert.equal(row.customerAutoCreate, true);
    assert.equal(row.customerCode, 'KH-NEW-001');
    assert.equal(row.customerName, 'Cửa hàng mới');
    assert.equal(row.customerAddress, 'NEW');
    assert.match((row.warnings || []).join(' | '), /sẽ được tự tạo với địa chỉ NEW/);
  });
});

test('new customer without a store name remains blocked', async () => {
  await withValidationModels(async () => {
    const [row] = await importRules.validateImportBatch([baseOrder({ customerName: '' })]);
    assert.equal(row.valid, false);
    assert.equal(row.canImport, false);
    assert.match((row.errors || []).join(' | '), /thiếu tên cửa hàng/);
  });
});

test('inactive customer is blocked and is never re-created as a new customer', async () => {
  const restores = [
    patch(Customer, { find: () => query([{ _id: 'c1', code: 'KH-NEW-001', name: 'Khách cũ', isActive: false }]) }),
    patch(Product, { find: () => query([{ _id: 'p1', code: 'SP01', name: 'Sản phẩm 1', isActive: true }]) }),
    patch(User, { find: () => query([{ _id: 'u1', staffCode: 'NV01', fullName: 'Nhân viên 1', role: 'sales', isActive: true }]) }),
    patch(SalesOrder, { find: () => query([]) })
  ];
  try {
    const [row] = await importRules.validateImportBatch([baseOrder()]);
    assert.equal(row.valid, false);
    assert.equal(row.customerAutoCreate, false);
    assert.match((row.errors || []).join(' | '), /đang ngừng hoạt động/);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test('same new customer code with conflicting names is blocked for every order', async () => {
  await withValidationModels(async () => {
    const rows = await importRules.validateImportBatch([
      baseOrder({ documentCode: 'DMS-NEW-001', customerName: 'Cửa hàng A' }),
      baseOrder({ documentCode: 'DMS-NEW-002', customerName: 'Cửa hàng B' })
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows.every((row) => row.valid === false && row.canImport === false), true);
    assert.equal(rows.every((row) => (row.errors || []).some((message) => /nhiều tên khác nhau/.test(message))), true);
  });
});

test('sales import creates a missing customer inside the same order transaction', () => {
  const service = read('src/services/excelImportService.js');
  assert.match(service, /const AUTO_CREATED_CUSTOMER_ADDRESS = 'NEW'/);
  assert.match(service, /async function ensureImportedCustomersForOrderChunk/);
  assert.match(service, /Customer\.create\(\[payload\], session \? \{ session \} : undefined\)/);
  assert.match(service, /address:\s*AUTO_CREATED_CUSTOMER_ADDRESS/);
  assert.match(service, /needsProfileUpdate:\s*true/);
  assert.match(
    service,
    /async \(chunk, \{ session \}\) => \{[\s\S]*?ensureImportedCustomersForOrderChunk\(chunk,[\s\S]*?SalesOrder\.insertMany\(/
  );
  assert.match(service, /createdCustomers/);
});

test('sales-order preview marks a missing catalog customer as auto-created instead of generic not-found', () => {
  const service = read('src/services/excelImportService.js');
  const start = service.indexOf("} else if (type === 'salesOrders') {");
  const end = service.indexOf("} else if (type === 'promotionProductRules') {", start);
  assert.ok(start >= 0 && end > start, 'salesOrders preview branch not found');
  const branch = service.slice(start, end);
  assert.match(branch, /collectImportedCustomerCandidates/);
  assert.match(branch, /buildImportedCustomerPlaceholder/);
  assert.match(branch, /customerAutoCreate/);
  assert.match(branch, /Hợp lệ - tạo KH mới/);
  assert.doesNotMatch(branch, /if \(!customer\) errors\.push\('Không tìm thấy khách hàng'\)/);
});
