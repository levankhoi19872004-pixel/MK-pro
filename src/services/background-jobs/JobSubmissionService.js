'use strict';

const BackgroundJobService = require('./BackgroundJobService');
const ArtifactStore = require('./GridFsArtifactStore');
const importSessionService = require('../importSessionService');
const { getRuntimeConfig } = require('../../config/app.config');

function actorName(user = {}) { return String(user.username || user.fullName || user.name || user.code || 'system').trim(); }
function text(value) { return String(value ?? '').trim(); }

function stringArray(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function positiveNumberArray(value) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
    : [];
}
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
  const workerConfig = getRuntimeConfig().worker;
  const requestBucket = Math.floor(Date.now() / workerConfig.exportIdempotencyWindowMs);
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
    timeoutMs: workerConfig.exportJobTimeoutMs,
    maxAttempts: workerConfig.exportJobMaxAttempts
  });
}

async function submitImportPreview({ sessionId, type, files = [], userName = '', importMode = 'create' } = {}) {
  const importConfig = getRuntimeConfig().import;
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
      timeoutMs: importConfig.jobTimeoutMs,
      maxAttempts: importConfig.jobMaxAttempts
    });
  } catch (error) {
    for (const artifact of artifacts) await ArtifactStore.remove(artifact.fileId).catch(() => false);
    throw error;
  }
}

async function submitImportCommit(payload = {}, user = {}) {
  const importConfig = getRuntimeConfig().import;
  const sessionId = String(payload.sessionId || payload.importSessionId || '').trim();
  if (!sessionId) return { error: 'Thiếu importSessionId', status: 400 };
  const session = await importSessionService.getSession(sessionId);
  if (!session) return { error: 'Không tìm thấy phiên import', status: 404 };
  if (session.status === 'done') {
    const existing = await BackgroundJobService.enqueue({
      type: 'import_commit',
      payload: {
        ...payload,
        sessionId,
        selectedOrderCodes: stringArray(payload.selectedOrderCodes),
        selectedRowNumbers: positiveNumberArray(payload.selectedRowNumbers),
        selectedProgramCodes: stringArray(payload.selectedProgramCodes),
        selectedRowKeys: stringArray(payload.selectedRowKeys),
        importMode: text(payload.importMode || session.importMode),
        userName: text(payload.userName || actorName(user))
      },
      idempotencyKey: `import-commit:${sessionId}`,
      actor: user,
      timeoutMs: importConfig.commitJobTimeoutMs,
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
      shortageReviewFingerprint: String(payload.shortageReviewFingerprint || '').trim(),
      selectedScopeFingerprint: String(payload.selectedScopeFingerprint || '').trim(),
      sessionId,
      selectedOrderCodes: stringArray(payload.selectedOrderCodes),
      selectedRowNumbers: positiveNumberArray(payload.selectedRowNumbers),
      selectedProgramCodes: stringArray(payload.selectedProgramCodes),
      selectedRowKeys: stringArray(payload.selectedRowKeys),
      importMode: text(payload.importMode || session.importMode),
      userName: text(payload.userName || actorName(user))
    },
    idempotencyKey: `import-commit:${sessionId}`,
    actor: user,
    timeoutMs: importConfig.commitJobTimeoutMs,
    maxAttempts: 1
  });
}

async function submitReconciliation({ type = 'all', source = 'manual_api', checkedBy = 'system', idempotencyKey = '', actor = {} } = {}) {
  const workerConfig = getRuntimeConfig().worker;
  const windowMs = workerConfig.reconciliationIdempotencyWindowMs;
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
    timeoutMs: workerConfig.reconciliationJobTimeoutMs,
    maxAttempts: 1
  });
}

module.exports = { submitExport, submitImportPreview, submitImportCommit, submitReconciliation, _private: { stableJson } };
