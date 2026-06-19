'use strict';

const AuditLog = require('../models/AuditLog');
const dateUtil = require('../utils/date.util');
const { makeId } = require('../utils/common.util');
const { tenantIdOf } = require('../utils/tenant.util');

function actorName(actor = {}) {
  return String(actor.username || actor.fullName || actor.name || actor.code || 'system').trim();
}

function buildEntry(input = {}) {
  return {
    id: String(input.id || makeId('AUD')).trim(),
    tenantId: tenantIdOf({ tenantId: input.tenantId }),
    action: String(input.action || 'UNKNOWN').trim(),
    refType: String(input.refType || input.aggregateType || '').trim(),
    refId: String(input.refId || input.aggregateId || '').trim(),
    refCode: String(input.refCode || '').trim(),
    before: input.before || null,
    after: input.after || input.summary || null,
    note: String(input.note || '').trim(),
    userName: String(input.userName || input.user || actorName(input.actor)).trim(),
    createdAt: input.createdAt || dateUtil.nowIso()
  };
}

/**
 * Transaction-aware audit writer used by command handlers.
 * Errors are intentionally propagated so an audit failure can roll back the
 * surrounding business transaction when audit is part of the command contract.
 */
async function record(input = {}, options = {}) {
  const entry = buildEntry(input);
  const createOptions = options.session ? { session: options.session } : undefined;
  const created = await AuditLog.create([entry], createOptions);
  return created[0];
}

/**
 * Backward-compatible best-effort audit API used by legacy flows.
 * Legacy callers historically must not fail the business operation when audit
 * persistence is temporarily unavailable.
 */
async function log(action, payload = {}) {
  try {
    const entry = buildEntry({ ...payload, action });
    return await AuditLog.create(entry);
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[auditService] Không ghi được audit log:', err.message);
    }
    return null;
  }
}

module.exports = { log, record, actorName, buildEntry };
