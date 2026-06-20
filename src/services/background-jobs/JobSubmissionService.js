'use strict';

const BackgroundJobService = require('./BackgroundJobService');
const ArtifactStore = require('./GridFsArtifactStore');
const importSessionService = require('../importSessionService');

function actorName(user = {}) { return String(user.username || user.fullName || user.name || user.code || 'system').trim(); }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function submitExport({ type, query = {}, user = {}, idempotencyKey = '' } = {}) {
  const exportType = String(type || '').trim();
  const sanitizedQuery = { ...query };
  delete sanitizedQuery.async;
  delete sanitizedQuery.idempotencyKey;
  const requestBucket = Math.floor(Date.now() / Math.max(60_000, Number(process.env.EXPORT_IDEMPOTENCY_WINDOW_MS || 5 * 60 * 1000)));
  const effectiveIdempotencyKey = String(idempotencyKey || '').trim() || BackgroundJobService.makeIdempotencyKey([
    'export',
    user.tenantId || user.tenantCode || '',
    user.id || user._id || user.username || '',
    exportType,
    stableJson(sanitizedQuery),
    requestBucket
  ]);
  return BackgroundJobService.enqueue({
    type: 'export_excel',
    payload: {
      type: exportType,
      query: sanitizedQuery,
      currentUser: {
        id: user.id || user._id || '',
        username: user.username || '',
        fullName: user.fullName || user.name || '',
        role: user.role || '',
        tenantId: user.tenantId || user.tenantCode || ''
      }
    },
    idempotencyKey: effectiveIdempotencyKey,
    actor: user,
    timeoutMs: Number(process.env.EXPORT_JOB_TIMEOUT_MS || 10 * 60 * 1000),
    maxAttempts: Number(process.env.EXPORT_JOB_MAX_ATTEMPTS || 3)
  });
}

async function submitImportPreview({ sessionId, type, files = [], userName = '', importMode = 'create' } = {}) {
  const artifacts = [];
  try {
    for (const file of files) {
      artifacts.push(await ArtifactStore.putImportInput(file, { sessionId, importType: type }));
    }
    return await BackgroundJobService.enqueue({
      type: 'import_preview',
      payload: {
        sessionId,
        importType: type,
        inputArtifacts: artifacts,
        userName,
        importMode
      },
      idempotencyKey: `import-preview:${sessionId}`,
      createdBy: userName,
      timeoutMs: Number(process.env.IMPORT_JOB_TIMEOUT_MS || 120000),
      maxAttempts: Number(process.env.IMPORT_JOB_MAX_ATTEMPTS || 2)
    });
  } catch (error) {
    for (const artifact of artifacts) await ArtifactStore.remove(artifact.fileId).catch(() => false);
    throw error;
  }
}

async function submitImportCommit(payload = {}, user = {}) {
  const sessionId = String(payload.sessionId || payload.importSessionId || '').trim();
  if (!sessionId) return { error: 'Thiếu importSessionId', status: 400 };
  const session = await importSessionService.getSession(sessionId);
  if (!session) return { error: 'Không tìm thấy phiên import', status: 404 };
  if (session.status === 'done') {
    const existing = await BackgroundJobService.enqueue({
      type: 'import_commit',
      payload: { ...payload, sessionId },
      idempotencyKey: `import-commit:${sessionId}`,
      actor: user,
      timeoutMs: Number(process.env.IMPORT_COMMIT_JOB_TIMEOUT_MS || 15 * 60 * 1000),
      maxAttempts: 1
    });
    return { ...existing, alreadyCompleted: true };
  }
  if (session.status !== 'preview_ready') return { error: 'Phiên import chưa sẵn sàng xác nhận', status: 409 };
  return BackgroundJobService.enqueue({
    type: 'import_commit',
    payload: {
      type: String(payload.type || session.type || '').trim(),
      shortageMode: String(payload.shortageMode || '').trim(),
      sessionId,
      selectedOrderCodes: Array.isArray(payload.selectedOrderCodes) ? payload.selectedOrderCodes : [],
      userName: actorName(user)
    },
    idempotencyKey: `import-commit:${sessionId}`,
    actor: user,
    timeoutMs: Number(process.env.IMPORT_COMMIT_JOB_TIMEOUT_MS || 15 * 60 * 1000),
    maxAttempts: 1
  });
}

async function submitReconciliation({ type = 'all', source = 'manual_api', checkedBy = 'system', idempotencyKey = '', actor = {} } = {}) {
  const windowMs = Math.max(60_000, Number(process.env.RECONCILIATION_IDEMPOTENCY_WINDOW_MS || 5 * 60 * 1000));
  const effectiveIdempotencyKey = String(idempotencyKey || '').trim() || BackgroundJobService.makeIdempotencyKey([
    'reconciliation',
    actor.tenantId || actor.tenantCode || '',
    actor.id || actor._id || actor.username || checkedBy || '',
    type,
    source,
    Math.floor(Date.now() / windowMs)
  ]);
  return BackgroundJobService.enqueue({
    type: 'reconciliation',
    payload: { reconciliationType: type, source, checkedBy },
    idempotencyKey: effectiveIdempotencyKey,
    actor,
    timeoutMs: Number(process.env.RECONCILIATION_JOB_TIMEOUT_MS || 30 * 60 * 1000),
    maxAttempts: 1
  });
}

module.exports = { submitExport, submitImportPreview, submitImportCommit, submitReconciliation, _private: { stableJson } };
