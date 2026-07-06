'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { emitDomainEventSafe } = require('../src/services/events/domainEventBus');

test('domain event emit is best-effort and fast when MongoDB is not connected', async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  const started = Date.now();
  const result = await emitDomainEventSafe({
    eventType: 'AR_RECEIPT_CONFIRMED',
    entityType: 'debtCollection',
    entityId: 'UNIT-NO-DB',
    entityCode: 'UNIT-NO-DB',
    actor: { name: 'unit-test', role: 'accountant' },
    metadata: { customerCode: 'C01', customerName: 'Khách test', amount: 1000 },
    idempotencyKey: 'AR_RECEIPT_CONFIRMED:UNIT-NO-DB'
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 300, `emit waited ${elapsed}ms without MongoDB connection`);
  assert.equal(result.error, undefined);
  assert.equal(result.notifications.length, 0);
  assert.equal(result.auditEvent.persistenceReason, 'db_not_connected');
});
