'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('disabled direct import and inventory check still require explicit route policies', () => {
  const importRoutes = read('src/routes/excelImportRoutes.js');
  const inventoryRoutes = read('src/routes/inventoryRoutes.js');
  assert.match(importRoutes, /router\.post\('\/direct',\s*manageImports,\s*excelImportController\.direct\)/);
  assert.match(inventoryRoutes, /const viewInventory = requireRole\(\['admin', 'manager', 'accountant', 'warehouse', 'sales', 'delivery'\]\)/);
  assert.match(inventoryRoutes, /router\.post\('\/check',\s*viewInventory,\s*inventoryController\.check\)/);
});

test('environment example uses the hardened bcrypt work factor', () => {
  assert.match(read('.env.example'), /BCRYPT_ROUNDS=12/);
});
