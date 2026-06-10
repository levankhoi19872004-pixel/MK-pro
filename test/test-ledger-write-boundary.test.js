'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ALLOWED_PREFIXES = [
  'src/core/posting/',
  'src/engines/posting.engine.js',
  'src/services/posting/',
  'src/repositories/',
  'test/',
  'tests/',
  'scripts/migrations/'
];
const ALLOWED_FILES = new Set([
  'src/services/arLedgerMigrationService.js'
]);

const WRITE_PATTERN = /\b(?:ArLedger|FundLedger|StockTransaction|Inventory)\s*\.\s*(?:create|insertMany|bulkWrite|findOneAndUpdate|updateOne|updateMany)\s*\(/g;

function walk(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).flatMap((name) => {
    const child = path.join(full, name);
    const rel = path.relative(ROOT, child).replace(/\\/g, '/');
    const stat = fs.statSync(child);
    if (stat.isDirectory()) return walk(rel);
    return rel.endsWith('.js') ? [rel] : [];
  });
}

function isAllowed(rel) {
  return ALLOWED_FILES.has(rel) || ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

test('ledger write chỉ được đi qua Posting Engine hoặc repository boundary', () => {
  const files = ['src', 'scripts'].flatMap(walk);
  const violations = [];
  for (const rel of files) {
    if (isAllowed(rel)) continue;
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    WRITE_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(WRITE_PATTERN)) {
      violations.push(`${rel}:${lineOf(text, match.index)} ${match[0]}`);
    }
  }
  assert.deepEqual(violations, []);
});
