'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return require('./helpers/sourceBundle.util').readSource(path.join(ROOT, file));
}

test('frontend search API is called only through unifiedSearchEngine', () => {
  const files = [
    'public/js/delivery/delivery-web-view.js',
    'public/js/app/03-customers-autocomplete.js',
    'public/mobile/js/sales.js'
  ];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /fetch\(['"`]\/api\/search\//,
      `${file} must not fetch /api/search directly`
    );
  }

  const engine = read('public/js/search/unifiedSearchEngine.js');
  assert.match(engine, /fetch\(`\/api\/search\/\$\{path\}/);
});
