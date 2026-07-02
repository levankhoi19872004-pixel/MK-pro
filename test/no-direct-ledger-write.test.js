'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = ['src', 'services']
  .map((dir) => path.join(ROOT, dir))
  .filter(fs.existsSync);

// Ledger/lifecycle write boundaries are intentionally narrow. Business modules
// must call domain services instead of writing ledger/lifecycle collections directly.
const ALLOWED_FILES = new Set([
  path.normalize('src/domain/posting/ArPostingService.js'),
  path.normalize('src/domain/posting/InventoryPostingService.js'),
  path.normalize('src/domain/posting/FundPostingService.js'),
  path.normalize('src/services/accounting/arAdjustmentService.js'),
  path.normalize('src/services/accounting/externalDebtArPostingService.js'),
  path.normalize('src/services/accounting/manualDebtPostingService.js'),
  path.normalize('src/services/accounting/returnArPostingService.js'),
  path.normalize('src/services/accounting/ArDebtOpenPostingService.js'),
  path.normalize('src/services/accounting/ArDebtAdjustmentPostingService.js'),
  path.normalize('src/services/arLedgerMigrationService.js'),

  // Phase 1 compatibility boundaries. Remove these one-by-one after migration.
  path.normalize('src/engines/posting.engine.js'),
  path.normalize('src/services/inventoryService.js'),
  path.normalize('src/services/fundService.js')
]);

const FORBIDDEN_PATTERNS = [
  { name: 'ArLedger.create', regex: /\bArLedger\.create\s*\(/g },
  { name: 'ArLedger.insertMany', regex: /\bArLedger\.insertMany\s*\(/g },
  { name: 'ArLedger.findOneAndUpdate', regex: /\bArLedger\.findOneAndUpdate\s*\(/g },
  { name: 'MongoStore.arLedgers.insertMany', regex: /\bMongoStore\.arLedgers\.insertMany\s*\(/g },
  { name: 'MongoStore.arLedgers.bulkWrite', regex: /\bMongoStore\.arLedgers\.bulkWrite\s*\(/g },
  { name: 'paymentRepository.upsert', regex: /\bpaymentRepository\.upsert\s*\(/g },

  { name: 'FundLedger.create', regex: /\bFundLedger\.create\s*\(/g },
  { name: 'FundLedger.insertMany', regex: /\bFundLedger\.insertMany\s*\(/g },
  { name: 'FundLedger.findOneAndUpdate', regex: /\bFundLedger\.findOneAndUpdate\s*\(/g },
  { name: 'new FundLedger', regex: /\bnew\s+FundLedger\s*\(/g },
  { name: 'fundLedgerRepository.upsert', regex: /\bfundLedgerRepository\.upsert\s*\(/g },

  { name: 'StockTransaction.create', regex: /\bStockTransaction\.create\s*\(/g },
  { name: 'StockTransaction.insertMany', regex: /\bStockTransaction\.insertMany\s*\(/g },
  { name: 'insertManyInBatches(StockTransaction)', regex: /\binsertManyInBatches\s*\(\s*StockTransaction/g },
  { name: 'InventoryLegacy.create', regex: /\bInventoryLegacy\.create\s*\(/g },
  { name: 'bulkWriteInBatches(InventoryLegacy)', regex: /\bbulkWriteInBatches\s*\(\s*InventoryLegacy/g },

  { name: 'ReturnOrder.findOneAndUpdate', regex: /\bReturnOrder\.findOneAndUpdate\s*\(/g }
];

// Existing phase-1 bypasses are pinned by file + forbidden API + function name.
// This keeps the guard useful now: any new bypass outside these exact legacy
// functions fails the test immediately. Remove entries as each flow is migrated.
const PHASE1_KNOWN_LEGACY_EXCEPTIONS = new Map([
  [legacyKey('src/services/import/core/importPersistence.util.js', 'insertManyInBatches(StockTransaction)', 'applyInventoryMovementsBulk'), 1],
  [legacyKey('src/services/import/core/importPersistence.util.js', 'bulkWriteInBatches(InventoryLegacy)', 'applyInventoryMovementsBulk'), 1],
  [legacyKey('src/services/import/core/importPersistence.util.js', 'bulkWriteInBatches(InventoryLegacy)', 'setOpeningStockInventoriesBulk'), 1],
  [legacyKey('src/services/import/operations/salesImport.impl.js', 'insertManyInBatches(StockTransaction)', 'importOpeningStock'), 1],
  [legacyKey('src/services/financialService.js', 'fundLedgerRepository.upsert', 'postReceiptFundLedger'), 1],
  [legacyKey('src/services/financialService.js', 'fundLedgerRepository.upsert', 'voidReceipt'), 1],
  [legacyKey('src/services/master-order/deliveryAccountingCore.impl.js', 'paymentRepository.upsert', 'reverseActiveArLedgersForOrder'), 2],
  [legacyKey('src/services/master-order/deliveryAccountingCore.impl.js', 'paymentRepository.upsert', 'postDeliveryArLedgerRowsAfterReAccounting'), 1],
  [legacyKey('src/services/admin-correction/AdminDataCorrectionService.js', 'FundLedger.create', 'createFundAdjustment'), 1]
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

test('ledger and lifecycle collections are not written directly outside approved boundaries', () => {
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
        const line = lineNumberAt(source, match.index);
        const detail = `${relPath}:${line} ${pattern.name} in ${functionName}()`;

        if (PHASE1_KNOWN_LEGACY_EXCEPTIONS.has(key)) {
          knownLegacyHits.set(key, (knownLegacyHits.get(key) || 0) + 1);
          continue;
        }

        violations.push(detail);
      }
    }
  }

  const expandedLegacyExceptions = [...knownLegacyHits.entries()]
    .filter(([key, count]) => count > PHASE1_KNOWN_LEGACY_EXCEPTIONS.get(key))
    .map(([key, count]) => `${key} matched ${count} times, allowed ${PHASE1_KNOWN_LEGACY_EXCEPTIONS.get(key)}`);

  assert.deepEqual(violations, [], `Direct writes found outside domain boundaries:\n${violations.join('\n')}`);
  assert.deepEqual(expandedLegacyExceptions, [], `Legacy exception expanded unexpectedly:\n${expandedLegacyExceptions.join('\n')}`);
});
