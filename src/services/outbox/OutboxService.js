'use strict';

const os = require('node:os');
const OutboxEvent = require('../../models/OutboxEvent');
const dateUtil = require('../../utils/date.util');
const { makeId } = require('../../utils/common.util');
const { tenantIdOf } = require('../../utils/tenant.util');

function workerId() {
  return `${os.hostname()}:${process.pid}`;
}

function retryDelayMs(attempts) {
  return Math.min(15 * 60 * 1000, Math.max(1000, 1000 * (2 ** Math.min(Number(attempts || 0), 8))));
}

async function enqueue(event = {}, options = {}) {
  const now = dateUtil.nowIso();
  const document = {
    id: String(event.id || makeId('OBX')).trim(),
    tenantId: tenantIdOf({ tenantId: event.tenantId }),
    aggregateType: String(event.aggregateType || event.refType || 'system').trim(),
    aggregateId: String(event.aggregateId || event.refId || event.refCode || '').trim() || 'system',
    eventType: String(event.eventType || '').trim(),
    payload: event.payload || {},
    headers: event.headers || {},
    status: 'pending',
    attempts: 0,
    maxAttempts: Math.max(1, Number(event.maxAttempts || 10)),
    availableAt: event.availableAt || now,
    lockedAt: '',
    lockedBy: '',
    processedAt: '',
    lastError: '',
    createdAt: now,
    updatedAt: now
  };
  if (!document.eventType) throw new Error('Outbox event thiếu eventType');
  const created = await OutboxEvent.create([document], options.session ? { session: options.session } : undefined);
  return created[0];
}

async function claimNext(options = {}) {
  const now = dateUtil.nowIso();
  const staleBefore = new Date(Date.now() - Math.max(30000, Number(options.lockTimeoutMs || 120000))).toISOString();
  return OutboxEvent.findOneAndUpdate({
    $or: [
      { status: 'pending', availableAt: { $lte: now } },
      { status: 'processing', lockedAt: { $lt: staleBefore } }
    ],
    attempts: { $lt: Number(options.maxAttempts || 100) }
  }, {
    $set: {
      status: 'processing',
      lockedAt: now,
      lockedBy: options.workerId || workerId(),
      updatedAt: now
    },
    $inc: { attempts: 1 }
  }, {
    sort: { availableAt: 1, createdAt: 1 },
    new: true
  }).lean();
}

async function markProcessed(id, result = {}) {
  return OutboxEvent.findOneAndUpdate({ id }, {
    $set: {
      status: 'processed',
      processedAt: dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso(),
      lockedAt: '',
      lockedBy: '',
      lastError: '',
      'headers.result': result
    }
  }, { new: true }).lean();
}

async function markFailed(event = {}, error) {
  const attempts = Number(event.attempts || 1);
  const exhausted = attempts >= Number(event.maxAttempts || 10);
  const availableAt = new Date(Date.now() + retryDelayMs(attempts)).toISOString();
  return OutboxEvent.findOneAndUpdate({ id: event.id }, {
    $set: {
      status: exhausted ? 'failed' : 'pending',
      availableAt,
      updatedAt: dateUtil.nowIso(),
      lockedAt: '',
      lockedBy: '',
      lastError: String(error?.message || error || 'Unknown outbox error').slice(0, 2000)
    }
  }, { new: true }).lean();
}

async function stats(tenantId = '') {
  const match = tenantId ? { tenantId: tenantIdOf({ tenantId }) } : {};
  const rows = await OutboxEvent.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

module.exports = { enqueue, claimNext, markProcessed, markFailed, stats, retryDelayMs };
