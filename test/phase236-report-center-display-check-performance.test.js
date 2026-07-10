'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const ReportCenterService = require('../src/services/reports/ReportCenterService');
const Product = require('../src/models/Product');
const Customer = require('../src/models/Customer');
const DisplayCheckGroup = require('../src/models/displayCheckGroup.model');
const DisplayCheckPlan = require('../src/models/displayCheckPlan.model');
const Promotion = require('../src/models/Promotion');
const PromotionGroupItem = require('../src/models/PromotionGroupItem');
const dmsInventoryService = require('../src/services/dmsInventoryReconciliation.service');
const displayCheckService = require('../src/services/tools/displayCheck/displayCheck.service');

class Query {
  constructor(rows, tracker, name) {
    this.rows = rows;
    this.tracker = tracker;
    this.name = name;
    this.skipValue = 0;
    this.limitValue = null;
  }

  select(value) {
    this.tracker.selects.push({ name: this.name, value });
    return this;
  }

  sort(value) {
    this.tracker.sorts.push({ name: this.name, value });
    return this;
  }

  skip(value) {
    this.skipValue = Math.max(0, Number(value) || 0);
    this.tracker.skips.push({ name: this.name, value });
    return this;
  }

  limit(value) {
    this.limitValue = Math.max(0, Number(value) || 0);
    this.tracker.limits.push({ name: this.name, value });
    return this;
  }

  lean() {
    return this;
  }

  then(resolve, reject) {
    const end = this.limitValue ? this.skipValue + this.limitValue : undefined;
    const rows = this.rows.slice(this.skipValue, end);
    this.tracker.rowsReturned[this.name] = (this.tracker.rowsReturned[this.name] || 0) + rows.length;
    return Promise.resolve(rows).then(resolve, reject);
  }

  catch(reject) {
    return this.then((rows) => rows).catch(reject);
  }
}

function tracker() {
  return { counts: {}, rowsReturned: {}, limits: [], skips: [], selects: [], sorts: [] };
}

function productRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    code: `P${String(index).padStart(5, '0')}`,
    productCode: `P${String(index).padStart(5, '0')}`,
    sku: `P${String(index).padStart(5, '0')}`,
    name: `Product ${index}`,
    productName: `Product ${index}`,
    category: `CAT${index % 10}`,
    brand: 'Brand',
    conversionRate: 1,
    unit: 'pcs',
    salePrice: 1000 + index,
    costPrice: 500 + index,
    isActive: index % 3 !== 0,
    createdAt: '2026-07-11',
    updatedAt: '2026-07-11'
  }));
}

function patchProductModel(rows, state) {
  const oldFind = Product.find;
  const oldCountDocuments = Product.countDocuments;
  Product.find = function find(filter) {
    state.counts.Product = (state.counts.Product || 0) + 1;
    state.lastFilter = filter;
    return new Query(rows, state, 'Product');
  };
  Product.countDocuments = function countDocuments(filter) {
    state.counts.ProductCount = (state.counts.ProductCount || 0) + 1;
    state.lastCountFilter = filter;
    if (filter && filter.$and && filter.$and.some((part) => part && part.isActive && part.isActive.$ne === false)) {
      return Promise.resolve(rows.filter((row) => row.isActive !== false).length);
    }
    return Promise.resolve(rows.length);
  };
  return () => {
    Product.find = oldFind;
    Product.countDocuments = oldCountDocuments;
  };
}

test('Phase236 Report Center catalog stays config-only and does not query products', () => {
  const state = tracker();
  const restore = patchProductModel(productRows(10), state);
  try {
    const catalog = ReportCenterService.catalog({ role: 'admin', includeInformationReports: true });
    assert.ok(catalog.reports.some((row) => row.code === 'info-products'));
    assert.deepEqual(state.counts, {});
  } finally {
    restore();
  }
});

test('Phase236 info-products Report Center pilot reads one bounded page from Mongo', async () => {
  const state = tracker();
  const restore = patchProductModel(productRows(10000), state);
  try {
    const result = await ReportCenterService.run('info-products', { page: 2, limit: 50 }, { role: 'admin' });
    assert.equal(state.counts.Product, 1);
    assert.equal(state.counts.ProductCount, 2);
    assert.equal(state.rowsReturned.Product, 50);
    assert.deepEqual(state.skips.map((item) => item.value), [50]);
    assert.deepEqual(state.limits.map((item) => item.value), [50]);
    assert.equal(state.selects.length, 1);
    assert.equal(result.rows.length, 50);
    assert.equal(result.meta.page, 2);
    assert.equal(result.meta.limit, 50);
    assert.equal(result.meta.total, 10000);
    assert.equal(result.summary.activeCount, 6666);
    assert.equal(result.diagnostics, undefined);
    assert.equal(result.performance.boundedRead, true);
  } finally {
    restore();
  }
});

