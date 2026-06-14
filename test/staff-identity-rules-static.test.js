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

test('reportService.js công nợ lấy NVBH/NVGH của đơn từ AR-SALE, không để PAYMENT/RETURN override', () => {
  const src = read('src/services/reportLegacy.service.js');
  assert.match(src, /DEBT_REPORT_ORDER_STAFF_FROM_AR_SALE_ONLY_START/);
  assert.match(src, /saleSalesmanCode/);
  assert.match(src, /saleDeliveryStaffName/);
  assert.match(src, /regex:\s*'sale\|external_debt'/);
  assert.match(src, /row\.saleSalesmanCode \|\| row\.fallbackSalesmanCode/);
  assert.match(src, /row\.saleDeliveryStaffName \|\| row\.fallbackDeliveryStaffName/);
});

test('UI công nợ render NVBH/NVGH bằng code mới từ API debts/arLedgers', () => {
  const src = [read('public/js/app/debt/07a-debt-core.js'),read('public/js/app/debt/07b-return-orders.js'),read('public/js/app/debt/07d-master-return-orders.js')].join('\n');
  assert.match(src, /DEBT_UI_RENDER_FROM_DEBT_ROWS_START/);
  assert.match(src, /window\.debtLedgerRowsCache=ledger/);
  assert.match(src, /mergeDebtCustomerSummaryFromDebtRows\(json\.customerSummary, ledger\)/);
  assert.match(src, /function renderDebtStaffInfoFromDebt\(customer\)/);
  const renderFn = src.match(new RegExp('function renderDebtStaffInfoFromDebt[\\s\\S]*?\\n\\}'))?.[0] || '';
  assert.ok(renderFn, 'renderDebtStaffInfoFromDebt must exist');
  assert.match(renderFn, /pickDebtDisplayRowFromDebtRows\(customer\)/);
  assert.match(renderFn, /debtStaffFieldsFromDebtRow\(row\)/);
  assert.doesNotMatch(renderFn, /staffCode|staffName|userMap|staffMap/);
  const selectBlock = src.match(/function selectCollectionCustomer[\s\S]*?function renderCollectionCustomerSelect/)?.[0] || '';
  assert.match(selectBlock, /renderDebtStaffInfoFromDebt\(d\)/);
  assert.doesNotMatch(selectBlock, /const staffSource=getDebtDisplayStaffSource\(d\)/);
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
