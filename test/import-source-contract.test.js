'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { SOURCE_CONTRACT_REGISTRY } = require('../src/services/source-contracts/SourceContractRegistry');

const REQUIRED = ['import-excel-preview', 'import-sales-orders', 'import-promotion-groups', 'import-promotion-product-rules', 'import-products', 'import-customers'];

test('import contracts include Excel file source, parser, mapper and target collections', () => {
  for (const code of REQUIRED) {
    const contract = SOURCE_CONTRACT_REGISTRY[code];
    assert.ok(contract, code);
    assert.equal(contract.importSource, 'excel_upload');
    assert.ok(contract.parserService, `${code} missing parser`);
    assert.ok(contract.mapperService, `${code} missing mapper`);
    assert.ok(contract.validationRule, `${code} missing validationRule`);
  }
  assert.deepEqual(SOURCE_CONTRACT_REGISTRY['import-promotion-product-rules'].targetCollections, ['promotionProductRules']);
});

test('import controllers attach sourceNote to preview/commit/session payloads', () => {
  const excel = fs.readFileSync('src/controllers/excelImportController.js', 'utf8');
  const legacy = fs.readFileSync('src/controllers/importExportController.js', 'utf8');
  assert.match(excel, /buildImportSourceNote/);
  assert.match(excel, /sourceNote/);
  assert.match(legacy, /buildImportSourceNote/);
  assert.match(legacy, /sourceNote/);
});
