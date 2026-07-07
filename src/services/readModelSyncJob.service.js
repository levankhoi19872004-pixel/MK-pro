'use strict';

const crypto = require('crypto');
const ReadModelSyncJob = require('../models/ReadModelSyncJob');
const arDebtReadModelProjector = require('./arDebtReadModelProjector.service');
const dateUtil = require('../utils/date.util');

const TYPE_AR_DEBT_READMODEL_SYNC = 'AR_DEBT_READMODEL_SYNC';
const DEFAULT_LIMIT = Math.max(1, Number(process.env.READMODEL_SYNC_DRAIN_LIMIT || 10));
let drainScheduled = false;
let drainRunning = false;

function clean(value = '') {
  return String(value ?? '').trim();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => clean(value))
    .filter(Boolean))];
}

function hashValues(values = []) {
  return crypto.createHash('sha1').update(unique(values).sort().join('|')).digest('hex').slice(0, 16);
}

function nowIso() {
  return dateUtil.nowIso ? dateUtil.nowIso() : new Date().toISOString();
}

function jobId(customerCode = '', sourceIds = []) {
  return `RMSJ:AR_DEBT:${clean(customerCode) || 'NO_CUSTOMER'}:${hashValues(sourceIds)}`;
}

function idempotencyKey(customerCode = '', sourceIds = []) {
  return `AR_DEBT_READMODEL_SYNC:${clean(customerCode) || 'NO_CUSTOMER'}:${hashValues(sourceIds)}`;
}

function normalizeJobPayload(payload = {}) {
  return {
    customerCode: clean(payload.customerCode),
    sourceIds: unique(payload.sourceIds),
    source: clean(payload.source || 'DELIVERY_CLOSEOUT'),
    actor: clean(payload.actor || 'accountant'),
    reason: clean(payload.reason || 'Delivery closeout read-model sync'),
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}
  };
}

async function enqueueArDebtSyncJobs(payload = {}, options = {}) {
  const normalized = normalizeJobPayload(payload);
  if (!normalized.customerCode && !normalized.sourceIds.length) {
    return { queued: 0, jobs: [], skipped: true, reason: 'empty_ar_debt_sync_payload' };
  }
  const id = jobId(normalized.customerCode, normalized.sourceIds);
  const idem = idempotencyKey(normalized.customerCode, normalized.sourceIds);
  const now = nowIso();
  const doc = {
    id,
    type: TYPE_AR_DEBT_READMODEL_SYNC,
    source: normalized.source,
    sourceIds: normalized.sourceIds,
    customerCode: normalized.customerCode,
    status: 'pending',
    attempts: 0,
    lastError: null,
    idempotencyKey: idem,
    createdAt: now,
    updatedAt: now,
    nextRunAt: now,
    processedAt: '',
    lockedAt: '',
    lockedBy: '',
    actor: normalized.actor,
    reason: normalized.reason,
    metadata: normalized.metadata
  };
  const insertOnlyDoc = {
    id: doc.id,
    type: doc.type,
    idempotencyKey: doc.idempotencyKey,
    attempts: doc.attempts,
    lastError: doc.lastError,
    createdAt: doc.createdAt,
    processedAt: doc.processedAt,
    lockedAt: doc.lockedAt,
    lockedBy: doc.lockedBy
  };
  const update = {
    $setOnInsert: insertOnlyDoc,
    $set: {
      status: 'pending',
      updatedAt: now,
      nextRunAt: now,
      sourceIds: normalized.sourceIds,
      customerCode: normalized.customerCode,
      actor: normalized.actor,
      reason: normalized.reason,
      source: normalized.source,
      metadata: normalized.metadata
    }
  };
  const result = await ReadModelSyncJob.updateOne({ idempotencyKey: idem }, update, { upsert: true, session: options.session });
  return {
    queued: 1,
    jobs: [{ id, idempotencyKey: idem, customerCode: normalized.customerCode, sourceIds: normalized.sourceIds }],
    result: {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount || 0,
      modifiedCount: result.modifiedCount || 0,
      upsertedCount: result.upsertedCount || 0
    }
  };
}

