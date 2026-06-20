'use strict';

const crypto = require('crypto');
const BackgroundJob = require('../../models/BackgroundJob');
const auditService = require('../auditService');
const ArtifactStore = require('./GridFsArtifactStore');
const { makeId } = require('../../utils/common.util');
const { tenantIdOf } = require('../../utils/tenant.util');

const TERMINAL = new Set(['completed', 'failed', 'dead_letter', 'cancelled']);
const CANCELLABLE_WHILE_RUNNING = new Set(['export_excel', 'import_preview']);
const DEFAULT_LEASE_MS = Math.max(10_000, Number(process.env.BACKGROUND_JOB_LEASE_MS || 60_000));
const JOB_RETENTION_MS = Math.max(60_000, Number(process.env.BACKGROUND_JOB_RETENTION_MS || 7 * 24 * 60 * 60 * 1000));
const STACK_LIMIT = 8000;

function text(value) { return String(value ?? '').trim(); }
function clamp(value, min, max) { return Math.min(Math.max(Number(value) || 0, min), max); }
function retryDelayMs(attempt) {
  const base = Math.max(250, Number(process.env.BACKGROUND_JOB_RETRY_BASE_MS || 2000));
  const cap = Math.max(base, Number(process.env.BACKGROUND_JOB_RETRY_MAX_MS || 5 * 60 * 1000));
  return Math.min(cap, base * (2 ** Math.max(0, Number(attempt || 1) - 1)));
}
function actorName(actor = {}) { return text(actor.username || actor.fullName || actor.name || actor.code || 'system'); }
function publicJob(job = {}) {
  const row = typeof job.toObject === 'function' ? job.toObject() : { ...job };
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    progress: row.progress || { percent: 0, step: '' },
    attemptCount: row.attemptCount || 0,
    maxAttempts: row.maxAttempts || 0,
    result: row.result || {},
    error: row.lastError || {},
    artifact: row.artifact?.fileId ? {
      fileName: row.artifact.fileName,
      contentType: row.artifact.contentType,
      size: row.artifact.size,
      expiresAt: row.artifact.expiresAt,
      downloadUrl: `/api/background-jobs/${encodeURIComponent(row.id)}/artifact`
    } : null,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    availableAt: row.availableAt,
    cancelRequestedAt: row.cancelRequestedAt
  };
}

async function log(action, job, summary = {}) {
  return auditService.log(action, {
    tenantId: job.tenantId,
    refType: 'backgroundJob',
    refId: job.id,
    refCode: job.id,
    userName: job.createdBy || 'system',
    summary: { type: job.type, status: job.status, ...summary }
  });
}

async function enqueue(input = {}) {
  const tenantId = tenantIdOf({ tenantId: input.tenantId, user: input.actor });
  const idempotencyKey = text(input.idempotencyKey).slice(0, 240);
  if (idempotencyKey) {
    const existing = await BackgroundJob.findOne({ tenantId, idempotencyKey }).lean();
    if (existing) return { created: false, job: publicJob(existing) };
  }

  const now = new Date();
  const document = {
    id: text(input.id) || makeId('JOB'),
    tenantId,
    type: input.type,
    status: 'pending',
    idempotencyKey,
    payload: input.payload || {},
    progress: { percent: 0, step: 'queued', message: '' },
    attemptCount: 0,
    maxAttempts: clamp(input.maxAttempts || 3, 1, 10),
    timeoutMs: clamp(input.timeoutMs || 300000, 1000, 60 * 60 * 1000),
    availableAt: input.availableAt || now,
    createdBy: text(input.createdBy || actorName(input.actor)),
    createdAt: now,
    updatedAt: now,
    expireAt: new Date(now.getTime() + JOB_RETENTION_MS)
  };

  try {
    const created = await BackgroundJob.create(document);
    await log('BACKGROUND_JOB_QUEUED', created, { idempotencyKey: Boolean(idempotencyKey) });
    return { created: true, job: publicJob(created) };
  } catch (error) {
    if (error?.code === 11000 && idempotencyKey) {
      const existing = await BackgroundJob.findOne({ tenantId, idempotencyKey }).lean();
      if (existing) return { created: false, job: publicJob(existing) };
    }
    throw error;
  }
}

async function getById(id, actor = {}) {
  const tenantId = tenantIdOf({ user: actor, tenantId: actor.tenantId });
  const row = await BackgroundJob.findOne({ id: text(id), tenantId }).lean();
  return row ? publicJob(row) : null;
}

async function getRawById(id) {
  return BackgroundJob.findOne({ id: text(id) }).lean();
}

