const { nowIso, uid } = require('../utils/coreUtils');

function ensureAudit(db){ db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs : []; }

function log(db, action, payload={}){
  ensureAudit(db);
  const row = {
    id: payload.id || uid('AUDIT_'),
    at: nowIso(),
    action,
    actor: payload.actor || payload.user || '',
    refType: payload.refType || '',
    refId: payload.refId || '',
    before: payload.before || null,
    after: payload.after || null,
    note: payload.note || ''
  };
  db.auditLogs.push(row);
  return row;
}

module.exports = { ensureAudit, log };
