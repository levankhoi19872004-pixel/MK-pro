'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('promotion group rule model and service persist calculation basis', () => {
  const model = read('src/models/PromotionGroupRule.js');
  const service = read('src/services/promotionService.js');
  assert.match(model, /basis: String/);
  assert.match(model, /calculationBasis: String/);
  assert.match(service, /GROUP_RULE_BASIS/);
  assert.match(service, /normalizeGroupRuleBasis/);
  assert.match(service, /basis === GROUP_RULE_BASIS\.QUANTITY/);
  assert.match(service, /groupQtyTotals/);
});

test('promotion import parser supports Vietnamese aliases for calculation basis', () => {
  const parser = read('src/services/import/core/importRow.util.js');
  assert.match(parser, /row\['Tính theo'\]/);
  assert.match(parser, /row\['Ngưỡng từ'\]/);
  assert.match(parser, /row\['Số lượng từ'\]/);
  assert.match(parser, /GROUP_RULE_BASIS\.ORDER_VALUE/);
});
