'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Phase36c confirm-accounting resolves selected orders before full-day master fallback', () => {
  const service = read('src/services/master-order/deliveryAccountingCommand.impl.js');
  assert.match(service, /async function buildTargetMasterContextFromSelectedOrders/);
  assert.match(service, /findSalesOrdersByIdentityBatched\(\[\.\.\.selectedIdSet\]/);
  assert.match(service, /masterOrderRepository\.findManyByIdentityMatches\(masterRefs/);
  assert.match(service, /buildMasterChildrenMapFast\(masters, \{ identityBatchSize: 250 \}\)/);
  assert.match(service, /buildTargetMasterContextByFullDayFallback/);
});

test('Phase36c master return claim is scoped to selected rows and no longer uses broad updateMany', () => {
  const service = read('src/services/masterReturnOrderService.js');
  assert.match(service, /const claimOps = children\.map/);
  assert.match(service, /returnOrders\.bulkWrite\(claimOps/);
  assert.match(service, /appendAndClauses\(baseClaimFilter, \[returnOrderIdentityClause\(child\)\]\)/);
  assert.doesNotMatch(service, /returnOrders\.updateMany\(\s*claimFilter/);
});

test('Phase36c stock summary avoids Product.find({}) and narrows product lookup by inventory aliases', () => {
  const service = read('src/services/inventoryStock.service.js');
  assert.match(service, /function inventoryProductAliases/);
  assert.match(service, /function buildProductLookupFilterByAliases/);
  assert.match(service, /Product\.find\(buildProductLookupFilterByAliases\(aliases\)\)/);
  assert.doesNotMatch(service, /Product\.find\(\{\}\)\s*\n\s*\.select\('id code productCode sku name productName unit baseUnit conversionRate packing packingQty unitsPerCase minStock maxStock'/);
});

test('Phase36c promotions programs can load all tab lists in one backend request', () => {
  const service = read('src/services/promotionService.js');
  const controller = read('src/controllers/promotionController.js');
  const frontend = read('public/js/app/admin/08e-promotion-programs.js');
  assert.match(service, /async function listPromotionProgramsByType/);
  assert.match(controller, /req\.query\?\.type === 'all'/);
  assert.match(frontend, /params\.set\('type','all'\)/);
  assert.match(frontend, /programsByType/);
});

test('Phase36c delivery reads use projection for returnOrders and filter inactive salesOrders early', () => {
  const part01 = read('src/engines/delivery.legacy.engine.source/part-01.jsfrag');
  const part02 = read('src/engines/delivery.legacy.engine.source/part-02.jsfrag');
  const part03 = read('src/engines/delivery.legacy.engine.source/part-03.jsfrag');
  assert.match(part01, /const DELIVERY_RETURN_SELECT = \[/);
  assert.match(part02, /filter\.status = \{ \$nin: \['cancelled'/);
  assert.match(part02, /query = query\.select\(DELIVERY_RETURN_SELECT\)/);
  assert.match(part03, /\.select\(DELIVERY_RETURN_SELECT\)\.sort/);
});

test('Phase36c initial slash shell delays dashboard-heavy tab loading', () => {
  const bootstrap = read('public/js/bootstrap/03-tab-loader.js');
  assert.match(bootstrap, /initialTabName === 'dashboardTab' \? 650 : 0/);
  assert.match(bootstrap, /setTimeout\(\(\)=>loadTabDataOnce\(initialTabName\), initialTabDelayMs\)/);
});
