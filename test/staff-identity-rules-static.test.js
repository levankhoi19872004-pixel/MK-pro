'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('posting.engine.js không dùng doc.staffCode/doc.staffName để tạo salesman/delivery AR', () => {
  const src = read('src/engines/posting.engine.js');
  assert.doesNotMatch(src, /salesmanCode:\s*[^\n]*doc\.staffCode/);
  assert.doesNotMatch(src, /salesmanName:\s*[^\n]*doc\.staffName/);
  assert.doesNotMatch(src, /deliveryStaffCode:\s*[^\n]*doc\.staffCode/);
  assert.doesNotMatch(src, /deliveryStaffName:\s*[^\n]*doc\.staffName/);
});

test('masterOrderLegacy.service.js không dùng child/master staff* để ghi AR/accounting staff', () => {
  const src = read('src/services/master-order/masterOrderLegacy.service.js');
  assert.doesNotMatch(src, /salesmanCode:\s*[^\n]*(child|master)\.staffCode/);
  assert.doesNotMatch(src, /salesmanName:\s*[^\n]*(child|master)\.staffName/);
  assert.doesNotMatch(src, /salesStaffCode:\s*[^\n]*(child|master)\.staffCode/);
  assert.doesNotMatch(src, /salesStaffName:\s*[^\n]*(child|master)\.staffName/);
});

test('reportService.js không dùng order.staffCode/order.staffName cho salesman/delivery report', () => {
  const src = read('src/services/reportLegacy.service.js');
  assert.doesNotMatch(src, /salesmanCode:\s*[^\n]*order\.staffCode/);
  assert.doesNotMatch(src, /salesmanName:\s*[^\n]*order\.staffName/);
  assert.doesNotMatch(src, /deliveryStaffCode:\s*[^\n]*order\.staffCode/);
  assert.doesNotMatch(src, /deliveryStaffName:\s*[^\n]*order\.staffName/);
});

test('delivery.engine.js tách filter NVBH/NVGH, không dùng staffCode/staffName trong filter riêng', () => {
  const src = read('src/engines/delivery.legacy.engine.js');
  const deliveryFilter = src.match(/if \(query\.deliveryStaffCode[\s\S]*?\n    \}/)?.[0] || '';
  const salesFilter = src.match(/if \(query\.salesStaffCode[\s\S]*?\n    \}/)?.[0] || '';
  assert.doesNotMatch(deliveryFilter, /\bstaffCode\b|\bstaffName\b/g);
  assert.doesNotMatch(salesFilter, /\bstaffCode\b|\bstaffName\b/g);
});

test('returnOrderService.js không lấy salesStaff từ order.staffCode/order.staffName', () => {
  const src = read('src/services/returnOrderLegacy.service.js');
  assert.doesNotMatch(src, /salesStaffCode:\s*[^\n]*order\.staffCode/);
  assert.doesNotMatch(src, /salesStaffName:\s*[^\n]*order\.staffName/);
});

test('reportService.js staff seed filter không dùng staffCode/staffName khi lọc NVBH/NVGH', () => {
  const src = read('src/services/reportLegacy.service.js');
  const block = src.match(/function buildLedgerStaffSeedCondition\(query = \{\}\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(block, 'buildLedgerStaffSeedCondition block must exist');
  assert.doesNotMatch(block, /\{\s*staffCode\s*:/);
  assert.doesNotMatch(block, /\{\s*staffName\s*:/);
});

test('reportService.js công nợ runtime lấy NVBH/NVGH từ AR debt read model v2, không tự seed từ AR-SALE legacy', () => {
  const src = read('src/services/reportLegacy.service.js');
  assert.match(src, /arCustomerDebtReadModel\.service/);
  assert.match(src, /debtSource:\s*['"]AR_DEBT_READ_MODEL_V2['"]/);
  assert.doesNotMatch(src, /DEBT_REPORT_ORDER_STAFF_FROM_AR_SALE_ONLY_START/);
  assert.doesNotMatch(src, /row\.saleSalesmanCode \|\| row\.fallbackSalesmanCode/);
  assert.doesNotMatch(src, /row\.saleDeliveryStaffName \|\| row\.fallbackDeliveryStaffName/);
});

test('UI Công nợ (New) render NVBH/NVGH từ canonical staff fields của AR debt read model', () => {
  const src = read('public/js/app/new/92-debt-new.js');
  assert.match(src, /function renderCustomers\(\)/);
  assert.match(src, /row\.salesStaffCode \|\| row\.salesmanCode/);
  assert.match(src, /row\.salesStaffName \|\| row\.salesmanName/);
  assert.match(src, /row\.deliveryStaffCode/);
  assert.match(src, /row\.deliveryStaffName/);
  assert.match(src, /customer\.salesStaffCode \|\| customer\.salesmanCode/);
  assert.match(src, /customer\.deliveryStaffCode/);
  assert.doesNotMatch(src, /staffMap|userMap|getDebtDisplayStaffSource|staffCode\s*\|\||staffName\s*\|\|/);
});



test('staffRules.js không dùng username/id/_id để match mã nhân viên', () => {
  const src = read('src/rules/staffRules.js');
  const buildCodeFilterBlock = src.match(/function buildCodeFilter\(staffCode\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(buildCodeFilterBlock, 'buildCodeFilter block must exist');
  assert.doesNotMatch(buildCodeFilterBlock, /'username'|"username"/);
  assert.doesNotMatch(buildCodeFilterBlock, /'id'|"id"/);
  assert.doesNotMatch(buildCodeFilterBlock, /'_id'|"_id"/);
});

test('staffRules.js không fallback username làm mã nhân viên chuẩn hóa', () => {
  const src = read('src/rules/staffRules.js');
  const validateBlock = src.match(/async function validateStaffCode\([\s\S]*?\n\}/)?.[0] || '';
  assert.ok(validateBlock, 'validateStaffCode block must exist');
  const realCodeLine = validateBlock.match(/const realCode[\s\S]*?;/)?.[0] || '';
  assert.ok(realCodeLine, 'realCode assignment must exist');
  assert.doesNotMatch(realCodeLine, /staff\.username/);
});
