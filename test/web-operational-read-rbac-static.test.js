'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('web operational read routes require management roles', () => {
  const expected = {
    'src/routes/bankbookRoutes.js': ['viewBankbook'],
    'src/routes/orderRoutes.js': ['viewOrders'],
    'src/routes/importOrderRoutes.js': ['viewImportOrders'],
    'src/routes/masterOrderRoutes.js': ['viewMasterOrders'],
    'src/routes/masterReturnOrderRoutes.js': ['viewMasterReturns'],
    'src/routes/returnRoutes.js': ['viewReturns'],
    'src/routes/printRoutes.js': ['router.use(viewPrintDocuments)'],
    'src/routes/userRoutes.js': ["requireRole(['admin', 'manager', 'accountant', 'warehouse'])"],
    'src/routes/inventoryRoutes.js': ["requireRole(['admin', 'manager', 'accountant', 'warehouse'])"]
  };

  for (const [file, markers] of Object.entries(expected)) {
    const source = read(file);
    for (const marker of markers) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('unified search protects staff, order and AR data and blocks generic bypass', () => {
  const source = read('src/routes/searchRoutes.js');
  assert.match(source, /viewOperationalData/);
  assert.match(source, /viewFinancialData/);
  assert.match(source, /requireSearchTypeAccess/);
  assert.match(source, /router\.get\('\/:type', requireSearchTypeAccess, searchController\.byType\)/);
  assert.match(source, /router\.get\('\/ar-ledger', viewFinancialData, searchController\.arLedger\)/);
});

test('full customer/product/promotion/template catalogs are management-only while mobile has scoped APIs', () => {
  const customer = read('src/routes/customerRoutes.js');
  const product = read('src/routes/productRoutes.js');
  const promotion = read('src/routes/promotionRoutes.js');
  const templates = read('src/routes/importTemplateRoutes.js');

  assert.match(customer, /router\.get\('\/search', viewCustomers/);
  assert.match(customer, /router\.get\('\/', viewCustomers/);
  assert.match(product, /router\.get\('\/search', viewProducts/);
  assert.match(product, /router\.get\('\/', viewProducts/);
  assert.match(promotion, /router\.get\('\/programs', viewPromotionAdmin/);
  assert.match(promotion, /router\.post\('\/calculate', promotionController\.calculate\)/);
  assert.match(templates, /router\.get\('\/templates', viewImportTemplates/);
});

test('customer-search and delivery-today aliases cannot bypass management RBAC', () => {
  const search = read('src/routes/searchRoutes.js');
  const catalog = read('src/routes/catalogRoutes.js');
  const routeIndex = read('src/routes/index.js');

  assert.match(search, /router\.get\('\/customers', viewOperationalData/);
  assert.doesNotMatch(search, /publicCatalogTypes = new Set\([^\n]*customer/);
  assert.match(catalog, /router\.get\('\/customers\/search', viewCustomers/);
  assert.match(routeIndex, /app\.get\('\/api\/delivery-today', requireRole\(\['admin', 'manager', 'accountant', 'warehouse'\]\)/);
});
