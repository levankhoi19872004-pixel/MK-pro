'use strict';

const crypto = require('node:crypto');
const mongoose = require('mongoose');
const AuditEvent = require('../../models/AuditEvent');
const { EVENT_DEFAULTS, SEVERITY } = require('./domainEventTypes');

function text(value = '') {
  return String(value ?? '').trim();
}

function nowDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function makeId(prefix = 'AE') {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function capObject(value, maxBytes = 20000) {
  if (!value || typeof value !== 'object') return value || {};
  const json = stableJson(value);
  if (Buffer.byteLength(json, 'utf8') <= maxBytes) return value;
  return {
    _truncated: true,
    _bytes: Buffer.byteLength(json, 'utf8'),
    _hash: crypto.createHash('sha1').update(json).digest('hex')
  };
}

function normalizeActor(actor = {}) {
  if (typeof actor === 'string') {
    return { userId: '', code: '', name: text(actor) || 'system', role: '' };
  }
  return {
    userId: text(actor.userId || actor.id || actor._id),
    code: text(actor.code || actor.staffCode || actor.username || actor.email),
    name: text(actor.name || actor.fullName || actor.username || actor.code || actor.staffCode || actor.email || 'system'),
    role: text(actor.role || actor.actorRole)
  };
}


function isMongooseReady() {
  return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
}

function sourceFromRequest(req = {}) {
  if (!req || typeof req !== 'object') return {};
  return {
    route: text(req.originalUrl || req.url || req.path),
    method: text(req.method),
    ip: text(req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress),
    userAgent: text(req.headers?.['user-agent'])
  };
}

function normalizeDomainEvent(event = {}) {
  const eventType = text(event.eventType).toUpperCase();
  if (!eventType) throw new Error('Domain event thiếu eventType');
  const defaults = EVENT_DEFAULTS[eventType] || {};
  const actor = normalizeActor(event.actor || {});
  const occurredAt = nowDate(event.occurredAt || event.createdAt);
  return {
    id: text(event.id) || makeId('AE'),
    idempotencyKey: text(event.idempotencyKey),
    eventType,
    module: text(event.module || defaults.module || 'system'),
    entityType: text(event.entityType || defaults.entityType || ''),
    entityId: text(event.entityId || event.id || ''),
    entityCode: text(event.entityCode || event.code || ''),
    severity: text(event.severity || defaults.severity || SEVERITY.INFO).toLowerCase(),
    actorUserId: actor.userId,
    actorCode: actor.code,
    actorName: actor.name,
    actorRole: actor.role,
    before: capObject(event.before || {}),
    after: capObject(event.after || {}),
    diff: capObject(event.diff || {}),
    metadata: capObject(event.metadata || {}),
    source: capObject(event.source || {}),
    occurredAt,
    createdAt: nowDate(event.createdAt || occurredAt)
  };
}

async function record(event = {}, options = {}) {
  const normalized = normalizeDomainEvent(event);
  if (!isMongooseReady()) {
    return { ...normalized, persistenceStatus: 'skipped', persistenceReason: 'db_not_connected' };
  }
  const query = normalized.idempotencyKey
    ? { eventType: normalized.eventType, idempotencyKey: normalized.idempotencyKey }
    : { id: normalized.id };
  const update = { $setOnInsert: normalized };
  const mongoOptions = { upsert: true, new: true, setDefaultsOnInsert: true };
  if (options.session) mongoOptions.session = options.session;
  const saved = await AuditEvent.findOneAndUpdate(query, update, mongoOptions).lean();
  return saved || normalized;
}

module.exports = {
  record,
  normalizeActor,
  normalizeDomainEvent,
  sourceFromRequest,
  isMongooseReady,
  _private: { stableJson, capObject, makeId, text, isMongooseReady }
};
