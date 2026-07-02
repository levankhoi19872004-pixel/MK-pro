'use strict';

const importSessionService = require('../importSessionService');
const ImportWebDirectCommitService = require('./ImportWebDirectCommitService');

const activeCommits = new Map();

function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizePayload(payload = {}, session = {}) {
  const sessionId = cleanText(payload.sessionId || payload.importSessionId || session.sessionId || session.id);
  return {
    ...(payload || {}),
    type: cleanText(payload.type || session.type),
    sessionId,
    importSessionId: sessionId,
    importMode: cleanText(payload.importMode || session.importMode),
    shortageMode: cleanText(payload.shortageMode)
  };
}

function publicJob(sessionId) {
  const id = `web-import-commit:${sessionId}`;
  return {
    id,
    type: 'web_import_commit',
    status: activeCommits.has(sessionId) ? 'running' : 'accepted',
    progress: { percent: 0, step: 'accepted' }
  };
}

function acceptedPayload(sessionId, extra = {}) {
  const job = publicJob(sessionId);
  return {
    ok: true,
    accepted: true,
    status: 'importing',
    jobId: job.id,
    job,
    sessionId,
    importSessionId: sessionId,
    statusUrl: `/api/import/sessions/${encodeURIComponent(sessionId)}`,
    source: 'web-detached-import-commit',
    ...extra
  };
}

function runDetached(sessionId, payload, user) {
  if (activeCommits.has(sessionId)) return activeCommits.get(sessionId);

  const task = (async () => {
    try {
      console.info('[IMPORT_WEB_DETACHED_COMMIT_STARTED]', {
        sessionId,
        type: payload.type,
        selectedRowNumbers: Array.isArray(payload.selectedRowNumbers) ? payload.selectedRowNumbers.length : 0,
        selectedProgramCodes: Array.isArray(payload.selectedProgramCodes) ? payload.selectedProgramCodes.length : 0,
        selectedRowKeys: Array.isArray(payload.selectedRowKeys) ? payload.selectedRowKeys.length : 0
      });
      const result = await ImportWebDirectCommitService.commitSession(payload, user);
      if (result?.error) {
        console.error('[IMPORT_WEB_DETACHED_COMMIT_FAILED]', {
          sessionId,
          type: payload.type,
          status: result.status,
          code: result.code,
          message: result.detail || result.error || result.message
        });
      } else {
        console.info('[IMPORT_WEB_DETACHED_COMMIT_DONE]', {
          sessionId,
          type: payload.type,
          imported: result?.imported || 0,
          skipped: result?.skipped || 0
        });
      }
      return result;
    } catch (error) {
      console.error('[IMPORT_WEB_DETACHED_COMMIT_CRASHED]', {
        sessionId,
        type: payload.type,
        code: error && error.code,
        message: error && error.message
      });
      await importSessionService.markFailed(sessionId, error).catch((markError) => {
        console.error('[IMPORT_WEB_DETACHED_MARK_FAILED_ERROR]', {
          sessionId,
          originalError: error && error.message,
          markFailedError: markError && (markError.stack || markError.message || markError)
        });
      });
      throw error;
    } finally {
      activeCommits.delete(sessionId);
    }
  })();

  activeCommits.set(sessionId, task);
  task.catch(() => null);
  return task;
}

async function submit(payload = {}, user = {}) {
  const requestedSessionId = cleanText(payload.sessionId || payload.importSessionId);
  if (!requestedSessionId) return { error: 'Thiếu importSessionId', status: 400 };

  const session = await importSessionService.getSession(requestedSessionId);
  if (!session) {
    return {
      error: 'Không tìm thấy phiên import',
      status: 404,
      code: 'IMPORT_SESSION_NOT_FOUND',
      sessionId: requestedSessionId,
      importSessionId: requestedSessionId
    };
  }

  const sessionId = cleanText(session.sessionId || session.id || requestedSessionId);
  const status = cleanText(session.status).toLowerCase();
  const type = cleanText(payload.type || session.type);

  if (status === 'done') {
    return ImportWebDirectCommitService.commitSession({ ...payload, sessionId, importSessionId: sessionId, type }, user);
  }

  if (status === 'importing' || activeCommits.has(sessionId)) {
    return acceptedPayload(sessionId, { alreadyRunning: true });
  }

  if (status !== 'preview_ready') {
    return {
      error: status === 'failed'
        ? 'Phiên import đã lỗi. Vui lòng xem trước lại file Excel.'
        : 'Phiên import chưa sẵn sàng xác nhận',
      status: 409,
      code: 'IMPORT_SESSION_NOT_READY',
      sessionStatus: session.status,
      sessionId,
      importSessionId: sessionId
    };
  }

  const normalized = normalizePayload(payload, { ...session, sessionId });
  runDetached(sessionId, normalized, user || {});
  return acceptedPayload(sessionId);
}

function isActive(sessionId) {
  return activeCommits.has(cleanText(sessionId));
}

module.exports = {
  submit,
  isActive,
  _private: {
    normalizePayload,
    acceptedPayload,
    publicJob,
    activeCommits
  }
};
