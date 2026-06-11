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
  path.normalize('src/domain/settlement/DeliverySettlementService.js'),
  path.normalize('src/domain/posting/FundPostingService.js'),
  path.normalize('src/services/fundService.js')
]);

const FORBIDDEN_PATTERNS = [
  { name: 'FundLedger.create', regex: /\bFundLedger\.create\s*\(/g },
  { name: 'FundLedger.insertMany', regex: /\bFundLedger\.insertMany\s*\(/g },
  { name: 'FundLedger.findOneAndUpdate', regex: /\bFundLedger\.findOneAndUpdate\s*\(/g },
  { name: 'new FundLedger', regex: /\bnew\s+FundLedger\s*\(/g },
  { name: 'fundLedgerRepository.upsert', regex: /\bfundLedgerRepository\.upsert\s*\(/g }
];

const PHASE1_KNOWN_LEGACY_EXCEPTIONS = new Map([
  [legacyKey('src/services/financialService.js', 'fundLedgerRepository.upsert', 'postReceiptFundLedger'), 1],
  [legacyKey('src/services/financialService.js', 'fundLedgerRepository.upsert', 'voidReceipt'), 1]
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

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function nearestFunctionName(source, index) {
  const head = source.slice(0, index);
  const candidates = [...head.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/g)];
  const last = candidates[candidates.length - 1];
  return last ? last[1] : '<module>';
}

test('fund ledger writes stay inside fund boundary or pinned phase-1 legacy functions', () => {
  const violations = [];
  const knownLegacyHits = new Map();

  for (const filePath of SCAN_DIRS.flatMap(walk)) {
    const relPath = path.normalize(path.relative(ROOT, filePath));
    if (ALLOWED_FILES.has(relPath)) continue;

    const source = fs.readFileSync(filePath, 'utf8');
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

  assert.deepEqual(violations, [], `Direct fund ledger writes found outside boundary:\n${violations.join('\n')}`);
  assert.deepEqual(expandedLegacyExceptions, [], `Fund legacy exception expanded unexpectedly:\n${expandedLegacyExceptions.join('\n')}`);
});

test('mobile delivery cash submission goes through DeliverySettlementService', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/mobile/delivery.service.js'), 'utf8');
  const submitCashIndex = source.indexOf('async function submitCash(');
  assert.notEqual(submitCashIndex, -1, 'submitCash() must exist');
  const nextFunctionIndex = source.indexOf('\nasync function ', submitCashIndex + 'async function submitCash('.length);
  const submitCashBlock = source.slice(submitCashIndex, nextFunctionIndex === -1 ? source.length : nextFunctionIndex);

  assert.match(source, /DeliverySettlementService/);
  assert.match(submitCashBlock, /DeliverySettlementService\.submitCashToFund\(/);
  assert.doesNotMatch(submitCashBlock, /statusCode:\s*501/);
});
