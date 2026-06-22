'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('Phase36D delete sales order context deduplicates keys and uses findOne with projection instead of loading 20 rows', () => {
  const repo = read('src/repositories/salesOrderDeletion.repository.js');
  assert.match(repo, /function orderKeys\(order = \{\}\) \{\n\s+return \[\.\.\.new Set\(/);
  assert.match(repo, /DELETION_CONTEXT_PROJECTIONS/);
  assert.match(repo, /function firstWithProjection\(query, projection, session\)/);
  assert.match(repo, /StockTransaction\.findOne\(refFilter\)/);
  assert.match(repo, /ArLedger\.findOne\(refFilter\)/);
  assert.doesNotMatch(repo, /StockTransaction\.find\(refFilter\)\.limit\(20\)/);
  assert.doesNotMatch(repo, /ArLedger\.find\(refFilter\)\.limit\(20\)/);
});

test('Phase36D delete sales order performs safe early exit for already-deleted or merged orders before heavy dependency context', () => {
  const service = read('src/domain/lifecycle/SalesOrderDeletionService.js');
  assert.match(service, /const earlyDecision = decideSalesOrderDeletion\(order, \{\}/);
  assert.match(service, /earlyDecision\.mode === 'ALREADY_DELETED'/);
  assert.match(service, /ORDER_ALREADY_MERGED/);
  assert.doesNotMatch(service, /const related = await deletionRepository\.loadSalesOrderDeletionContext\(order\)/);
  assert.match(service, /loadSalesOrderDeletionContext\(order, \{ session \}\)/);
  assert.match(service, /Phase36D revised: chỉ hydrate dependency context một lần trong transaction/);
});

test('Phase36D debt customer detail queries use AR ledger projection and lean', () => {
  const source = read('src/services/reportLegacy.service.source/part-02.jsfrag') + read('src/services/reportLegacy.service.source/part-03.jsfrag');
  assert.match(source, /const DEBT_AR_LEDGER_DETAIL_PROJECTION =/);
  assert.match(source, /ArLedger\.find\(match\)\n\s+\.select\(DEBT_AR_LEDGER_DETAIL_PROJECTION\)\n\s+\.sort\(\{ date: -1, createdAt: -1 \}\)\n\s+\.limit\(200\)\n\s+\.lean\(\)/);
  assert.match(source, /ArLedger\.find\(match\)\n\s+\.select\(DEBT_AR_LEDGER_DETAIL_PROJECTION\)\n\s+\.sort\(\{ date: -1, createdAt: -1 \}\)\n\s+\.skip\(skip\)\n\s+\.limit\(limit \+ 1\)\n\s+\.lean\(\)/);
});

test('Phase36D debt read service projects AR ledger order debt rows', () => {
  const service = read('src/services/DebtReadService.js');
  assert.match(service, /const DEBT_ORDER_LEDGER_PROJECTION =/);
  assert.match(service, new RegExp(String.raw`ArLedger\.find\(\{ \$and: \[activeArFilter\(\), orderRefCondition\(keys\)\] \}\)\s+\.select\(DEBT_ORDER_LEDGER_PROJECTION\)\s+\.limit\(Math\.max\(200, keys\.length \* 50\)\)`));
  assert.match(service, /const keys = \[\.\.\.new Set\(orderKeys\.map\(text\)\.filter\(Boolean\)\)\]/);
});

test('Phase36D delivery staff search narrows role-specific alias filters and still uses projection lean', () => {
  const repo = read('src/repositories/searchRepository.js');
  assert.match(repo, /ROLE_SPECIFIC_STAFF_CODE_FIELDS/);
  assert.match(repo, /delivery: \['code', 'staffCode', 'deliveryStaffCode', 'shipperCode', 'employeeCode', 'maNhanVien'\]/);
  assert.match(repo, /staffCodeExistsFilter\(scopedQuery\)/);
  assert.match(repo, /\{ role: \{ \$in: roleRegexes \} \}/);
  assert.match(repo, /\{ roles: \{ \$in: roleRegexes \} \}/);
  assert.match(repo, /\{ staffType: \{ \$in: roleRegexes \} \}/);
  assert.match(repo, /User\.find\(userFilter\)\n\s+\.select\('/);
  assert.match(repo, /\.limit\(limit\)\n\s+\.lean\(\)/);
});

test('Phase36D keeps Phase36C baseline markers and does not revert optimized APIs', () => {
  assert.match(read('src/services/master-order/deliveryAccountingCommand.impl.js'), /Phase36c P0: không quét toàn bộ đơn tổng trong ngày trước/);
  assert.match(read('src/services/inventoryStock.service.js'), /buildProductLookupFilterByAliases\(aliases\)/);
  assert.match(read('src/controllers/promotionController.js'), /req\.query\?\.type === 'all'/);
  assert.match(read('public/js/bootstrap/03-tab-loader.js'), /initialTabName === 'dashboardTab' \? 650 : 0/);
});
