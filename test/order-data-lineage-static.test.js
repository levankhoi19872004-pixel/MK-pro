'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('order data lineage document exists and defines canonical sources', () => {
  const doc = read('docs/order-data-lineage.md');
  assert.match(doc, /NVBH \| `salesOrders\.salesStaffCode` \/ `salesOrders\.salesStaffName`/);
  assert.match(doc, /NVGH \| `masterOrders\.deliveryStaffCode` \/ `masterOrders\.deliveryStaffName`/);
  assert.match(doc, /Công nợ \| `arLedgers`/);
  assert.match(doc, /Trả hàng \| `returnOrders`/);
  assert.match(doc, /Tồn kho \| `inventories`/);
  assert.match(doc, /staffCode/);
  assert.match(doc, /staffName/);
});

test('create/update sales order locks NVBH on salesStaff fields', () => {
  const src = read('src/services/orderService.js');
  assert.ok(src.includes('ORDER_DATA_LINEAGE_CREATE_ORDER_NVBH_START'));
  assert.ok(src.includes('ORDER_DATA_LINEAGE_LOCK_NVBH_ON_UPDATE_START'));
  assert.ok(src.includes('function buildSalesStaffSnapshot'));
  assert.ok(src.includes('salesStaffCode: salesStaffSnapshot.salesStaffCode'));
  assert.ok(src.includes('salesmanName: current.salesmanName || salesStaffSnapshot.salesStaffName'));
});

test('master order only syncs NVGH to child salesOrders and does not overwrite NVBH', () => {
  const src = read('src/services/master-order/masterOrderLegacy.service.js');
  assert.ok(src.includes('ORDER_DATA_LINEAGE_MASTER_ONLY_NVGH_START'));
  assert.ok(src.includes('ORDER_DATA_LINEAGE_MASTER_UPDATE_ONLY_NVGH_START'));
  assert.ok(src.includes('deliveryStaffCode: masterOrder.deliveryStaffCode'));
  assert.ok(src.includes('deliveryStaffName: masterOrder.deliveryStaffName'));
  assert.doesNotMatch(src, /salesStaffCode:\s*salesStaff\?\.code \|\| body\.salesStaffCode \|\| ''/);
  assert.doesNotMatch(src, /update:\s*\{\s*\$set:\s*\{[^}]*salesStaffCode/s);
});

test('confirmDeliveryAccounting posts AR-SALE staff from salesOrders/masterOrders lineage', () => {
  const src = read('src/services/master-order/masterOrderLegacy.service.js');
  assert.ok(src.includes('ACCOUNTING_AR_SALE_STAFF_FROM_SALES_ORDER_START'));
  assert.ok(src.includes('ORDER_DATA_LINEAGE_AR_SALE_NVGH_FROM_MASTER_START'));
  assert.ok(src.includes('salesStaffName: sourceSalesOrder.salesStaffName || sourceSalesOrder.salesmanName'));
  assert.ok(src.includes('deliveryStaffName: master.deliveryStaffName || sourceSalesOrder.deliveryStaffName || child.deliveryStaffName'));
});

test('returnOrders snapshot NVBH/NVGH and never treat staffName as NVBH', () => {
  const service = read('src/services/returnOrderService.js');
  const engine = read('src/engines/delivery.engine.js');
  assert.ok(service.includes('ORDER_DATA_LINEAGE_RETURN_SNAPSHOT_STAFF_START'));
  assert.ok(service.includes('ORDER_DATA_LINEAGE_DELIVERY_RETURN_SNAPSHOT_STAFF_START'));
  assert.ok(engine.includes('ORDER_DATA_LINEAGE_ENGINE_RETURN_SNAPSHOT_STAFF_START'));
  assert.doesNotMatch(service, /salesStaffName:\s*body\.salesStaffName \|\| existing\?\.salesStaffName \|\| salesOrder\?\.salesStaffName \|\| salesOrder\?\.staffName/);
  assert.doesNotMatch(engine, /salesStaffName:\s*text\(body\.salesStaffName \|\| order\.salesStaffName \|\| order\.staffName\)/);
});

test('debt report displays staff from arLedgers AR-SALE row, not customer/user/payment metadata', () => {
  const src = read('src/services/reportService.js');
  assert.ok(src.includes('DEBT_REPORT_ORDER_STAFF_FROM_AR_SALE_ONLY_START'));
  assert.ok(src.includes('ORDER_DATA_LINEAGE_REPORT_AR_SALE_STAFF_ONLY_START'));
  assert.ok(src.includes("salesmanName: row.saleSalesmanName || row.fallbackSalesmanName || ''"));
  assert.ok(src.includes("deliveryStaffName: row.saleDeliveryStaffName || row.fallbackDeliveryStaffName || ''"));
  assert.doesNotMatch(src, /salesmanName:\s*row\.salesmanName \|\| cmeta\.salesmanName/);
  assert.doesNotMatch(src, /deliveryStaffName:\s*row\.deliveryStaffName \|\| cmeta\.deliveryStaffName/);
});
