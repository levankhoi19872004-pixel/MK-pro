'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function queryResult(rows, tracker, name) {
  return {
    select() { tracker[`${name}Select`] = (tracker[`${name}Select`] || 0) + 1; return this; },
    sort() { tracker[`${name}Sort`] = (tracker[`${name}Sort`] || 0) + 1; return this; },
    limit() { tracker[`${name}Limit`] = (tracker[`${name}Limit`] || 0) + 1; return this; },
    async lean() { return rows; }
  };
}

function loadWithStubs({ orders, returns, customers, products }) {
  const tracker = { orderFind: 0, returnFind: 0, customerFind: 0, productFind: 0, writes: 0, filters: {} };
  const stubs = {
    '../models/SalesOrder': {
      find(filter) { tracker.orderFind += 1; tracker.filters.orders = filter; return queryResult(orders, tracker, 'order'); },
      create() { tracker.writes += 1; throw new Error('write forbidden'); }
    },
    '../models/ReturnOrder': {
      find(filter) { tracker.returnFind += 1; tracker.filters.returns = filter; return queryResult(returns, tracker, 'return'); },
      create() { tracker.writes += 1; throw new Error('write forbidden'); }
    },
    '../models/Customer': {
      find(filter) { tracker.customerFind += 1; tracker.filters.customers = filter; return queryResult(customers, tracker, 'customer'); },
      create() { tracker.writes += 1; throw new Error('write forbidden'); }
    },
    '../models/Product': {
      find(filter) { tracker.productFind += 1; tracker.filters.products = filter; return queryResult(products, tracker, 'product'); },
      create() { tracker.writes += 1; throw new Error('write forbidden'); }
    }
  };

  const originalLoad = Module._load;
  const servicePath = require.resolve('../src/services/sseInvoiceExport.service');
  const queryServicePath = require.resolve('../src/services/invoiceExportQuery.service');
  delete require.cache[servicePath];
  delete require.cache[queryServicePath];
  Module._load = function(request, parent, isMain) {
    if (stubs[request]) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  let service;
  try { service = require(servicePath); }
  finally { Module._load = originalLoad; }
  return { service, tracker };
}

const validOrder = {
  id: 'SO-I-1', code: 'INV-001', orderDate: '2026-05-10', customerCode: 'KH001', customerName: 'Khách I',
  vatInvoiceRequired: true, status: 'delivered', tenantId: 'tenant-a',
  items: [{ lineKey: 'L1', productCode: 'SP001', productName: 'Sản phẩm I', quantity: 2, priceAfterPromotion: 10800, baseUnit: 'Gói' }]
};
const validCustomers = [{ code: 'KH001', name: 'Khách I', sseCustomerCode: '000001' }];
const validProducts = [{ code: 'SP001', name: 'Sản phẩm I', baseUnit: 'Gói', sseProductCode: '000002' }];

test('integration: SSE export performs one batched read per collection and zero writes', async () => {
  const oldTenantMode = process.env.TENANT_MODE;
  process.env.TENANT_MODE = 'multi';
  const { service, tracker } = loadWithStubs({ orders: [validOrder], returns: [], customers: validCustomers, products: validProducts });
  try {
    const result = await service.buildSseInvoiceWorkbook({ invoiceType: 'VAT', dateFrom: '2026-05-01', dateTo: '2026-05-31' }, { tenantId: 'tenant-a' });
    assert.ok(Buffer.isBuffer(result.buffer));
    assert.equal(result.rows, 1);
    assert.deepEqual({ orderFind:tracker.orderFind, returnFind:tracker.returnFind, customerFind:tracker.customerFind, productFind:tracker.productFind }, { orderFind:1, returnFind:1, customerFind:1, productFind:1 });
    assert.equal(tracker.writes, 0);
    assert.match(JSON.stringify(tracker.filters.orders), /tenant-a/);
    assert.match(JSON.stringify(tracker.filters.customers), /KH001/);
    assert.match(JSON.stringify(tracker.filters.products), /SP001/);
  } finally {
    if (oldTenantMode === undefined) delete process.env.TENANT_MODE; else process.env.TENANT_MODE = oldTenantMode;
  }
});

test('integration: invalid invoiceType is rejected before any database read', async () => {
  const { service, tracker } = loadWithStubs({ orders: [], returns: [], customers: [], products: [] });
  const result = await service.buildSseInvoiceWorkbook({ invoiceType: '{$ne:null}' }, {});
  assert.equal(result.status, 400);
  assert.equal(result.code, 'INVALID_INVOICE_TYPE');
  assert.equal(tracker.orderFind + tracker.returnFind + tracker.customerFind + tracker.productFind, 0);
});

test('integration: mapping errors return 422 and a separate error-report URL, never a fake XLSX', async () => {
  const { service, tracker } = loadWithStubs({ orders: [validOrder], returns: [], customers: [{ code:'KH001', name:'Khách I' }], products: [{ code:'SP001', name:'Sản phẩm I', baseUnit:'Gói' }] });
  const oldCustomerFallback = process.env.SSE_ALLOW_CANONICAL_CUSTOMER_CODE_FALLBACK;
  const oldProductFallback = process.env.SSE_ALLOW_CANONICAL_PRODUCT_CODE_FALLBACK;
  process.env.SSE_ALLOW_CANONICAL_CUSTOMER_CODE_FALLBACK = 'false';
  process.env.SSE_ALLOW_CANONICAL_PRODUCT_CODE_FALLBACK = 'false';
  try {
    const result = await service.buildSseInvoiceWorkbook({ invoiceType:'VAT', dateFrom:'2026-05-01', dateTo:'2026-05-31' }, {});
    assert.equal(result.status, 422);
    assert.equal(result.code, 'SSE_MAPPING_INVALID');
    assert.equal(result.buffer, undefined);
    assert.match(result.errorReportUrl, /sse-invoice-errors\.xlsx/);
    assert.ok(result.totalErrors >= 2);
    assert.equal(tracker.writes, 0);
  } finally {
    if (oldCustomerFallback === undefined) delete process.env.SSE_ALLOW_CANONICAL_CUSTOMER_CODE_FALLBACK; else process.env.SSE_ALLOW_CANONICAL_CUSTOMER_CODE_FALLBACK = oldCustomerFallback;
    if (oldProductFallback === undefined) delete process.env.SSE_ALLOW_CANONICAL_PRODUCT_CODE_FALLBACK; else process.env.SSE_ALLOW_CANONICAL_PRODUCT_CODE_FALLBACK = oldProductFallback;
  }
});
