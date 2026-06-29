#!/usr/bin/env node
'use strict';

try { require('dotenv').config(); } catch (_) {}

const { auditArLedgerIntegrity } = require('./audit-ar-ledger-integrity');

const PROPOSED_INDEX = Object.freeze({ tenantId: 1, idempotencyKey: 1 });
const PROPOSED_OPTIONS = Object.freeze({
  name: 'uniq_ar_return_active_idempotency_phase65_candidate',
  unique: true,
  partialFilterExpression: {
    category: 'AR-RETURN',
    idempotencyKey: { $exists: true, $type: 'string', $ne: '' },
    status: { $nin: ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed', 'reversed', 'superseded'] },
    accountingStatus: { $nin: ['void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed', 'reversed', 'superseded'] },
    reversed: { $ne: true },
    isDeleted: { $ne: true }
  }
});

const P0_BLOCKERS = new Set([
  'DUPLICATE_ACTIVE_IDEMPOTENCY',
  'AR_RETURN_DEBIT_POSITIVE',
  'AR_RETURN_CODE_CONTAINS_REV',
  'DEBIT_DIRECTION_CONFLICT',
  'CREDIT_DIRECTION_CONFLICT'
]);

function blockersFromAudit(audit = {}) {
  return (audit.issues || []).filter((issue) => P0_BLOCKERS.has(issue.issue));
}

function checkIndexReadiness(ledgers = []) {
  const audit = auditArLedgerIntegrity(ledgers);
  const blockers = blockersFromAudit(audit);
  return {
    mode: 'check-only',
    dryRun: true,
    apply: false,
    indexCreated: false,
    generatedAt: new Date().toISOString(),
    proposedIndex: PROPOSED_INDEX,
    proposedOptions: PROPOSED_OPTIONS,
    okToCreateLater: blockers.length === 0,
    blockers,
    totals: {
      blockers: blockers.length,
      duplicateActiveIdempotency: blockers.filter((item) => item.issue === 'DUPLICATE_ACTIVE_IDEMPOTENCY').length,
      arReturnDebitPositive: blockers.filter((item) => item.issue === 'AR_RETURN_DEBIT_POSITIVE').length,
      arReturnCodeContainsRev: blockers.filter((item) => item.issue === 'AR_RETURN_CODE_CONTAINS_REV').length,
      directionConflict: blockers.filter((item) => item.issue === 'DEBIT_DIRECTION_CONFLICT' || item.issue === 'CREDIT_DIRECTION_CONFLICT').length
    }
  };
}

function printHuman(result) {
  console.log('AR-RETURN active idempotency index readiness (check-only/dry-run)');
  console.log('='.repeat(72));
  console.log('Không tạo index trong Phase65. Không auto-run khi app start.');
  console.log(`Proposed index: ${JSON.stringify(result.proposedIndex)} name=${result.proposedOptions.name}`);
  console.log(`P0 blockers: ${result.totals.blockers}`);
  console.log(`- duplicate active idempotency: ${result.totals.duplicateActiveIdempotency}`);
  console.log(`- AR-RETURN debit positive: ${result.totals.arReturnDebitPositive}`);
  console.log(`- AR-RETURN code/id chứa REV: ${result.totals.arReturnCodeContainsRev}`);
  console.log(`- direction conflict: ${result.totals.directionConflict}`);
  console.log(result.okToCreateLater ? 'READY_FOR_MANUAL_INDEX_PHASE_LATER' : 'ABORT_INDEX_DUE_TO_P0_BLOCKERS');
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  if (args.includes('--apply')) {
    throw new Error('Phase65 chỉ check/dry-run. Không bật unique index trong script này.');
  }
  await require('../src/config/db')();
  const ArLedger = require('../src/models/ArLedger');
  const ledgers = await ArLedger.find({})
    .select('_id id code tenantId type ledgerType category status lifecycleStatus accountingStatus accountingConfirmed accountingBatchId reversed isDeleted deleted deletedAt entryType sourceAction refType amount debit credit direction idempotencyKey source sourceType sourceModel sourceId sourceCode refId refCode returnOrderId returnOrderCode customerId customerCode customerName orderId orderCode salesOrderId salesOrderCode sourceOrderId sourceOrderCode createdAt updatedAt')
    .lean();
  const result = checkIndexReadiness(ledgers);
  if (json) console.log(JSON.stringify(result, null, 2));
  else printHuman(result);
  await require('mongoose').connection.close();
  if (!result.okToCreateLater) process.exitCode = 2;
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('[create-ar-return-active-idempotency-index] failed:', err.message);
    try { await require('mongoose').connection.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = {
  checkIndexReadiness,
  blockersFromAudit,
  PROPOSED_INDEX,
  PROPOSED_OPTIONS,
  P0_BLOCKERS
};
