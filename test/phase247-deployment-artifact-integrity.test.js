'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { verifyEntryStructure } = require('../scripts/verify-deployment-artifact');

test('Phase247 rejects flattened source artifacts', () => {
  const entries = ['package.json', 'package-lock.json'];
  for (let i = 0; i < 40; i += 1) entries.push(`file-${i}.js`);
  const result = verifyEntryStructure(entries);
  assert(result.violations.some((item) => item.includes('root flatten detected')));
  assert(result.violations.some((item) => item.includes('src/')));
});

test('Phase247 accepts a preserved source tree', () => {
  const entries = [
    'package.json', 'package-lock.json',
    'src/app.js', 'public/index.html', 'test/app.test.js', 'scripts/build.js'
  ];
  const result = verifyEntryStructure(entries);
  assert.deepEqual(result.violations, []);
});

test('Phase247 rejects exact duplicate entries and forbidden directories', () => {
  const entries = [
    'package.json', 'package-lock.json', 'src/app.js', 'src/app.js',
    'public/index.html', 'test/app.test.js', 'scripts/build.js', 'node_modules/x/index.js'
  ];
  const result = verifyEntryStructure(entries);
  assert(result.violations.some((item) => item.includes('duplicate ZIP entry')));
  assert(result.violations.some((item) => item.includes('forbidden artifact segment')));
});
