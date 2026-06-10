'use strict';

const mongoose = require('mongoose');
const EventLog = require('../models/EventLog');
const dateUtil = require('../utils/date.util');
const { makeId } = require('../utils/common.util');

function normalizeKey(value = '') {
  return String(value || '').trim();
}

function buildEventIdempotencyKey(event = {}) {
  const eventType = normalizeKey(event.eventType || event.type || 'EVENT').toUpperCase();
  const aggregateType = normalizeKey(event.aggregateType || event.sourceType || event.refType || 'DOCUMENT').toUpperCase();
  const aggregateId = normalizeKey(event.aggregateId || event.sourceId || event.refId || event.id || event.code);
  const aggregateCode = normalizeKey(event.aggregateCode || event.sourceCode || event.refCode || event.code);
  const source = normalizeKey(event.source || 'system').toUpperCase();
  const identity = aggregateId || aggregateCode;
  if (!identity) return '';
  return [eventType, aggregateType, identity, source].join('|');
}

async function recordEvent(event = {}, options = {}) {
  if (options.disableEventLog) return null;
  // Khi chạy unit test không kết nối Mongo, không để event log gây treo do mongoose buffering.
  if (mongoose.connection.readyState !== 1) return null;

  const eventType = normalizeKey(event.eventType || event.type || 'EVENT').toUpperCase();
  const aggregateType = normalizeKey(event.aggregateType || event.sourceType || event.refType || 'DOCUMENT').toUpperCase();
  const aggregateId = normalizeKey(event.aggregateId || event.sourceId || event.refId || event.id || event.code);
  const aggregateCode = normalizeKey(event.aggregateCode || event.sourceCode || event.refCode || event.code);
  const idempotencyKey = normalizeKey(event.idempotencyKey || buildEventIdempotencyKey({ ...event, eventType, aggregateType, aggregateId, aggregateCode }));
  if (!eventType || !idempotencyKey) return null;

  const doc = {
    id: normalizeKey(event.id || makeId('EV')),
    eventType,
    aggregateType,
    aggregateId,
    aggregateCode,
    idempotencyKey,
    source: normalizeKey(event.source || 'ledger_posting'),
    sourceType: normalizeKey(event.sourceType || aggregateType),
    sourceId: normalizeKey(event.sourceId || aggregateId),
    sourceCode: normalizeKey(event.sourceCode || aggregateCode),
    refType: normalizeKey(event.refType || event.sourceType || aggregateType),
    refId: normalizeKey(event.refId || aggregateId),
    refCode: normalizeKey(event.refCode || aggregateCode),
    status: normalizeKey(event.status || 'recorded'),
    payload: event.payload || {},
    metadata: event.metadata || {},
    createdBy: normalizeKey(event.createdBy || options.user || options.createdBy || ''),
    createdAt: event.createdAt || dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };

  try {
    return await EventLog.findOneAndUpdate(
      { idempotencyKey },
      { $setOnInsert: doc },
      { upsert: true, new: true, ...(options.session ? { session: options.session } : {}) }
    ).lean();
  } catch (error) {
    if (error && (error.code === 11000 || String(error.message || '').includes('duplicate key'))) {
      return EventLog.findOne({ idempotencyKey }).lean().catch(() => null);
    }
    // Event log không được làm fail nghiệp vụ chính.
    return null;
  }
}

module.exports = { recordEvent, buildEventIdempotencyKey };
