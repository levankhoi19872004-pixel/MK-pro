'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('public/mobile/js/delivery-mobile-view.source.js', 'utf8');
const bundled = fs.readFileSync('public/mobile/js/delivery-mobile-view.js', 'utf8');

function extractFunctionBody(text, functionName) {
  const marker = `function ${functionName}()`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} must exist`);
  const braceStart = text.indexOf('{', start);
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

test('delivery mobile customer context does not reference undefined workflow bar', () => {
  const body = extractFunctionBody(source, 'renderCustomerContext');
  assert.doesNotMatch(body, /(^|[^.\w$])bar\s*[.=]/, 'renderCustomerContext must not reference bare identifier bar');
  assert.match(body, /var context = el\('mCustomerContext'\)/);
  assert.match(body, /var order = currentOrder\(\)/);
});

test('delivery mobile bundle no longer contains the stale renderCustomerContext bar reference', () => {
  assert.doesNotMatch(
    bundled,
    /bar\.className="m-workflow-bar delivery-one-hand-bar m-delivery-bottom-action",!isCustomerMode\(\)\|\|!order/,
    'compiled delivery mobile bundle must not retain stale bare bar reference in customer context'
  );
  assert.match(bundled, /function renderWorkflowBar\(\)\{\s*var bar=el\("mWorkflowBar"\)/);
});
