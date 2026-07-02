'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('Debt New exposes manual debt popup and posts to canonical new debt API', () => {
  const ui = read('public/js/app/new/92-debt-new.js');
  const route = read('src/routes/newOperationsRoutes.js');
  const service = read('src/services/accounting/manualDebtPostingService.js');

  assert.match(ui, /debtNewManualDebtOpen/);
  assert.match(ui, /\+ Tạo công nợ/);
  assert.match(ui, /Tạo công nợ thủ công/);
  assert.match(ui, /fetch\('\/api\/new\/debt\/manual'/);
  assert.match(ui, /Không tạo salesOrder, returnOrder hoặc dữ liệu giao hàng giả/);
  assert.match(ui, /Số tiền công nợ phải lớn hơn 0/);
  assert.match(route, /router\.post\('\/debt\/manual', requireAuth, writeRoles/);
  assert.match(route, /manualDebtPostingService\.createManualDebt/);
  assert.match(service, /category: CATEGORY/);
  assert.match(service, /sourceType: SOURCE_TYPE/);
  assert.match(service, /AR-DEBT-ADJUSTMENT/);
  assert.doesNotMatch(service, /SalesOrder|ReturnOrder/);
});