async function claimNext(workerId, options = {}) {
  const now = new Date();
  const leaseMs = Math.max(10_000, Number(options.leaseMs || DEFAULT_LEASE_MS));
  const types = Array.isArray(options.types) && options.types.length ? options.types : undefined;
  const eligibility = {
    ...(types ? { type: { $in: types } } : {}),
    $expr: { $lt: ['$attemptCount', '$maxAttempts'] },
    $or: [
      { status: 'pending', availableAt: { $lte: now } },
      { status: 'running', leaseExpiresAt: { $lt: now } }
    ]
  };
  const claimed = await BackgroundJob.findOneAndUpdate(
    eligibility,
    {
      $set: {
        status: 'running',
        leaseOwner: text(workerId),
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        lastHeartbeatAt: now,
        startedAt: now,
        updatedAt: now,
        'progress.step': 'starting'
      },
      $inc: { attemptCount: 1 }
    },
    { new: true, sort: { availableAt: 1, createdAt: 1 } }
  ).lean();
  if (claimed) await log('BACKGROUND_JOB_CLAIMED', claimed, { workerId: text(workerId), attemptCount: claimed.attemptCount });
  return claimed;
}

async function heartbeat(id, workerId, progress) {
  const now = new Date();
  const set = {
    leaseExpiresAt: new Date(now.getTime() + DEFAULT_LEASE_MS),
    lastHeartbeatAt: now,
    updatedAt: now
  };
  if (progress) set.progress = {
    percent: clamp(progress.percent, 0, 100),
    step: text(progress.step),
    message: text(progress.message).slice(0, 500)
  };
  return BackgroundJob.findOneAndUpdate(
    { id: text(id), status: { $in: ['running', 'cancel_requested'] }, leaseOwner: text(workerId) },
    { $set: set },
    { new: true }
  ).lean();
}

async function updateProgress(id, progress = {}) {
  return BackgroundJob.findOneAndUpdate(
    { id: text(id), status: { $in: ['running', 'cancel_requested'] } },
    { $set: {
      progress: {
        percent: clamp(progress.percent, 0, 100),
        step: text(progress.step),
        message: text(progress.message).slice(0, 500)
      },
      updatedAt: new Date()
    } },
    { new: true }
  ).lean();
}

async function complete(id, workerId, result = {}, artifact = null) {
  const now = new Date();
  const set = {
    status: 'completed',
    result: result || {},
    progress: { percent: 100, step: 'completed', message: '' },
    finishedAt: now,
    leaseOwner: '',
    leaseExpiresAt: null,
    updatedAt: now,
    expireAt: new Date(now.getTime() + JOB_RETENTION_MS)
  };
  if (artifact) set.artifact = artifact;
  const row = await BackgroundJob.findOneAndUpdate(
    { id: text(id), leaseOwner: text(workerId), status: { $in: ['running', 'cancel_requested'] } },
    { $set: set },
    { new: true }
  ).lean();
  if (row) await log('BACKGROUND_JOB_COMPLETED', row, { artifactSize: artifact?.size || 0 });
  return row;
}

function normalizeFailure(error = {}) {
  return {
    code: text(error.code || 'BACKGROUND_JOB_FAILED').slice(0, 100),
    message: text(error.message || error).slice(0, 1200),
    stack: text(error.stack).slice(0, STACK_LIMIT),
    retryable: error.retryable !== false,
    details: error.details || null
  };
}

async function fail(id, workerId, error = {}) {
  const current = await BackgroundJob.findOne({ id: text(id), leaseOwner: text(workerId) }).lean();
  if (!current) return null;
  const failure = normalizeFailure(error);
  const exhausted = current.attemptCount >= current.maxAttempts || failure.retryable === false;
  const now = new Date();
  const status = exhausted ? 'dead_letter' : 'pending';
  const update = {
    status,
    lastError: failure,
    failedAt: exhausted ? now : null,
    availableAt: exhausted ? current.availableAt : new Date(now.getTime() + retryDelayMs(current.attemptCount)),
    leaseOwner: '',
    leaseExpiresAt: null,
    updatedAt: now,
    progress: {
      percent: Number(current.progress?.percent || 0),
      step: exhausted ? 'dead_letter' : 'retry_wait',
      message: failure.message
    }
  };
  const row = await BackgroundJob.findOneAndUpdate(
    { id: current.id, leaseOwner: text(workerId) },
    { $set: update },
    { new: true }
  ).lean();
  if (row) await log(exhausted ? 'BACKGROUND_JOB_DEAD_LETTER' : 'BACKGROUND_JOB_RETRY_SCHEDULED', row, { errorCode: failure.code });
  return row;
}

