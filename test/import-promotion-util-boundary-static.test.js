'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function destructuredBlockBeforeRequire(source, requireLiteral) {
  const requireIndex = source.indexOf(requireLiteral);
  assert.notEqual(requireIndex, -1, `Missing require ${requireLiteral}`);
  const blockStart = source.lastIndexOf('const {', requireIndex);
  assert.notEqual(blockStart, -1, `Missing destructuring before ${requireLiteral}`);
  return source.slice(blockStart, requireIndex);
}

test('promotion admin import keeps value/logging/row helper boundaries explicit', () => {
  const source = read('src/services/import/operations/adminImport.impl.js');

  assert.match(source, /const \{ cleanText \} = require\('\.\.\/core\/importValue\.util'\)/);
  assert.match(source, /const \{ addImportLog \} = require\('\.\.\/core\/importLogging\.util'\)/);

  const rowBlock = destructuredBlockBeforeRequire(source, "require('../core/importRow.util')");
  assert.doesNotMatch(rowBlock, /\bcleanText\b/, 'cleanText must not come from importRow.util');
  assert.doesNotMatch(rowBlock, /\baddImportLog\b/, 'addImportLog must not come from importRow.util');
});

test('promotion logging has a dedicated util while importValue keeps backward-compatible re-export only', () => {
  const logging = read('src/services/import/core/importLogging.util.js');
  const value = read('src/services/import/core/importValue.util.js');

  assert.match(logging, /async function addImportLog\(type, summary\)/);
  assert.match(logging, /ImportLog\.create/);
  assert.match(logging, /module\.exports = \{\s*addImportLog\s*\}/s);

  assert.match(value, /const \{ addImportLog \} = require\('\.\/importLogging\.util'\)/);
  assert.doesNotMatch(value, /const ImportLog = require/);
  assert.doesNotMatch(value, /async function addImportLog\(type, summary\)/);
});

test('all promotion import handlers route through createOperationHandler with the correct operation name', () => {
  const expected = new Map([
    ['PromotionProductImportHandler.js', ['promotionProductRules', 'importPromotionProductRules']],
    ['PromotionGroupItemImportHandler.js', ['promotionGroupItems', 'importPromotionGroupItems']],
    ['PromotionGroupRuleImportHandler.js', ['promotionGroupRules', 'importPromotionGroupRules']],
    ['PromotionQuantityGroupDiscountImportHandler.js', ['promotionQuantityGroupDiscounts', 'importPromotionQuantityGroupDiscounts']],
    ['PromotionCustomerOrderValueDiscountImportHandler.js', ['promotionCustomerOrderValueDiscounts', 'importPromotionCustomerOrderValueDiscounts']]
  ]);

  for (const [file, [type, operation]] of expected) {
    const source = read(`src/services/import/handlers/${file}`);
    assert.match(source, /createOperationHandler/);
    assert.match(source, new RegExp(`createOperationHandler\\('${type}', '${operation}'`));
  }
});

test('promotionProductRules commit keeps batch progress and does not store raw Excel payload', () => {
  const source = read('src/services/import/operations/adminImport.impl.js');
  const branch = source.slice(source.indexOf('async function importPromotionProductRules'), source.indexOf('async function importPromotionGroupItems'));

  assert.match(branch, /const batches = promotionBulkChunks\(ops, batchSize\)/);
  assert.match(branch, /step: `committing:\$\{batchIndex \+ 1\}\/\$\{batches\.length\}`/);
  assert.match(branch, /await notifyPromotionProductRuleProgress\(options, progress\)/);
  assert.doesNotMatch(branch, /for \(const chunk of promotionBulkChunks\(ops\)\) \{\s*if \(chunk\.length\) await PromotionProductRule\.bulkWrite\(chunk, \{ ordered: false \}\);\s*\}/);

  const docBlock = branch.slice(branch.indexOf('const doc = {'), branch.indexOf('ops.push({ updateOne'));
  assert.doesNotMatch(docBlock, /\.\.\.payload/);
  assert.doesNotMatch(docBlock, /raw:/);
  assert.match(docBlock, /missingProduct: false/);
});
