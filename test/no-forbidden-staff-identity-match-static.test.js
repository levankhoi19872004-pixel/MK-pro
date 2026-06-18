'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(ROOT, file));
}

const BUSINESS_FILES = [
  'src/rules/staffRules.js',
  'src/rules/importRules.js',
  'src/engines/delivery.legacy.engine.js',
  'src/engines/posting.engine.js',
  'src/services/orderLegacy.service.js',
  'src/services/excelImportService.js',
  'src/services/fundService.js',
  'src/services/importExportLegacy.service.js',
  'src/services/masterReturnOrderService.js',
  'src/services/returnOrderLegacy.service.js'
];

test('business staff matching does not fallback between canonical and generic staff fields', () => {
  for (const file of BUSINESS_FILES) {
    const src = read(file);

    assert.doesNotMatch(src, /staffCode\s*\|\|\s*salesStaffCode/, file);
    assert.doesNotMatch(src, /salesStaffCode\s*\|\|\s*staffCode/, file);
    assert.doesNotMatch(src, /staffName\s*\|\|\s*salesStaffName/, file);
    assert.doesNotMatch(src, /salesStaffName\s*\|\|\s*staffName/, file);

    assert.doesNotMatch(src, /staffCode\s*\|\|\s*deliveryStaffCode/, file);
    assert.doesNotMatch(src, /deliveryStaffCode\s*\|\|\s*staffCode/, file);
    assert.doesNotMatch(src, /staffName\s*\|\|\s*deliveryStaffName/, file);
    assert.doesNotMatch(src, /deliveryStaffName\s*\|\|\s*staffName/, file);

    assert.doesNotMatch(src, /staffId\s*\|\|\s*(salesStaffId|deliveryStaffId)/, file);
    assert.doesNotMatch(src, /(salesStaffId|deliveryStaffId)\s*\|\|\s*staffId/, file);
  }
});
