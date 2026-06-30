#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const DeliveryCloseoutCorrection = require('../src/models/DeliveryCloseoutCorrection');
const DeliveryCloseoutVersion = require('../src/models/DeliveryCloseoutVersion');
const ArLedger = require('../src/models/ArLedger');

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function debitCreditEffect(row = {}) {
  return money(row.debit) - money(row.credit);
}

function parseArgs(argv = process.argv.slice(2)) {
  const set = new Set(argv);
  return { strict: set.has('--strict'), json: set.has('--json') };
}

function groupDuplicates(rows = [], field = 'idempotencyKey') {
  const map = new Map();
  for (const row of rows) {
    const key = String(row[field] || '').trim();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).filter(([, count]) => count > 1).map(([key, count]) => ({ key, count }));
}

async function audit() {
  const corrections = await DeliveryCloseoutCorrection.find({}).lean();
  const correctionIds = corrections.map((row) => row.id || row.correctionCode).filter(Boolean);
  const versions = await DeliveryCloseoutVersion.find({}).lean();
  const ledgers = await ArLedger.find({
    $or: [
      { sourceType: 'DELIVERY_CLOSEOUT_CORRECTION' },
      { correctionId: { $in: correctionIds } },
      { sourceId: { $in: correctionIds } }
    ]
  }).lean();

  const versionByCorrection = new Map(versions.map((row) => [String(row.correctionId || ''), row]));
  const ledgersByCorrection = new Map();
  for (const ledger of ledgers) {
    const key = String(ledger.correctionId || ledger.sourceId || '').trim();
    if (!key) continue;
    if (!ledgersByCorrection.has(key)) ledgersByCorrection.set(key, []);
    ledgersByCorrection.get(key).push(ledger);
  }

  const missingNewCloseout = [];
  const missingArDebtAdjustment = [];
  const wrongArReturnGenerated = [];
  const wrongArSaleReversalGenerated = [];
  const closeoutVersionMissingOriginal = [];
  const debitCreditMismatch = [];

  for (const correction of corrections) {
    const key = String(correction.id || '').trim();
    const version = versionByCorrection.get(key);
    if (!version) missingNewCloseout.push({ correctionId: key, correctionCode: correction.correctionCode });
    else if (!version.originalCloseoutId || !version.correctionOfCloseoutId) closeoutVersionMissingOriginal.push({ versionId: version.id, correctionId: key });

    const correctionLedgers = ledgersByCorrection.get(key) || [];
    const debtLedgers = correctionLedgers.filter((row) => row.category === 'AR-DEBT-ADJUSTMENT' && row.ledgerType === 'AR-DEBT-ADJUSTMENT');
    if (!debtLedgers.length && money(correction.debtAdjustmentAmount) !== 0) missingArDebtAdjustment.push({ correctionId: key, correctionCode: correction.correctionCode, debtAdjustmentAmount: correction.debtAdjustmentAmount });
    for (const ledger of correctionLedgers) {
      if (ledger.category === 'AR-RETURN' || ledger.ledgerType === 'AR-RETURN') wrongArReturnGenerated.push({ correctionId: key, ledgerId: ledger.id, code: ledger.code });
      if (ledger.category === 'AR-SALE-REVERSAL' || ledger.ledgerType === 'AR-SALE-REVERSAL') wrongArSaleReversalGenerated.push({ correctionId: key, ledgerId: ledger.id, code: ledger.code });
    }
    for (const ledger of debtLedgers) {
      const expected = money(correction.debtAdjustmentAmount);
      const actual = debitCreditEffect(ledger);
      if (expected !== actual) debitCreditMismatch.push({ correctionId: key, ledgerId: ledger.id, expected, actual, debit: ledger.debit, credit: ledger.credit });
    }
  }

  const duplicateIdempotency = [
    ...groupDuplicates(corrections, 'idempotencyKey').map((row) => ({ collection: 'deliveryCloseoutCorrections', ...row })),
    ...groupDuplicates(ledgers.filter((row) => row.category === 'AR-DEBT-ADJUSTMENT'), 'idempotencyKey').map((row) => ({ collection: 'arLedgers', ...row }))
  ];

  const result = {
    title: 'DELIVERY_CLOSEOUT_CORRECTION_AUDIT',
    checkedCorrections: corrections.length,
    checkedVersions: versions.length,
    checkedCorrectionLedgers: ledgers.length,
    missingNewCloseout,
    missingArDebtAdjustment,
    wrongArReturnGenerated,
    wrongArSaleReversalGenerated,
    closeoutVersionMissingOriginal,
    duplicateIdempotency,
    debitCreditMismatch
  };
  result.ok = !missingNewCloseout.length
    && !missingArDebtAdjustment.length
    && !wrongArReturnGenerated.length
    && !wrongArSaleReversalGenerated.length
    && !closeoutVersionMissingOriginal.length
    && !duplicateIdempotency.length
    && !debitCreditMismatch.length;
  return result;
}

function printText(result) {
  console.log('DELIVERY_CLOSEOUT_CORRECTION_AUDIT');
  console.log(`Checked corrections: ${result.checkedCorrections}`);
  console.log(`Missing new closeout: ${result.missingNewCloseout.length}`);
  console.log(`Missing AR-DEBT-ADJUSTMENT: ${result.missingArDebtAdjustment.length}`);
  console.log(`Wrong AR-RETURN generated: ${result.wrongArReturnGenerated.length}`);
  console.log(`Wrong AR-SALE-REVERSAL generated: ${result.wrongArSaleReversalGenerated.length}`);
  console.log(`Duplicate idempotency: ${result.duplicateIdempotency.length}`);
  console.log(`Debit/Credit mismatch: ${result.debitCreditMismatch.length}`);
  console.log(result.ok ? 'AUDIT_PASS' : 'AUDIT_FAIL');
  if (!result.ok) console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const options = parseArgs();
  await connectDB();
  const result = await audit();
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printText(result);
  await mongoose.connection.close();
  if (options.strict && !result.ok) process.exitCode = 2;
}

if (require.main === module) main().catch(async (err) => {
  console.error('[audit-delivery-closeout-corrections] failed:', err && err.stack ? err.stack : err);
  try { await mongoose.connection.close(); } catch (_) {}
  process.exit(1);
});

module.exports = { audit };
