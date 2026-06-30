'use strict';

const Journal = require('../models/Journal');
const ArLedger = require('../models/ArLedger');

const MIGRATION_ONLY_SERVICE = true;
const DIRECT_READ_SOURCE = 'AR_MIGRATION_AUDIT_DRY_RUN_ONLY';

function isArLike(row = {}) {
  const text = [row.account, row.type, row.refType, row.code, row.id]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return text.includes('ar')
    || text.includes('debt')
    || text.includes('receipt')
    || text.includes('return')
    || text.includes('sale')
    || text.includes('bonus')
    || text.includes('allowance')
    || text.includes('discount');
}

function assertMigrationDirectReadAllowed(options = {}) {
  const dryRunOnly = options.dryRun === true || options.auditOnly === true || options.migrationOnly === true;
  const env = String(process.env.NODE_ENV || '').toLowerCase();
  if (env === 'production' && process.env.ALLOW_AR_MIGRATION_DIRECT_READ !== 'true') {
    const err = new Error('DIRECT_AR_LEDGER_READ is migration/audit only and is blocked in production. Set ALLOW_AR_MIGRATION_DIRECT_READ=true only for an approved migration window.');
    err.code = 'AR_MIGRATION_DIRECT_READ_BLOCKED_IN_PRODUCTION';
    err.debtSource = DIRECT_READ_SOURCE;
    throw err;
  }
  if (!dryRunOnly && options.allowWrite !== true) {
    const err = new Error('arLedgerMigrationService is migration/audit only. Pass dryRun/auditOnly/migrationOnly, or allowWrite=true for an explicit migration apply.');
    err.code = 'AR_MIGRATION_SERVICE_NOT_RUNTIME';
    err.debtSource = DIRECT_READ_SOURCE;
    throw err;
  }
}

function cleanLedger(row = {}) {
  const { _id, __v, ...clean } = row;
  return {
    ...clean,
    account: clean.account || 'AR',
    status: clean.status || 'migration_pending_review',
    accountingConfirmed: clean.accountingConfirmed === true,
    source: clean.source || 'legacy_journals_backfill',
    migrationOnly: true,
    debtSource: DIRECT_READ_SOURCE,
    updatedAt: clean.updatedAt || new Date().toISOString()
  };
}

async function ensureArLedgersBackfillFromJournals({ logger = console, dryRun = true, auditOnly = false, migrationOnly = true, allowWrite = false } = {}) {
  assertMigrationDirectReadAllowed({ dryRun, auditOnly, migrationOnly, allowWrite });

  const currentCount = await ArLedger.countDocuments({}).catch(() => 0);
  if (currentCount > 0) return { skipped: true, reason: 'arLedgers_not_empty', count: currentCount, migrationOnly: true, debtSource: DIRECT_READ_SOURCE };

  const legacyRows = await Journal.find({}).lean().catch(() => []);
  const rows = legacyRows.filter(isArLike).map(cleanLedger);
  if (!rows.length) return { skipped: true, reason: 'no_legacy_journals', count: 0, migrationOnly: true, debtSource: DIRECT_READ_SOURCE };
  if (dryRun || auditOnly) {
    return { dryRun: true, skipped: false, plannedInsert: rows.length, source: 'journals', target: 'arLedgers', migrationOnly: true, debtSource: DIRECT_READ_SOURCE };
  }

  await ArLedger.insertMany(rows, { ordered: false }).catch(async (error) => {
    // Nếu có duplicate key ở môi trường đã tự tạo index unique, fallback upsert từng dòng.
    logger.warn?.({ err: error }, 'Bulk backfill arLedgers failed, fallback to upsert');
    for (const row of rows) {
      const filter = row.id ? { id: row.id } : (row.code ? { code: row.code } : null);
      if (filter) await ArLedger.findOneAndUpdate(filter, row, { upsert: true, new: true });
    }
  });
  return { skipped: false, inserted: rows.length, source: 'journals', target: 'arLedgers', migrationOnly: true, debtSource: DIRECT_READ_SOURCE };
}

module.exports = {
  MIGRATION_ONLY_SERVICE,
  DIRECT_READ_SOURCE,
  assertMigrationDirectReadAllowed,
  ensureArLedgersBackfillFromJournals
};
