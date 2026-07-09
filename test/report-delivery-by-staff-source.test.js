'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const center = fs.readFileSync(path.join(root, 'src/services/reports/ReportCenterService.js'), 'utf8');
const delivery = fs.readFileSync(path.join(root, 'src/services/reports/DeliveryReportService.js'), 'utf8');
const byStaff = delivery.slice(delivery.indexOf('async function deliveryByStaffReport'), delivery.indexOf('async function deliveryReport'));

test('delivery-by-staff route calls the lazy DeliveryReportService deliveryByStaffReport boundary', () => {
  const caseBlock = center.slice(center.indexOf("case 'delivery-by-staff'"), center.indexOf("case 'delivery-trips'"));
  assert.match(caseBlock, /getDeliveryReportService\(\)\.deliveryByStaffReport/);
  assert.equal(/deliveryTripsReport|deliveryReport\(/.test(caseBlock), false);
});

test('deliveryByStaffReport reads delivered SalesOrder and canonical fundLedgers without master dependency', () => {
  assert.match(delivery, /async function loadDeliveredOrders/);
  assert.match(delivery, /businessDateStages\(dateFrom, dateTo, \['deliveryDate', 'date', 'orderDate', 'documentDate'\]/);
  assert.match(byStaff, /loadDeliveredOrders\(query\)/);
  assert.equal(/loadMasters\(/.test(byStaff), false);
  assert.match(byStaff, /unmasteredOrderCount/);
  assert.match(delivery, /fundLedgerCanonicalFilter\(/);
});
