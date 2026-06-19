'use strict';

const Journal = require('../models/Journal');
const ArLedger = require('../models/ArLedger');

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

function cleanLedger(row = {}) {
  const { _id, __v, ...clean } = row;
  return {
    ...clean,
    account: clean.account || 'AR',
    status: clean.status || 'migration_pending_review',
    accountingConfirmed: clean.accountingConfirmed === true,
    source: clean.source || 'legacy_journals_backfill',
    updatedAt: clean.updatedAt || new Date().toISOString()
  };
}

async function ensureArLedgersBackfillFromJournals({ logger = console } = {}) {
  const currentCount = await ArLedger.countDocuments({}).catch(() => 0);
  if (currentCount > 0) return { skipped: true, reason: 'arLedgers_not_empty', count: currentCount };

  const legacyRows = await Journal.find({}).lean().catch(() => []);
  const rows = legacyRows.filter(isArLike).map(cleanLedger);
  if (!rows.length) return { skipped: true, reason: 'no_legacy_journals', count: 0 };

  await ArLedger.insertMany(rows, { ordered: false }).catch(async (error) => {
    // Nếu có duplicate key ở môi trường đã tự tạo index unique, fallback upsert từng dòng.
    logger.warn?.({ err: error }, 'Bulk backfill arLedgers failed, fallback to upsert');
    for (const row of rows) {
      const filter = row.id ? { id: row.id } : (row.code ? { code: row.code } : null);
      if (filter) await ArLedger.findOneAndUpdate(filter, row, { upsert: true, new: true });
    }
  });
  return { skipped: false, inserted: rows.length, source: 'journals', target: 'arLedgers' };
}

module.exports = { ensureArLedgersBackfillFromJournals };
