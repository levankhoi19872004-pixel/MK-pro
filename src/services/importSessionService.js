'use strict';

const crypto = require('crypto');
const { IMPORT_STATUS } = require('../constants/business.constants');

const sessions = new Map();
const TTL_MS = Number(process.env.IMPORT_SESSION_TTL_MS || 60 * 60 * 1000);

function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - Number(session.createdAtMs || 0) > TTL_MS) sessions.delete(id);
  }
}

function createSession({ type, rows = [], rawRows = [], createdBy = '' } = {}) {
  cleanup();
  const id = `IS${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
  const session = { id, type, rows, rawRows, status: IMPORT_STATUS.PREVIEW, createdBy, createdAt: new Date().toISOString(), createdAtMs: Date.now() };
  sessions.set(id, session);
  return session;
}

function getSession(id) {
  cleanup();
  return sessions.get(String(id || '').trim()) || null;
}

function updateSession(id, patch = {}) {
  const session = getSession(id);
  if (!session) return null;
  Object.assign(session, patch, { updatedAt: new Date().toISOString() });
  sessions.set(session.id, session);
  return session;
}

function selectRows(session, selectedOrderCodes = []) {
  if (!session) return [];
  const selected = new Set((selectedOrderCodes || []).map((v) => String(v || '').trim()).filter(Boolean));
  if (!selected.size) return [];
  return (session.rows || []).filter((row) => selected.has(String(row.documentCode || row.orderCode || row.code || '').trim()));
}

module.exports = { createSession, getSession, updateSession, selectRows };
