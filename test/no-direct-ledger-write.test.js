'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['src', 'services'].map((dir) => path.join(ROOT, dir)).filter(fs.existsSync);

// Ledger write boundaries are intentionally narrow. Business modules should call
// posting.engine/postFundLedger/postStockMovement instead of writing ledger models directly.
const ALLOWED_FILES = new Set([
  path.normalize('src/engines/posting.engine.js'),
  path.normalize('src/services/arLedgerMigrationService.js'),
  path.normalize('src/services/inventoryService.js'),
  path.normalize('src/services/fundService.js')
]);

const FORBIDDEN_PATTERNS = [
  /\bArLedger\.create\s*\(/g,
  /\bArLedger\.insertMany\s*\(/g,
  /\bArLedger\.findOneAndUpdate\s*\(/g,
  /\bFundLedger\.create\s*\(/g,
  /\bFundLedger\.insertMany\s*\(/g,
  /\bFundLedger\.findOneAndUpdate\s*\(/g,
  /\bnew\s+FundLedger\s*\(/g,
  /\bStockTransaction\.create\s*\(/g,
  /\bInventoryLegacy\.create\s*\(/g
];

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

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

test('ledger models are not written directly outside approved posting boundaries', () => {
  const violations = [];

  for (const filePath of SCAN_DIRS.flatMap(walk)) {
    const relPath = path.normalize(path.relative(ROOT, filePath));
    if (ALLOWED_FILES.has(relPath) || relPath.startsWith(path.normalize('src/repositories/')) || relPath.startsWith(path.normalize('src/core/posting/'))) continue;

    const source = fs.readFileSync(filePath, 'utf8');
    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(source)) !== null) {
        violations.push(`${relPath}:${lineNumberAt(source, match.index)} ${match[0]}`);
      }
    }
  }

  assert.deepEqual(violations, [], `Direct ledger writes found:\n${violations.join('\n')}`);
});
