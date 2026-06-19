'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['src', 'services']
  .map((dir) => path.join(ROOT, dir))
  .filter(fs.existsSync);

const ALLOWED_FILES = new Set([
  path.normalize('src/domain/posting/InventoryPostingService.js'),
  path.normalize('src/services/inventoryService.js')
]);

const FORBIDDEN_PATTERNS = [
  { name: 'StockTransaction.create', regex: /\bStockTransaction\.create\s*\(/g },
  { name: 'StockTransaction.insertMany', regex: /\bStockTransaction\.insertMany\s*\(/g },
  { name: 'insertManyInBatches(StockTransaction)', regex: /\binsertManyInBatches\s*\(\s*StockTransaction/g },
  { name: 'InventoryLegacy.create', regex: /\bInventoryLegacy\.create\s*\(/g },
  { name: 'InventoryLegacy.bulkWrite', regex: /\bInventoryLegacy\.bulkWrite\s*\(/g },
  { name: 'bulkWriteInBatches(InventoryLegacy)', regex: /\bbulkWriteInBatches\s*\(\s*InventoryLegacy/g }
];

const PHASE1_KNOWN_LEGACY_EXCEPTIONS = new Map([
  [legacyKey('src/services/import/core/importPersistence.util.js', 'insertManyInBatches(StockTransaction)', 'applyInventoryMovementsBulk'), 1],
  [legacyKey('src/services/import/core/importPersistence.util.js', 'bulkWriteInBatches(InventoryLegacy)', 'applyInventoryMovementsBulk'), 1],
  [legacyKey('src/services/import/core/importPersistence.util.js', 'bulkWriteInBatches(InventoryLegacy)', 'setOpeningStockInventoriesBulk'), 1],
  [legacyKey('src/services/import/operations/salesImport.impl.js', 'insertManyInBatches(StockTransaction)', 'importOpeningStock'), 1]
]);

function legacyKey(relPath, patternName, functionName) {
  return `${path.normalize(relPath)}::${patternName}::${functionName}`;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
      return walk(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
  });
}

function readPhysical(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    return fs.readFileSync(fd, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function nearestFunctionName(source, index) {
  const head = source.slice(0, index);
  const candidates = [...head.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)];
  const last = candidates[candidates.length - 1];
  return last ? last[1] : '<module>';
}

test('inventory bulk writes are limited to inventory boundary and pinned phase-1 import bulk paths', () => {
  const violations = [];
  const knownLegacyHits = new Map();

  for (const filePath of SCAN_DIRS.flatMap(walk)) {
    const relPath = path.normalize(path.relative(ROOT, filePath));
    if (ALLOWED_FILES.has(relPath)) continue;

    const source = readPhysical(filePath);
    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(source)) !== null) {
        const functionName = nearestFunctionName(source, match.index);
        const key = legacyKey(relPath, pattern.name, functionName);
        if (PHASE1_KNOWN_LEGACY_EXCEPTIONS.has(key)) {
          knownLegacyHits.set(key, (knownLegacyHits.get(key) || 0) + 1);
          continue;
        }
        violations.push(`${relPath}:${lineNumberAt(source, match.index)} ${pattern.name} in ${functionName}()`);
      }
    }
  }

  const expandedLegacyExceptions = [...knownLegacyHits.entries()]
    .filter(([key, count]) => count > PHASE1_KNOWN_LEGACY_EXCEPTIONS.get(key))
    .map(([key, count]) => `${key} matched ${count} times, allowed ${PHASE1_KNOWN_LEGACY_EXCEPTIONS.get(key)}`);

  assert.deepEqual(violations, [], `Direct inventory writes found outside boundary:\n${violations.join('\n')}`);
  assert.deepEqual(expandedLegacyExceptions, [], `Inventory legacy exception expanded unexpectedly:\n${expandedLegacyExceptions.join('\n')}`);
});

test('excel import bulk inventory bypasses remain explicitly pinned for later migration', () => {
  const persistence = readPhysical(path.join(ROOT, 'src/services/import/core/importPersistence.util.js'));
  const salesImport = readPhysical(path.join(ROOT, 'src/services/import/operations/salesImport.impl.js'));
  const facade = readPhysical(path.join(ROOT, 'src/services/excelImportService.js'));
  const stockBulkCount = (persistence.match(/insertManyInBatches\s*\(\s*StockTransaction/g) || []).length
    + (salesImport.match(/insertManyInBatches\s*\(\s*StockTransaction/g) || []).length;
  const inventoryBulkCount = (persistence.match(/bulkWriteInBatches\s*\(\s*InventoryLegacy/g) || []).length;

  assert.equal(stockBulkCount, 2, 'Phase-1 import StockTransaction bulk paths changed unexpectedly');
  assert.equal(inventoryBulkCount, 2, 'Phase-1 InventoryLegacy bulk paths changed unexpectedly');
  assert.doesNotMatch(facade, /StockTransaction|InventoryLegacy/, 'compatibility facade must not regain persistence logic');
});