function displayProducts(count) {
  return Array.from({ length: count }, (_, index) => {
    const code = `P${String(index + 1).padStart(5, '0')}`;
    return {
      code,
      productCode: code,
      sku: code,
      name: `Display Product ${index + 1}`,
      productName: `Display Product ${index + 1}`,
      salePrice: 1000,
      price: 1000,
      category: `CAT${(index % 50) + 1}`,
      isActive: true
    };
  });
}

function displayGroups(count) {
  return Array.from({ length: count }, (_, index) => ({
    _id: `group-${index + 1}`,
    groupCode: `G${String(index + 1).padStart(3, '0')}`,
    groupName: `Display Group ${index + 1}`,
    sourceType: 'product_group',
    sourceCode: `CAT${index + 1}`,
    sourceName: `CAT${index + 1}`,
    conditionType: 'quantity',
    thresholdQty: 1,
    thresholdAmount: 0,
    productCodes: [],
    isActive: true
  }));
}

function patchDisplayCheckModels({ groupCount }) {
  const state = tracker();
  const products = displayProducts(120);
  const groups = displayGroups(groupCount);
  const selectedCodes = new Set(['G001']);
  const old = {
    customerFindOne: Customer.findOne,
    productFind: Product.find,
    groupFind: DisplayCheckGroup.find,
    planFind: DisplayCheckPlan.find,
    promoFind: Promotion.find,
    promoItemFind: PromotionGroupItem.find,
    getLatest: dmsInventoryService.getLatest
  };

  Customer.findOne = function findOne() {
    state.counts.Customer = (state.counts.Customer || 0) + 1;
    return { lean: () => Promise.resolve({ code: 'C001', customerCode: 'C001', name: 'Customer 001', isActive: true }) };
  };
  Product.find = function find() {
    state.counts.Product = (state.counts.Product || 0) + 1;
    return new Query(products, state, 'Product');
  };
  DisplayCheckGroup.find = function find(filter = {}) {
    state.counts.DisplayCheckGroup = (state.counts.DisplayCheckGroup || 0) + 1;
    if (filter.groupCode && filter.groupCode.$in) {
      return new Query(groups.filter((group) => selectedCodes.has(group.groupCode)), state, 'DisplayCheckGroup');
    }
    return new Query(groups, state, 'DisplayCheckGroup');
  };
  DisplayCheckPlan.find = function find() {
    state.counts.DisplayCheckPlan = (state.counts.DisplayCheckPlan || 0) + 1;
    return new Query([], state, 'DisplayCheckPlan');
  };
  PromotionGroupItem.find = function find() {
    state.counts.PromotionGroupItem = (state.counts.PromotionGroupItem || 0) + 1;
    return new Query([], state, 'PromotionGroupItem');
  };
  Promotion.find = function find() {
    state.counts.Promotion = (state.counts.Promotion || 0) + 1;
    return new Query([], state, 'Promotion');
  };
  dmsInventoryService.getLatest = async function getLatest() {
    state.counts.DmsLatest = (state.counts.DmsLatest || 0) + 1;
    return {
      import: { code: 'DMS-001', committedAt: '2026-07-11T00:00:00.000Z' },
      rows: products.slice(0, 20).map((product) => ({
        productCode: product.productCode,
        productName: product.productName,
        dmsExcessQty: 3,
        salePrice: product.salePrice
      })),
      hasMore: false
    };
  };

  return {
    state,
    restore() {
      Customer.findOne = old.customerFindOne;
      Product.find = old.productFind;
      DisplayCheckGroup.find = old.groupFind;
      DisplayCheckPlan.find = old.planFind;
      Promotion.find = old.promoFind;
      PromotionGroupItem.find = old.promoItemFind;
      dmsInventoryService.getLatest = old.getLatest;
    }
  };
}

async function runDisplayPreviewFixture(groupCount) {
  const { state, restore } = patchDisplayCheckModels({ groupCount });
  try {
    const preview = await displayCheckService.generatePreview({
      workingDate: '2026-07-11',
      customerCode: 'C001',
      targetAmount: 1000,
      targetLineCount: 1,
      selectedGroupCodes: ['G001']
    });
    return { preview, state };
  } finally {
    restore();
  }
}

test('Phase236 Display Check preview keeps source reads fixed as active group count grows', async () => {
  const tenGroups = await runDisplayPreviewFixture(10);
  const fiftyGroups = await runDisplayPreviewFixture(50);

  assert.equal(tenGroups.preview.ok, true);
  assert.equal(fiftyGroups.preview.ok, true);
  assert.equal(tenGroups.state.counts.Product, 2);
  assert.equal(fiftyGroups.state.counts.Product, 2);
  assert.equal(tenGroups.state.counts.PromotionGroupItem, 1);
  assert.equal(fiftyGroups.state.counts.PromotionGroupItem, 1);
  assert.equal(tenGroups.state.counts.Promotion, 1);
  assert.equal(fiftyGroups.state.counts.Promotion, 1);
  assert.equal(tenGroups.state.counts.DisplayCheckGroup, 2);
  assert.equal(fiftyGroups.state.counts.DisplayCheckGroup, 2);
});
