'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return require('./helpers/sourceBundle.util').readSource(path);
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
  const src = read('src/services/orderLegacy.service.js');
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
  const service = read('src/services/returnOrderLegacy.service.js');
  const engine = read('src/engines/delivery.legacy.engine.js');
  assert.ok(service.includes('ORDER_DATA_LINEAGE_RETURN_SNAPSHOT_STAFF_START'));
  assert.ok(service.includes('ORDER_DATA_LINEAGE_DELIVERY_RETURN_SNAPSHOT_STAFF_START'));
  assert.ok(engine.includes('ORDER_DATA_LINEAGE_ENGINE_RETURN_SNAPSHOT_STAFF_START'));
  assert.doesNotMatch(service, /salesStaffName:\s*body\.salesStaffName \|\| existing\?\.salesStaffName \|\| salesOrder\?\.salesStaffName \|\| salesOrder\?\.staffName/);
  assert.doesNotMatch(engine, /salesStaffName:\s*text\(body\.salesStaffName \|\| order\.salesStaffName \|\| order\.staffName\)/);
});

test('debt report staff lineage uses AR debt read model v2 and does not depend on AR-SALE legacy', () => {
  const src = read('src/services/reportLegacy.service.js');

  assert.ok(
    src.includes("require('./accounting/arDebtRuntimeView.service')")
      || src.includes('arDebtRuntimeView'),
    'debt report/runtime output must delegate customer debt values to arDebtRuntimeView'
  );
  assert.ok(
    src.includes('arCustomerDebtReadModel.debtReport(query)')
      || src.includes('AR_DEBT_READ_MODEL_V2'),
    'debt report must delegate runtime debt calculation to AR debt read model v2'
  );
  assert.doesNotMatch(src, /DEBT_REPORT_ORDER_STAFF_FROM_AR_SALE_ONLY_START/);
  assert.doesNotMatch(src, /ORDER_DATA_LINEAGE_REPORT_AR_SALE_STAFF_ONLY_START/);
  assert.doesNotMatch(src, /saleSalesmanName\s*\|\|\s*row\.fallbackSalesmanName/);
  assert.doesNotMatch(src, /saleDeliveryStaffName\s*\|\|\s*row\.fallbackDeliveryStaffName/);
  assert.doesNotMatch(src, /salesmanName:\s*row\.salesmanName \|\| cmeta\.salesmanName/);
  assert.doesNotMatch(src, /deliveryStaffName:\s*row\.deliveryStaffName \|\| cmeta\.deliveryStaffName/);
});

test('orderService resolves new order sales staff only from salesStaffCode/salesmanCode', () => {
  const src = read('src/services/orderLegacy.service.js');

  assert.ok(src.includes('ORDER_CREATE_SALES_STAFF_FROM_EXPLICIT_CODE_START'));
  assert.match(src, /body\.salesStaffCode\s*\|\|\s*body\.salesmanCode/);

  assert.doesNotMatch(src, /body\.staffId\s*\|\|\s*body\.staffCode\s*\|\|\s*body\.staffName\s*\|\|\s*body\.salesStaffId/);
  assert.doesNotMatch(src, /findStaffByIdOrCode\(staffId\)/);
});