async function claimNextJob(options = {}) {
  const now = nowIso();
  const workerId = clean(options.workerId || `web-${process.pid}`);
  return ReadModelSyncJob.findOneAndUpdate(
    {
      type: TYPE_AR_DEBT_READMODEL_SYNC,
      status: 'pending',
      $or: [{ nextRunAt: { $lte: now } }, { nextRunAt: '' }, { nextRunAt: { $exists: false } }]
    },
    { $set: { status: 'running', lockedAt: now, lockedBy: workerId, updatedAt: now } },
    { sort: { createdAt: 1 }, new: true }
  ).lean();
}

async function markDone(job = {}, result = {}) {
  const now = nowIso();
  return ReadModelSyncJob.updateOne({ id: job.id }, {
    $set: { status: 'done', processedAt: now, updatedAt: now, result, lockedAt: '', lockedBy: '' }
  });
}

async function markFailed(job = {}, err = {}) {
  const attempts = Number(job.attempts || 0) + 1;
  const now = nowIso();
  const retryMs = Math.min(15 * 60 * 1000, Math.max(5000, attempts * attempts * 5000));
  const nextRunAt = new Date(Date.now() + retryMs).toISOString();
  const status = attempts >= Number(process.env.READMODEL_SYNC_MAX_ATTEMPTS || 5) ? 'failed' : 'pending';
  return ReadModelSyncJob.updateOne({ id: job.id }, {
    $set: {
      status,
      attempts,
      lastError: { code: clean(err.code || err.name || 'READMODEL_SYNC_FAILED'), message: clean(err.message || err), stack: clean(err.stack) },
      nextRunAt,
      updatedAt: now,
      lockedAt: '',
      lockedBy: ''
    }
  });
}

async function processJob(job = {}, options = {}) {
  const result = await arDebtReadModelProjector.projectArDebtReadModel(job, options);
  await markDone(job, result);
  return result;
}

async function drainPendingJobs(options = {}) {
  const limit = Math.max(1, Number(options.limit || DEFAULT_LIMIT));
  const processed = [];
  if (drainRunning && options.force !== true) return { ok: true, skipped: true, reason: 'drain_already_running', processed };
  drainRunning = true;
  try {
    for (let i = 0; i < limit; i += 1) {
      const job = await claimNextJob(options);
      if (!job) break;
      try {
        const result = await processJob(job, { actor: job.actor || options.actor, reason: job.reason || options.reason });
        processed.push({ id: job.id, ok: true, result });
      } catch (err) {
        await markFailed(job, err);
        processed.push({ id: job.id, ok: false, error: err.message, code: err.code });
      }
    }
    return { ok: true, processedCount: processed.length, processed };
  } finally {
    drainRunning = false;
  }
}

function scheduleDrain(options = {}) {
  if (drainScheduled) return { scheduled: false, reason: 'already_scheduled' };
  drainScheduled = true;
  const runner = () => {
    drainScheduled = false;
    drainPendingJobs({ ...options, limit: options.limit || DEFAULT_LIMIT }).catch((err) => {
      // Không ném lỗi ra request closeout. Job pending vẫn được retry ở lần drain sau.
      // eslint-disable-next-line no-console
      console.error('[AR_DEBT_READMODEL_SYNC_JOB] drain failed', err && (err.stack || err.message || err));
    });
  };
  const handle = setImmediate(runner);
  if (handle && typeof handle.unref === 'function') handle.unref();
  return { scheduled: true };
}

module.exports = {
  TYPE_AR_DEBT_READMODEL_SYNC,
  enqueueArDebtSyncJobs,
  scheduleDrain,
  drainPendingJobs,
  processJob,
  _internal: { jobId, idempotencyKey, normalizeJobPayload, claimNextJob, markDone, markFailed }
};
