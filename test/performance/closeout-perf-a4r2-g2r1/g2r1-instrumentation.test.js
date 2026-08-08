'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const monitor = require('../../../src/middlewares/apiMonitor.middleware');

test('G2R1 telemetry exposes mutually-exclusive physical Mongo counters', async () => {
  assert.equal(typeof monitor._private.createMetricStore, 'function');
  assert.equal(typeof monitor._private.runWithMetricStoreForTest, 'function');
  assert.equal(typeof monitor._private.recordPhysicalMongoCommand, 'function');

  const store = monitor._private.createMetricStore();
  await monitor._private.runWithMetricStoreForTest(store, async () => {
    monitor._private.recordPhysicalMongoCommand('queryExec');
    monitor._private.recordPhysicalMongoCommand('aggregateExec');
    monitor._private.recordPhysicalMongoCommand('bulkWrite', { bulkOperationCount: 5 });
    monitor._private.recordPhysicalMongoCommand('modelCreateSave');
  });

  assert.equal(store.dbQueries, 2, 'legacy dbQueries remains Query/Aggregate visible count');
  assert.equal(store.queryExecCount, 1);
  assert.equal(store.aggregateExecCount, 1);
  assert.equal(store.bulkWriteCommandCount, 1);
  assert.equal(store.bulkOperationCount, 5);
  assert.equal(store.modelCreateSaveCommandCount, 1);
  assert.equal(store.physicalMongoCommandCount, 4);
});

test('G2R1 one bulkWrite with five operations counts as one physical command', async () => {
  const store = monitor._private.createMetricStore();
  await monitor._private.runWithMetricStoreForTest(store, async () => {
    monitor._private.recordPhysicalMongoCommand('bulkWrite', { bulkOperationCount: 5 });
  });
  assert.deepEqual({
    dbQueries: store.dbQueries,
    bulkWriteCommandCount: store.bulkWriteCommandCount,
    bulkOperationCount: store.bulkOperationCount,
    physicalMongoCommandCount: store.physicalMongoCommandCount
  }, { dbQueries: 0, bulkWriteCommandCount: 1, bulkOperationCount: 5, physicalMongoCommandCount: 1 });
});

test('G2R1 telemetry accounting failure is fail-open to business execution', async () => {
  const store = monitor._private.createMetricStore();
  Object.defineProperty(store, 'bulkWriteCommandCount', { get() { throw new Error('telemetry failure'); }, configurable: true });
  await assert.doesNotReject(async () => {
    await monitor._private.runWithMetricStoreForTest(store, async () => {
      monitor._private.recordPhysicalMongoCommand('bulkWrite', { bulkOperationCount: 2 });
      return 'business-ok';
    });
  });
});

test('G2R1 patched Query/Aggregate/bulkWrite/save operations produce truthful mutually-exclusive counts', async () => {
  function FakeQuery() {}
  FakeQuery.prototype.exec = async function() { return [{ id: 1 }]; };
  FakeQuery.prototype.getQuery = function() { return { orderId: 'SO1' }; };
  FakeQuery.prototype.getOptions = function() { return {}; };
  function FakeAggregate() { this._pipeline = [{ $match: { orderId: 'SO1' } }]; }
  FakeAggregate.prototype.exec = async function() { return [{ id: 1 }]; };
  function FakeModel() {}
  FakeModel.bulkWrite = async function(operations) { return { matchedCount: operations.length }; };
  FakeModel.prototype.save = async function() {
    // Simulate an implementation detail that invokes Query.exec. The save owner must
    // suppress nested Query accounting so one physical write is not double-counted.
    const q = new FakeQuery();
    q.model = { modelName: 'NestedQuery', collection: { name: 'nested' } };
    await q.exec();
    return this;
  };
  const fakeMongoose = { Query: FakeQuery, Aggregate: FakeAggregate, Model: FakeModel };
  monitor._private.patchMongooseApiMonitorForTest(fakeMongoose);
  const store = monitor._private.createMetricStore();
  await monitor._private.runWithMetricStoreForTest(store, async () => {
    const q = new FakeQuery();
    q.model = { modelName: 'SalesOrder', collection: { name: 'salesorders' } };
    q.op = 'find';
    await q.exec();
    const agg = new FakeAggregate();
    agg._model = { modelName: 'ArLedger', collection: { name: 'arledgers' } };
    await agg.exec();
    await FakeModel.bulkWrite.call({ modelName: 'OrderPaymentAllocation' }, Array.from({ length: 5 }, () => ({ updateOne: { filter: {}, update: { $set: { status: 'posted' } } } })));
    await FakeModel.prototype.save.call({ constructor: { modelName: 'AuditLog' } });
  });
  assert.equal(store.queryExecCount, 1);
  assert.equal(store.aggregateExecCount, 1);
  assert.equal(store.bulkWriteCommandCount, 1);
  assert.equal(store.bulkOperationCount, 5);
  assert.equal(store.modelCreateSaveCommandCount, 1);
  assert.equal(store.dbQueries, 2);
  assert.equal(store.physicalMongoCommandCount, 4);
});

test('G2R1 actual bulkWrite retry attempts each count as a physical command', async () => {
  function FakeModel() {}
  let attempts = 0;
  FakeModel.bulkWrite = async function() {
    attempts += 1;
    if (attempts === 1) throw new Error('transient');
    return { matchedCount: 1 };
  };
  const fakeMongoose = { Model: FakeModel };
  monitor._private.patchMongooseApiMonitorForTest(fakeMongoose);
  const store = monitor._private.createMetricStore();
  await monitor._private.runWithMetricStoreForTest(store, async () => {
    await assert.rejects(() => FakeModel.bulkWrite([{ updateOne: { filter: {}, update: { $set: { x: 1 } } } }]), /transient/);
    await FakeModel.bulkWrite([{ updateOne: { filter: {}, update: { $set: { x: 1 } } } }]);
  });
  assert.equal(store.bulkWriteCommandCount, 2);
  assert.equal(store.bulkOperationCount, 2);
  assert.equal(store.physicalMongoCommandCount, 2);
});


test('G2R1 Model.create that reaches save is counted once without double-count', async () => {
  function FakeQuery() {}
  FakeQuery.prototype.exec = async function() { return { acknowledged: true }; };
  FakeQuery.prototype.getQuery = function() { return {}; };
  FakeQuery.prototype.getOptions = function() { return {}; };
  function FakeModel() {}
  FakeModel.prototype.save = async function() {
    const q = new FakeQuery();
    q.model = { modelName: 'NestedInsert', collection: { name: 'auditlogs' } };
    q.op = 'updateOne';
    await q.exec();
    return this;
  };
  FakeModel.create = async function(doc) {
    const instance = Object.assign(new FakeModel(), doc);
    await instance.save();
    return instance;
  };
  const fakeMongoose = { Query: FakeQuery, Model: FakeModel };
  monitor._private.patchMongooseApiMonitorForTest(fakeMongoose);
  const store = monitor._private.createMetricStore();
  await monitor._private.runWithMetricStoreForTest(store, async () => {
    await FakeModel.create({ action: 'closeout' });
  });
  assert.equal(store.modelCreateSaveCommandCount, 1);
  assert.equal(store.queryExecCount, 0, 'nested lower-level query from save/create must not be double-counted');
  assert.equal(store.dbQueries, 0);
  assert.equal(store.physicalMongoCommandCount, 1);
});
