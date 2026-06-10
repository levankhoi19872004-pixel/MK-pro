'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const src = fs.readFileSync('src/services/master-order/masterOrderLegacy.service.js', 'utf8');

test('confirmDeliveryAccounting hydrates AR-SALE staff from source SalesOrder before posting', () => {
  assert.ok(
    src.includes('ACCOUNTING_AR_SALE_STAFF_FROM_SALES_ORDER_START'),
    'confirmDeliveryAccounting must contain the scoped SalesOrder staff hydrate fix'
  );
  assert.ok(
    src.includes('await orderRepository.findManyByIdentity(selectedOrderKeys)'),
    'confirmDeliveryAccounting must load source salesOrders by selected order keys before AR posting'
  );
  assert.ok(
    src.includes('const sourceSalesOrder = findSourceSalesOrderForChild(child);'),
    'confirmDeliveryAccounting must resolve source SalesOrder for each child'
  );
  assert.ok(
    src.includes('deliveryStaffName: master.deliveryStaffName || sourceSalesOrder.deliveryStaffName || child.deliveryStaffName ||'),
    'AR-SALE accountingSource must prefer master NVGH before synced SalesOrder/child snapshot'
  );
  assert.ok(
    src.includes('salesStaffName: sourceSalesOrder.salesStaffName || sourceSalesOrder.salesmanName || child.salesStaffName || child.salesmanName ||'),
    'AR-SALE accountingSource must prefer SalesOrder sales staff before child snapshot'
  );

  const loadIndex = src.indexOf('await orderRepository.findManyByIdentity(selectedOrderKeys)');
  const sourceIndex = src.indexOf('const accountingSource = hydrateReturnOrdersForAccounting');
  const postIndex = src.indexOf('normalPostChildren.push(updated)');
  assert.ok(loadIndex > -1 && sourceIndex > loadIndex && postIndex > sourceIndex, 'SalesOrder staff must be loaded before accountingSource is pushed for AR posting');
});
