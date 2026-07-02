'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const PROMOTION_IMPORT_MODULES = [
  'src/services/import/operations/adminImport.impl.js',
  'src/services/import/handlers/PromotionProductImportHandler.js',
  'src/services/import/handlers/PromotionGroupItemImportHandler.js',
  'src/services/import/handlers/PromotionGroupRuleImportHandler.js',
  'src/services/import/handlers/PromotionQuantityGroupDiscountImportHandler.js',
  'src/services/import/handlers/PromotionCustomerOrderValueDiscountImportHandler.js'
];

test('promotion import operation and handlers can be required without undefined helper crashes', () => {
  for (const relativePath of PROMOTION_IMPORT_MODULES) {
    assert.doesNotThrow(
      () => require(path.join(ROOT, relativePath)),
      `${relativePath} should require cleanly`
    );
  }
});

test('promotion admin import exports all expected promotion operations as functions', () => {
  const operations = require(path.join(ROOT, 'src/services/import/operations/adminImport.impl.js'));
  for (const name of [
    'importPromotionProductRules',
    'importPromotionGroupItems',
    'importPromotionGroupRules',
    'importPromotionQuantityGroupDiscounts',
    'importPromotionCustomerOrderValueDiscounts'
  ]) {
    assert.equal(typeof operations[name], 'function', `${name} must be a function`);
  }
});
