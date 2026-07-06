'use strict';

const Notification = require('../../models/Notification');
const AuditEvent = require('../../models/AuditEvent');
const { resolveRecipients } = require('./notificationRecipientResolver');
const notificationFormatter = require('./notificationFormatter');
const { isMongooseReady } = require('./auditEventService');

function text(value = '') {
  return String(value ?? '').trim();
}

function objectIdOrString(value = '') {
  return text(value && value._id ? value._id : value);
}

function idLookup(id = '') {
  const value = text(id);
  const or = [{ id: value }];
  if (/^[a-fA-F0-9]{24}$/.test(value)) or.unshift({ _id: value });
  return or;
}

function canSeeRawAudit(user = {}) {
  return ['admin', 'manager', 'accountant'].includes(text(user.role).toLowerCase());
}

function publicAuditEvent(row = {}, user = {}) {
  if (!row) return null;
  const base = {
    id: objectIdOrString(row._id || row.id),
    eventType: row.eventType || '',
    module: row.module || '',
    entityType: row.entityType || '',
    entityId: row.entityId || '',
    entityCode: row.entityCode || '',
    severity: row.severity || 'info',
    actorName: row.actorName || '',
    actorCode: row.actorCode || '',
    actorRole: row.actorRole || '',
    diff: row.diff || {},
    metadata: row.metadata || {},
    occurredAt: row.occurredAt || row.createdAt || null
  };
  if (canSeeRawAudit(user)) {
    base.before = row.before || {};
    base.after = row.after || {};
    base.source = row.source || {};
  }
  return base;
}

function publicNotification(row = {}) {
  return {
    id: objectIdOrString(row._id || row.id),
    title: row.title || '',
    message: row.message || '',
    eventType: row.eventType || '',
    module: row.module || '',
    severity: row.severity || 'info',
    entityType: row.entityType || '',
    entityId: row.entityId || '',
    entityCode: row.entityCode || '',
    actorName: row.actorName || '',
    actorCode: row.actorCode || '',
    actionUrl: row.actionUrl || '',
    actionLabel: row.actionLabel || 'Xem',
    readAt: row.readAt || null,
    createdAt: row.createdAt || null,
    metadata: row.metadata || {}
  };
}

async function createForAuditEvent(auditEvent = {}, options = {}) {
  if (!auditEvent || auditEvent.persistenceReason === 'db_not_connected' || !isMongooseReady()) return [];
  const recipients = await resolveRecipients(auditEvent);
  if (!recipients.length) return [];
  const formatted = notificationFormatter.format(auditEvent);
  const created = [];
  for (const recipient of recipients) {
    const recipientUserId = text(recipient.userId);
    if (!recipientUserId) continue;
    const idempotencyKey = auditEvent.idempotencyKey
      ? `${auditEvent.eventType}:${auditEvent.idempotencyKey}:${recipientUserId}`
      : `${auditEvent.id || auditEvent._id}:${recipientUserId}`;
    const doc = {
      idempotencyKey,
      auditEventId: objectIdOrString(auditEvent._id || auditEvent.id),
      title: formatted.title,
      message: formatted.message,
      eventType: auditEvent.eventType,
      module: auditEvent.module,
      severity: auditEvent.severity || 'info',
      entityType: auditEvent.entityType,
      entityId: auditEvent.entityId,
      entityCode: auditEvent.entityCode,
      recipientUserId,
      recipientRole: recipient.role || '',
      readAt: null,
      dismissedAt: null,
      actionUrl: formatted.actionUrl,
      actionLabel: formatted.actionLabel,
      actorName: auditEvent.actorName || '',
      actorCode: auditEvent.actorCode || '',
      metadata: auditEvent.metadata || {},
      createdAt: auditEvent.occurredAt || new Date()
    };
    const mongoOptions = { upsert: true, new: true, setDefaultsOnInsert: true };
    if (options.session) mongoOptions.session = options.session;
    const saved = await Notification.findOneAndUpdate(
      { idempotencyKey, recipientUserId },
      { $setOnInsert: doc },
      mongoOptions
    ).lean();
    if (saved) created.push(saved);
  }
  return created;
}

