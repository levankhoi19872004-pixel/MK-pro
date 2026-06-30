'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function mockFind(rows, calls) {
  return (filter) => {
    calls.push(filter);
    return {
      select() { return this; },
      sort() { return this; },
      limit() { return this; },
      lean: async () => rows(typeof calls.length === 'number' ? calls.length : 0, filter)
    };
  };
}

test('product search API supports numeric partial code with leading zero in edit-order autocomplete', async () => {
  const Product = require('../src/models/Product');
  const repository = require('../src/repositories/searchRepository');
  const originalFind = Product.find;
  const calls = [];

  Product.find = mockFind((callNumber) => {
    if (callNumber === 1) return [];
    return [{
      code: '69690864',
      productCode: '69690864',
      name: 'SUNLIGHT Nước Rửa Chén Chanh Mới 400g/24 chai',
      salePrice: 13114,
      conversionRate: 24,
      isActive: true
    }];
  }, calls);

  try {
    const rows = await repository.findProducts({ q: '0864', limit: 20, activeOnly: '1' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].code, '69690864');
    assert.equal(calls.length, 2, 'numeric partial search must fall through from fast exact/prefix lookup to bounded contains scan');
    assert.match(JSON.stringify(calls[1]), /0864/, 'Mongo regex must preserve leading zero instead of converting 0864 to 864');
  } finally {
    Product.find = originalFind;
  }
});

test('search response contract exposes success and data for stable frontend product suggestions', () => {
  const searchController = read('src/controllers/searchController.js');
  const productController = read('src/controllers/productController.js');
  assert.match(searchController, /success:\s*true/);
  assert.match(searchController, /data:\s*items/);
  assert.match(productController, /success:\s*true/);
  assert.match(productController, /data:\s*products/);
});

test('edit-order product suggestion frontend accepts current and stable response shapes', () => {
  const unified = read('public/js/search/unifiedSearchEngine.js');
  const catalog = read('public/js/search/catalogCacheService.js');
  const productBox = read('public/js/search/productSearchBox.js');

  assert.match(unified, /json\.items\s*\|\|\s*json\.data\s*\|\|\s*json\.products/);
  assert.match(catalog, /json\.products\s*\|\|\s*json\.items\s*\|\|\s*json\.data/);
  assert.match(productBox, /json\.products\s*\|\|\s*json\.items\s*\|\|\s*json\.data/);
});

test('sales order product autocomplete is bound to edit modal input and product API search', () => {
  const config = read('public/js/search/searchFieldsConfig.js');
  const configured = read('public/js/search/configuredAutocomplete.js');
  const unified = read('public/js/search/unifiedSearchEngine.js');

  assert.match(config, /key:\s*'salesProduct'/);
  assert.match(config, /inputId:\s*'salesProductSearch'/);
  assert.match(config, /boxId:\s*'salesProductSuggestions'/);
  assert.match(config, /emptyText:\s*'Không tìm thấy sản phẩm phù hợp/);
  assert.match(configured, /window\.UnifiedSearchEngine\.searchProduct\(q/);
  assert.match(unified, /fetch\(`\/api\/search\/\$\{path\}\?/);
});

test('product autocomplete does not render empty text before async API completes', () => {
  const engine = read('public/js/search/autocompleteEngine.js');
  const loadingIndex = engine.indexOf('renderStatus(box, loadingText)');
  const awaitIndex = engine.indexOf('const items = await Promise.resolve(result)');
  const renderIndex = engine.indexOf('currentItems = render({');
  assert.ok(loadingIndex > 0 && awaitIndex > loadingIndex && renderIndex > awaitIndex);
});

test('sales and create/import product suggestion boxes use product rich renderer', () => {
  const engine = read('public/js/search/autocompleteEngine.js');
  assert.match(engine, /salesproductsuggestions/);
  assert.match(engine, /importproductsuggestions/);
  assert.match(engine, /productSuggestionBox[\s\S]*UnifiedProductSearch[\s\S]*labelHtml/);
});