async function requestCancel(id, actor = {}) {
  const tenantId = tenantIdOf({ user: actor, tenantId: actor.tenantId });
  const current = await BackgroundJob.findOne({ id: text(id), tenantId }).lean();
  if (!current) return { error: 'Không tìm thấy job', status: 404 };
  if (TERMINAL.has(current.status)) return { job: publicJob(current), unchanged: true };
  if (current.status === 'running' && !CANCELLABLE_WHILE_RUNNING.has(current.type)) {
    return { error: 'Job đang ghi dữ liệu không thể hủy giữa chừng; chỉ có thể hủy trước khi worker bắt đầu', status: 409, code: 'JOB_NOT_CANCELLABLE_RUNNING' };
  }
  const now = new Date();
  const status = current.status === 'pending' ? 'cancelled' : 'cancel_requested';
  const row = await BackgroundJob.findOneAndUpdate(
    { id: current.id, tenantId, status: current.status },
    { $set: {
      status,
      cancelRequestedAt: now,
      finishedAt: status === 'cancelled' ? now : null,
      updatedAt: now,
      progress: { percent: Number(current.progress?.percent || 0), step: status, message: 'Người dùng yêu cầu hủy' }
    } },
    { new: true }
  ).lean();
  if (row) await log('BACKGROUND_JOB_CANCEL_REQUESTED', row, { actor: actorName(actor) });
  return { job: publicJob(row || current) };
}

async function markCancelled(id, workerId, message = 'Job đã hủy an toàn') {
  const now = new Date();
  const row = await BackgroundJob.findOneAndUpdate(
    { id: text(id), leaseOwner: text(workerId), status: { $in: ['running', 'cancel_requested'] } },
    { $set: {
      status: 'cancelled',
      finishedAt: now,
      leaseOwner: '',
      leaseExpiresAt: null,
      updatedAt: now,
      progress: { percent: 0, step: 'cancelled', message: text(message) }
    } },
    { new: true }
  ).lean();
  if (row) await log('BACKGROUND_JOB_CANCELLED', row);
  return row;
}


async function deadLetterExpiredLeases(limit = 50) {
  const now = new Date();
  const rows = await BackgroundJob.find({
    status: 'running',
    leaseExpiresAt: { $lt: now },
    $expr: { $gte: ['$attemptCount', '$maxAttempts'] }
  }).limit(Math.max(1, Math.min(Number(limit || 50), 500))).lean();
  for (const row of rows) {
    await BackgroundJob.updateOne({ id: row.id, status: 'running', leaseExpiresAt: row.leaseExpiresAt }, { $set: {
      status: 'dead_letter',
      failedAt: now,
      finishedAt: now,
      leaseOwner: '',
      leaseExpiresAt: null,
      updatedAt: now,
      lastError: { code: 'BACKGROUND_JOB_LEASE_EXPIRED', message: 'Worker mất lease và đã hết số lần thử', retryable: false },
      progress: { percent: Number(row.progress?.percent || 0), step: 'dead_letter', message: 'Worker mất lease' }
    } });
  }
  return { deadLettered: rows.length };
}

async function cleanupExpiredArtifacts(limit = 50) {
  const now = new Date();
  const rows = await BackgroundJob.find({
    'artifact.fileId': { $ne: '' },
    'artifact.expiresAt': { $lte: now },
    $or: [{ 'artifact.deletedAt': null }, { 'artifact.deletedAt': { $exists: false } }]
  }).sort({ 'artifact.expiresAt': 1 }).limit(Math.max(1, Math.min(Number(limit || 50), 500))).lean();
  let deleted = 0;
  for (const row of rows) {
    await ArtifactStore.remove(row.artifact.fileId).catch(() => false);
    await BackgroundJob.updateOne({ id: row.id }, { $set: { 'artifact.deletedAt': now, updatedAt: now } });
    deleted += 1;
  }
  return { deleted };
}

async function waitForTerminal(id, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 300000));
  const pollMs = Math.max(100, Number(options.pollMs || 250));
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await getRawById(id);
    if (!row) return null;
    if (TERMINAL.has(row.status)) return row;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return null;
}

function makeIdempotencyKey(parts = []) {
  const raw = parts.map(text).join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

module.exports = {
  TERMINAL,
  CANCELLABLE_WHILE_RUNNING,
  DEFAULT_LEASE_MS,
  enqueue,
  getById,
  getRawById,
  claimNext,
  heartbeat,
  updateProgress,
  complete,
  fail,
  requestCancel,
  markCancelled,
  deadLetterExpiredLeases,
  cleanupExpiredArtifacts,
  waitForTerminal,
  retryDelayMs,
  makeIdempotencyKey,
  publicJob,
  _private: { normalizeFailure, clamp }
};