function recipientFilter(user = {}) {
  const ids = [user._id, user.id, user.userId, user.username, user.staffCode, user.code].map(text).filter(Boolean);
  return ids.length ? { recipientUserId: { $in: ids } } : { recipientUserId: '__none__' };
}

function pageLimit(value, fallback = 20, max = 100) {
  const n = Number(value || fallback);
  return Math.min(max, Math.max(1, Number.isFinite(n) ? Math.floor(n) : fallback));
}

async function summary(user = {}, options = {}) {
  if (!isMongooseReady()) return { unreadCount: 0, criticalUnreadCount: 0, latest: [] };
  const filter = recipientFilter(user);
  const unreadFilter = { ...filter, readAt: null };
  const [unreadCount, criticalUnreadCount, latest] = await Promise.all([
    Notification.countDocuments(unreadFilter),
    Notification.countDocuments({ ...unreadFilter, severity: 'critical' }),
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(pageLimit(options.limit, 10, 20)).lean()
  ]);
  return {
    unreadCount,
    criticalUnreadCount,
    latest: latest.map(publicNotification)
  };
}

async function list(user = {}, query = {}) {
  if (!isMongooseReady()) return { page: pageLimit(query.page, 1, 100000), limit: pageLimit(query.limit, 30, 100), total: 0, notifications: [] };
  const filter = recipientFilter(user);
  if (String(query.unread || '') === '1') filter.readAt = null;
  if (query.module) filter.module = text(query.module);
  if (query.severity) filter.severity = text(query.severity).toLowerCase();
  if (query.eventType) filter.eventType = text(query.eventType).toUpperCase();
  if (query.fromDate || query.toDate) {
    filter.createdAt = {};
    if (query.fromDate) filter.createdAt.$gte = new Date(query.fromDate);
    if (query.toDate) filter.createdAt.$lte = new Date(query.toDate);
  }
  const page = pageLimit(query.page, 1, 100000);
  const limit = pageLimit(query.limit, 30, 100);
  const skip = (page - 1) * limit;
  const [total, rows] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean()
  ]);
  return { page, limit, total, notifications: rows.map(publicNotification) };
}

async function markRead(user = {}, notificationId = '') {
  if (!isMongooseReady()) return null;
  const ids = [notificationId].map(text).filter(Boolean);
  if (!ids.length) return null;
  const filter = { ...recipientFilter(user), $or: idLookup(ids[0]) };
  const saved = await Notification.findOneAndUpdate(filter, { $set: { readAt: new Date() } }, { new: true }).lean();
  return saved ? publicNotification(saved) : null;
}

async function markAllRead(user = {}, query = {}) {
  if (!isMongooseReady()) return { modifiedCount: 0 };
  const filter = { ...recipientFilter(user), readAt: null };
  if (query.module) filter.module = text(query.module);
  if (query.severity) filter.severity = text(query.severity).toLowerCase();
  const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return { modifiedCount: result.modifiedCount || 0 };
}

async function detail(user = {}, notificationId = '') {
  if (!isMongooseReady()) return null;
  const filter = { ...recipientFilter(user), $or: idLookup(notificationId) };
  const notification = await Notification.findOne(filter).lean();
  if (!notification) return null;
  const auditEvent = notification.auditEventId
    ? await AuditEvent.findOne({ $or: idLookup(notification.auditEventId) }).lean().catch(() => null)
    : null;
  return { notification: publicNotification(notification), auditEvent: publicAuditEvent(auditEvent, user) };
}

module.exports = {
  createForAuditEvent,
  summary,
  list,
  markRead,
  markAllRead,
  detail,
  publicNotification,
  publicAuditEvent,
  recipientFilter
};
