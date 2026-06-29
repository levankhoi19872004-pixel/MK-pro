'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const SOURCE_PATH = 'public/mobile/js/delivery-mobile-view.source.js';
const BUNDLE_PATH = 'public/mobile/js/delivery-mobile-view.js';
const MAP_PATH = 'public/mobile/js/delivery-mobile-view.js.map';

const source = fs.readFileSync(SOURCE_PATH, 'utf8');
const bundle = fs.readFileSync(BUNDLE_PATH, 'utf8');
const sourceMap = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'));

function extractFunctionBody(text, functionName) {
  const marker = `function ${functionName}`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} must exist`);
  const braceStart = text.indexOf('{', start);
  assert.notEqual(braceStart, -1, `${functionName} must have a body`);
  let depth = 0;
  for (let i = braceStart; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(braceStart + 1, i);
    }
  }
  throw new Error(`Cannot extract ${functionName}`);
}

test('delivery mobile runtime does not reintroduce stale workflow bar references', () => {
  const customerContext = extractFunctionBody(source, 'renderCustomerContext');
  assert.doesNotMatch(customerContext, /(^|[^.\w$])bar\s*[.=]/, 'renderCustomerContext must not reference bare bar');
  assert.doesNotMatch(source, /window\.bar\s*=/, 'must not add a fake global window.bar');
  assert.doesNotMatch(bundle, /window\.bar\s*=/, 'runtime bundle must not add a fake global window.bar');
  assert.match(extractFunctionBody(source, 'renderWorkflowBar'), /var bar = el\('mWorkflowBar'\)/, 'renderWorkflowBar owns its workflow bar variable');
  assert.match(extractFunctionBody(source, 'renderWorkflowBar'), /bar\.className = 'm-workflow-bar delivery-one-hand-bar m-delivery-bottom-action'/, 'workflow bar class changes must stay inside renderWorkflowBar');
});

test('delivery mobile retry buttons and payment forms are null-safe before binding', () => {
  assert.match(source, /var retryDebtButton = el\('mRetryDebt'\);\nif \(retryDebtButton\) retryDebtButton\.addEventListener\('click'/, 'debt retry button binding must be null-safe');
  assert.match(source, /var retryReconciliationButton = el\('mRetryReconciliation'\);\nif \(retryReconciliationButton\) retryReconciliationButton\.addEventListener\('click'/, 'reconciliation retry button binding must be null-safe');
  assert.match(source, /var formEl = el\('mProductReturnForm'\);\nif \(formEl\) \{\nformEl\.addEventListener\('submit'/, 'product return form submit binding must be null-safe');
  assert.match(source, /var formEl = el\('mPaymentForm'\);\nif \(!formEl\) \{\nmsg\('Không tải được form thu tiền\./, 'payment form render must stop safely when the form is missing');
});

test('delivery mobile runtime hardening does not hide failures with empty catch blocks', () => {
  assert.doesNotMatch(source, /catch\s*\(\s*function\s*\(\s*\)\s*\{\s*\}\s*\)/, 'source must not contain promise catch(function(){})');
  assert.doesNotMatch(bundle, /catch\s*\(function\(\)\{\}\)/, 'bundle must not contain promise catch(function(){})');
  assert.doesNotMatch(source, /catch\s*\([^)]*\)\s*\{\s*\}/, 'source must not contain empty catch blocks');
  assert.match(source, /logout API failed/, 'logout API failure must be logged instead of swallowed');
});

test('delivery mobile source map carries the updated canonical source content', () => {
  assert.equal(sourceMap.file, 'delivery-mobile-view.js');
  assert.deepEqual(sourceMap.sources, ['delivery-mobile-view.source.js']);
  assert.ok(Array.isArray(sourceMap.sourcesContent) && sourceMap.sourcesContent.length === 1, 'source map must include canonical source content');
  assert.equal(sourceMap.sourcesContent[0], source, 'source map sourcesContent must match canonical source exactly');
});
