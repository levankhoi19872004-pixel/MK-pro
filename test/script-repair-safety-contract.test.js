'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

const CRITICAL_COLLECTION_DELETE = /\b(?:ArLedger|FundLedger|StockTransaction|InventoryLegacy|SalesOrder|ReturnOrder|DebtCollection|Payment|Receipt|Cashbook|Bankbook)\.deleteMany\s*\(/;

function hasSafetyGuard(source) {
  return /requireDangerousConfirmation|requireDeprecatedOverride|DEPRECATED_AND_BLOCKED_BY_DEFAULT|DANGEROUS_OPERATION_BLOCKED/.test(source);
}

test('script safety helper exists and blocks deprecated/dangerous execution paths', () => {
  assert.ok(exists('scripts/lib/scriptSafety.js'));
  const source = read('scripts/lib/scriptSafety.js');
  assert.match(source, /function requireDeprecatedOverride/);
  assert.match(source, /DEPRECATED_SCRIPT_BLOCKED/);
  assert.match(source, /function requireDangerousConfirmation/);
  assert.match(source, /DANGEROUS_OPERATION_BLOCKED/);
  assert.match(source, /function requireApplyConfirmation/);
});

test('legacy AR return duplicate repair is deprecated and points to Phase65 plan/apply flow', () => {
  const source = read('scripts/repair-ar-return-duplicates.js');
  assert.match(source, /requireDeprecatedOverride/);
  assert.match(source, /DEPRECATED_AND_BLOCKED_BY_DEFAULT|DEPRECATED_SCRIPT_BLOCKED|deprecated/i);
  assert.match(source, /plan-ar-ledger-repair\.js/);
  assert.match(source, /apply-ar-ledger-repair-plan\.js/);
  assert.doesNotMatch(source, /\bArLedger\.deleteMany\s*\(/);
  assert.doesNotMatch(source, /\bArLedger\.deleteOne\s*\(/);
  assert.doesNotMatch(source, /findOneAndDelete|remove\s*\(/);
});

test('destructive AR ledger rebuild is blocked behind explicit destructive confirmations', () => {
  const source = read('scripts/rebuild-ar-ledger.js');
  assert.match(source, /ArLedger\.deleteMany\s*\(/);
  assert.match(source, /requireDangerousConfirmation/);
  assert.match(source, /--i-understand-this-is-destructive-rebuild/);
  assert.match(source, /--confirm-rebuild-ar-ledger/);
  assert.ok(hasSafetyGuard(source));
});

test('legacy JSON full migration and replace mode require explicit confirmation', () => {
  const legacy = read('scripts/migrate-full-to-mongo.js');
  assert.match(legacy, /deleteMany\s*\(/);
  assert.match(legacy, /requireDeprecatedOverride/);
  assert.match(legacy, /--confirm-full-json-migration-replace/);

  const finalMigration = read('scripts/migrate-json-to-mongo-final.js');
  assert.match(finalMigration, /const REPLACE_MODE = process\.argv\.includes\('--replace'\)/);
  assert.match(finalMigration, /--confirm-replace-json-migration/);
  assert.match(finalMigration, /requireDangerousConfirmation/);
});

test('repair/apply scripts require apply plus confirmation and keep Phase65 dry-run behavior', () => {
  const applyPlan = read('scripts/apply-ar-ledger-repair-plan.js');
  assert.match(applyPlan, /const apply = args\.includes\('--apply'\)/);
  assert.match(applyPlan, /--confirm-repair-batch/);
  assert.match(applyPlan, /dry-run/);
  assert.doesNotMatch(applyPlan, CRITICAL_COLLECTION_DELETE);

  const deliveryRepair = read('scripts/repair-delivery-accounting-ar-ledgers.js');
  assert.match(deliveryRepair, /requireApplyConfirmation/);
  assert.match(deliveryRepair, /--confirm-repair-delivery-accounting-ar-ledgers/);

  const backfill = read('scripts/backfill-ar-return-from-return-orders.js');
  assert.match(backfill, /Dry-run mặc định/);
  assert.match(backfill, /requireApplyConfirmation/);
  assert.match(backfill, /--confirm-backfill-ar-return/);

  const reconcile = read('scripts/reconcile-return-ar.js');
  assert.match(reconcile, /requireApplyConfirmation/);
  assert.match(reconcile, /--confirm-reconcile-return-ar-fix/);
});

test('unique index scripts are not automatic and apply mode requires explicit index confirmation', () => {
  const activeIndex = read('scripts/create-ar-return-active-idempotency-index.js');
  assert.match(activeIndex, /check-only/);
  assert.match(activeIndex, /dryRun:\s*true/);
  assert.match(activeIndex, /if \(args\.includes\('--apply'\)\)/);
  assert.doesNotMatch(activeIndex, /collection\.createIndex\s*\(/);

  const returnUnique = read('scripts/create-ar-return-unique-index.js');
  assert.match(returnUnique, /hasBlockingIssues\(audit\)/);
  assert.match(returnUnique, /requireApplyConfirmation/);
  assert.match(returnUnique, /--confirm-create-index/);

  const adjustmentUnique = read('scripts/create-ar-adjustment-unique-index.js');
  assert.match(adjustmentUnique, /hasBlockingIssues\(audit\)/);
  assert.match(adjustmentUnique, /requireApplyConfirmation/);
  assert.match(adjustmentUnique, /--confirm-create-index/);
});

test('critical hard deletes in scripts must be guarded or deprecated', () => {
  const scriptDir = path.join(ROOT, 'scripts');
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(scriptDir);
  const offenders = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const source = fs.readFileSync(file, 'utf8');
    if (CRITICAL_COLLECTION_DELETE.test(source) && !hasSafetyGuard(source)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});
