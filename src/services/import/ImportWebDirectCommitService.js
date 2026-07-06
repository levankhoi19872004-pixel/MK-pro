'use strict';

const excelImportService = require('../excelImportService');
const importSessionService = require('../importSessionService');
const { emitDomainEventSafe } = require('../events/domainEventBus');
const { EVENT_TYPES } = require('../events/domainEventTypes');

function cleanText(value) {
  return String(value ?? '').trim();
}

function actorName(user = {}) {
  return cleanText(user.username || user.fullName || user.name || user.code || 'system');
}

function normalizeSelectedOrderCodes(value) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
}


function normalizeSelectedProgramCodes(value) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
}

function normalizeSelectedRowNumbers(value) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
    : [];
}

function normalizeSelectedRowKeys(value) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
}


function actorFromUser(user = {}) {
  return {
    userId: cleanText(user._id || user.id || user.userId),
    code: cleanText(user.staffCode || user.code || user.username),
    name: actorName(user),
    role: cleanText(user.role)
  };
}

async function emitImportNotification(eventType, session = {}, result = {}, user = {}, extra = {}) {
  const sessionId = cleanText(session.sessionId || session.id || extra.sessionId || result.sessionId || result.importSessionId);
  const errorRows = Number(result.errorRows ?? session.errorRows ?? (Array.isArray(session.invalidRows) ? session.invalidRows.length : 0) ?? 0);
  const skippedRows = Number(result.skippedRows ?? result.skipped ?? session.skippedRows ?? 0);
  const importedRows = Number(result.importedRows ?? result.imported ?? result.totalCommitRows ?? 0);
  const hasErrors = errorRows > 0 || skippedRows > 0 || eventType === EVENT_TYPES.IMPORT_FAILED;
  if (!hasErrors) return;
  await emitDomainEventSafe({
    eventType,
    entityType: 'importSession',
    entityId: sessionId,
    entityCode: sessionId,
    severity: eventType === EVENT_TYPES.IMPORT_FAILED ? 'critical' : 'warning',
    actor: actorFromUser(user),
    before: {},
    after: {
      status: eventType === EVENT_TYPES.IMPORT_FAILED ? 'failed' : 'done',
      importedRows,
      errorRows,
      skippedRows
    },
    diff: { importedRows, errorRows, skippedRows },
    metadata: {
      importType: cleanText(result.type || session.type || extra.type),
      sessionId,
      totalRows: Number(result.totalRows ?? session.totalRows ?? 0),
      importedRows,
      errorRows,
      skippedRows,
      reason: cleanText(result.error || result.detail || extra.reason)
    },
    idempotencyKey: `${eventType}:${sessionId}`
  });
}

function buildDonePayload(session, sessionId) {
  const result = session && session.result && typeof session.result === 'object' && !Array.isArray(session.result)
    ? session.result
    : {};

  return {
    ...result,
    ok: true,
    alreadyCompleted: true,
    status: 'done',
    source: 'web-direct-import-commit',
    message: result.message || 'Phiên import đã hoàn tất trước đó',
    sessionId,
    importSessionId: sessionId
  };
}

async function commitSession(payload = {}, user = {}) {
  const sessionId = cleanText(payload.sessionId || payload.importSessionId);
  if (!sessionId) {
    return { error: 'Thiếu importSessionId', status: 400 };
  }

  const session = await importSessionService.getSession(sessionId);
  if (!session) {
    return {
      error: 'Không tìm thấy phiên import',
      status: 404,
      code: 'IMPORT_SESSION_NOT_FOUND',
      sessionId,
      importSessionId: sessionId
    };
  }

  const canonicalSessionId = cleanText(session.sessionId || session.id || sessionId);
  const currentStatus = cleanText(session.status).toLowerCase();

  // Idempotency guard: user bấm lại Import sau khi đã done thì trả kết quả cũ,
  // tuyệt đối không chạy lại commit để tránh duplicate đơn/tồn kho/công nợ.
  if (currentStatus === 'done') {
    return buildDonePayload(session, canonicalSessionId);
  }

  if (currentStatus !== 'preview_ready') {
    return {
      error: currentStatus === 'failed'
        ? 'Phiên import đã lỗi. Vui lòng xem trước lại file Excel.'
        : 'Phiên import chưa sẵn sàng xác nhận',
      status: 409,
      code: 'IMPORT_SESSION_NOT_READY',
      sessionStatus: session.status,
      sessionId: canonicalSessionId,
      importSessionId: canonicalSessionId
    };
  }

  const result = await excelImportService.commit({
    type: cleanText(payload.type || session.type),
    shortageMode: cleanText(payload.shortageMode),
    sessionId: canonicalSessionId,
    selectedOrderCodes: normalizeSelectedOrderCodes(payload.selectedOrderCodes),
    selectedRowNumbers: normalizeSelectedRowNumbers(payload.selectedRowNumbers),
    selectedProgramCodes: normalizeSelectedProgramCodes(payload.selectedProgramCodes),
    selectedRowKeys: normalizeSelectedRowKeys(payload.selectedRowKeys),
    importMode: cleanText(payload.importMode || session.importMode),
    userName: actorName(user)
  });

  if (result && result.error) {
    await emitImportNotification(EVENT_TYPES.IMPORT_FAILED, session, result, user, { sessionId: canonicalSessionId, type: cleanText(payload.type || session.type), reason: result.error });
    return result;
  }

  await emitImportNotification(EVENT_TYPES.IMPORT_COMPLETED_WITH_ERRORS, session, result || {}, user, { sessionId: canonicalSessionId, type: cleanText(payload.type || session.type) });

  return {
    ...result,
    ok: true,
    status: 'done',
    source: 'web-direct-import-commit',
    sessionId: result?.sessionId || canonicalSessionId,
    importSessionId: result?.importSessionId || canonicalSessionId
  };
}

module.exports = {
  commitSession,
  _private: {
    actorName,
    normalizeSelectedOrderCodes,
    normalizeSelectedRowNumbers,
    normalizeSelectedProgramCodes,
    normalizeSelectedRowKeys
  }
};
