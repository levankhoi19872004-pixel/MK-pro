'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

const ALLOWED = new Set([
  path.normalize('src/services/inventoryStock.service.js'),
  path.normalize('src/services/inventoryService.js'),
  path.normalize('src/domain/reconciliation/ReconciliationService.js'),
  path.normalize('src/services/reportLegacy.service.js')
]);

const FORBIDDEN = [
  /\brequire\(['"].*models\/Inventory['"]\)/,
  /\bInventorySnapshot\b/,
  /\binventorySnapshots\b/,
  /\bproduct\.availableStock\b/,
  /\bproduct\.stockQuantity\b/,
  /\bproduct\.openingStock\b/
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
      return walk(full);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

test('inventory reads must go through inventoryStock.service boundary', () => {
  const violations = [];

  for (const file of walk(path.join(ROOT, 'src'))) {
    const rel = path.normalize(path.relative(ROOT, file));
    if (ALLOWED.has(rel)) continue;

    const source = fs.readFileSync(file, 'utf8');

    for (const pattern of FORBIDDEN) {
      if (pattern.test(source)) {
        violations.push(`${rel} matches ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, [], violations.join('\n'));
});
