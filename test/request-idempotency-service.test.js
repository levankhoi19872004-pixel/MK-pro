'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const IdempotencyRequest = require('../src/models/IdempotencyRequest');
const service = require('../src/services/requestIdempotency.service');

function patch(target, replacements) {
  const originals = {};
  for (const [key, value] of Object.entries(replacements)) {
    originals[key] = target[key];
    target[key] = value;
  }
  return () => Object.entries(originals).forEach(([key, value]) => { target[key] = value; });
}

function query(value) {
  return {
    session() { return this; },
    lean: async () => (typeof value === 'function' ? value() : value)
  };
}

test('persistent request idempotency replays the committed response', async () => {
  const store = new Map();
  const restore = patch(IdempotencyRequest, {
    findOne: ({ key }) => query(() => store.get(key) || null),
    create: async (rows) => {
      for (const row of rows) {
        if (store.has(row.key)) {
          const err = new Error('duplicate');
          err.code = 11000;
          throw err;
        }
        store.set(row.key, { ...row });
      }
      return rows;
    },
    updateOne: async ({ key }, update) => {
      Object.assign(store.get(key), update.$set || {});
      return { matchedCount: 1, modifiedCount: 1 };
    }
  });

  try {
    const first = await service.beginRequest({ scope: 'test.create', actorCode: 'NV01', requestKey: 'REQ-1' });
    assert.equal(first.replay, false);
    const response = { statusCode: 201, body: { ok: true, id: 'SO-1' } };
    await service.completeRequest(first.key, response);

    const replay = await service.beginRequest({ scope: 'test.create', actorCode: 'NV01', requestKey: 'REQ-1' });
    assert.equal(replay.replay, true);
    assert.deepEqual(replay.response, response);
  } finally {
    restore();
  }
});

test('persistent request idempotency rejects a duplicate still in progress', async () => {
  const store = new Map();
  const restore = patch(IdempotencyRequest, {
    findOne: ({ key }) => query(() => store.get(key) || null),
    create: async (rows) => { rows.forEach((row) => store.set(row.key, { ...row })); return rows; },
    updateOne: async () => ({ modifiedCount: 1 })
  });

  try {
    await service.beginRequest({ scope: 'test.update', actorCode: 'NV02', requestKey: 'REQ-2' });
    await assert.rejects(
      () => service.beginRequest({ scope: 'test.update', actorCode: 'NV02', requestKey: 'REQ-2' }),
      (err) => err && err.status === 409 && err.code === 'IDEMPOTENCY_IN_PROGRESS'
    );
  } finally {
    restore();
  }
});

test('stale processing idempotency request can be safely reclaimed', async () => {
  const store = new Map();
  const key = service.buildPersistentKey('test.stale', 'NV03', 'REQ-3');
  const staleAt = new Date(Date.now() - 60 * 60 * 1000);
  store.set(key, {
    key,
    scope: 'test.stale',
    actorCode: 'NV03',
    requestKey: 'REQ-3',
    status: 'processing',
    createdAt: staleAt,
    updatedAt: staleAt
  });
  const restore = patch(IdempotencyRequest, {
    findOne: ({ key: lookup }) => query(() => store.get(lookup) || null),
    create: async () => { throw new Error('stale row must be reclaimed, not inserted'); },
    updateOne: async (filter, update) => {
      const row = store.get(filter.key);
      if (!row || row.status !== filter.status) return { matchedCount: 0, modifiedCount: 0 };
      if (filter.updatedAt && row.updatedAt.getTime() !== new Date(filter.updatedAt).getTime()) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(row, update.$set || {});
      for (const field of Object.keys(update.$unset || {})) delete row[field];
      return { matchedCount: 1, modifiedCount: 1 };
    }
  });

  try {
    const result = await service.beginRequest({ scope: 'test.stale', actorCode: 'NV03', requestKey: 'REQ-3' });
    assert.equal(result.replay, false);
    assert.equal(result.recovered, true);
    assert.ok(store.get(key).updatedAt > staleAt);
  } finally {
    restore();
  }
});
