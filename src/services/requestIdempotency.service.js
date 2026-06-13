'use strict';

const crypto = require('crypto');
const IdempotencyRequest = require('../models/IdempotencyRequest');

const DEFAULT_TTL_MS = Math.max(60_000, Number(process.env.REQUEST_IDEMPOTENCY_TTL_MS || 24 * 60 * 60 * 1000));
const PROCESSING_TIMEOUT_MS = Math.max(30_000, Number(process.env.REQUEST_IDEMPOTENCY_PROCESSING_TIMEOUT_MS || 5 * 60 * 1000));

function text(value) {
  return String(value || '').trim();
}

function buildPersistentKey(scope, actorCode, requestKey) {
  const raw = [text(scope), text(actorCode), text(requestKey)].join('|');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function applySession(query, session) {
  if (session && query && typeof query.session === 'function') return query.session(session);
  return query;
}

async function findRequest(key, options = {}) {
  let query = IdempotencyRequest.findOne({ key });
  query = applySession(query, options.session);
  return query.lean();
}

async function beginRequest({ scope, actorCode, requestKey, ttlMs = DEFAULT_TTL_MS }, options = {}) {
  const key = buildPersistentKey(scope, actorCode, requestKey);
  const existing = await findRequest(key, options);
  if (existing && existing.status === 'completed' && existing.response) {
    return { key, replay: true, response: existing.response };
  }
  const now = new Date();
  if (existing && existing.status === 'processing') {
    const lastTouchedAt = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const stale = Number.isFinite(lastTouchedAt) && (now.getTime() - lastTouchedAt) > PROCESSING_TIMEOUT_MS;
    if (stale) {
      const reclaimFilter = {
        key,
        status: 'processing',
        ...(existing.updatedAt ? { updatedAt: existing.updatedAt } : {})
      };
      const reclaimUpdate = {
        $set: {
          scope: text(scope),
          actorCode: text(actorCode),
          requestKey: text(requestKey).slice(0, 200),
          updatedAt: now,
          expiresAt: new Date(now.getTime() + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS))
        },
        $unset: { response: '', completedAt: '' }
      };
      const reclaimed = await IdempotencyRequest.updateOne(
        reclaimFilter,
        reclaimUpdate,
        options.session ? { session: options.session } : {}
      );
      if (Number(reclaimed && (reclaimed.modifiedCount ?? reclaimed.nModified ?? reclaimed.matchedCount ?? reclaimed.n)) > 0) {
        return { key, replay: false, recovered: true };
      }
    }

    const err = new Error('Yêu cầu trùng đang được xử lý');
    err.status = 409;
    err.code = 'IDEMPOTENCY_IN_PROGRESS';
    throw err;
  }


  const doc = {
    key,
    scope: text(scope),
    actorCode: text(actorCode),
    requestKey: text(requestKey).slice(0, 200),
    status: 'processing',
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + Math.max(60_000, Number(ttlMs) || DEFAULT_TTL_MS))
  };

  try {
    await IdempotencyRequest.create([doc], options.session ? { session: options.session } : {});
  } catch (err) {
    if (err && err.code === 11000) {
      const duplicate = await findRequest(key, options);
      if (duplicate && duplicate.status === 'completed' && duplicate.response) {
        return { key, replay: true, response: duplicate.response };
      }
      const conflict = new Error('Yêu cầu trùng đang được xử lý');
      conflict.status = 409;
      conflict.code = 'IDEMPOTENCY_IN_PROGRESS';
      throw conflict;
    }
    throw err;
  }

  return { key, replay: false };
}

async function completeRequest(key, response, options = {}) {
  const update = {
    $set: {
      status: 'completed',
      response,
      completedAt: new Date(),
      updatedAt: new Date()
    }
  };
  return IdempotencyRequest.updateOne({ key }, update, options.session ? { session: options.session } : {});
}

module.exports = {
  buildPersistentKey,
  findRequest,
  beginRequest,
  completeRequest
};
