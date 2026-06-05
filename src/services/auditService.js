'use strict';

const AuditLog = require('../models/AuditLog');

function makeId(prefix = 'AL') {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function log(action, payload = {}) {
  try {
    return await AuditLog.create({
      id: makeId(),
      action,
      refType: payload.refType || '',
      refId: payload.refId || '',
      refCode: payload.refCode || '',
      before: payload.before || null,
      after: payload.after || payload.summary || payload,
      note: payload.note || '',
      userName: payload.userName || payload.user || '',
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') console.warn('[auditService] Không ghi được audit log:', err.message);
    return null;
  }
}

module.exports = { log };
