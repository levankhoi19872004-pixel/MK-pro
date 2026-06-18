'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

const ALLOWED = new Set([
  path.normalize('src/models/Inventory.js'),
  path.normalize('test/no-inventory-snapshot-runtime-static.test.js')
]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'docs') return [];
      return walk(full);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

test('runtime code must not use inventorySnapshots legacy collection', () => {
  const violations = [];

  for (const file of walk(path.join(ROOT, 'src'))) {
    const rel = path.normalize(path.relative(ROOT, file));
    if (ALLOWED.has(rel)) continue;

    const source = require('./helpers/sourceBundle.util').readSource(file);

    if (/models\/Inventory['"]/.test(source)) {
      violations.push(`${rel} requires legacy Inventory model`);
    }

    if (/\binventorySnapshots\b/.test(source)) {
      violations.push(`${rel} references inventorySnapshots`);
    }

    if (/\bInventorySnapshot\b/.test(source)) {
      violations.push(`${rel} references InventorySnapshot`);
    }
  }

  assert.deepEqual(violations, [], violations.join('\n'));
});
