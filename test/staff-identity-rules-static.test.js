'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

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
  const src = read('src/services/reportService.js');
  assert.doesNotMatch(src, /salesmanCode:\s*[^\n]*order\.staffCode/);
  assert.doesNotMatch(src, /salesmanName:\s*[^\n]*order\.staffName/);
  assert.doesNotMatch(src, /deliveryStaffCode:\s*[^\n]*order\.staffCode/);
  assert.doesNotMatch(src, /deliveryStaffName:\s*[^\n]*order\.staffName/);
});

test('delivery.engine.js tách filter NVBH/NVGH, không dùng staffCode/staffName trong filter riêng', () => {
  const src = read('src/engines/delivery.engine.js');
  const deliveryFilter = src.match(/if \(query\.deliveryStaffCode[\s\S]*?\n    \}/)?.[0] || '';
  const salesFilter = src.match(/if \(query\.salesStaffCode[\s\S]*?\n    \}/)?.[0] || '';
  assert.doesNotMatch(deliveryFilter, /\bstaffCode\b|\bstaffName\b/g);
  assert.doesNotMatch(salesFilter, /\bstaffCode\b|\bstaffName\b/g);
});

test('returnOrderService.js không lấy salesStaff từ order.staffCode/order.staffName', () => {
  const src = read('src/services/returnOrderService.js');
  assert.doesNotMatch(src, /salesStaffCode:\s*[^\n]*order\.staffCode/);
  assert.doesNotMatch(src, /salesStaffName:\s*[^\n]*order\.staffName/);
});

test('reportService.js staff seed filter không dùng staffCode/staffName khi lọc NVBH/NVGH', () => {
  const src = read('src/services/reportService.js');
  const block = src.match(/function buildLedgerStaffSeedCondition\(query = \{\}\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(block, 'buildLedgerStaffSeedCondition block must exist');
  assert.doesNotMatch(block, /\{\s*staffCode\s*:/);
  assert.doesNotMatch(block, /\{\s*staffName\s*:/);
});
