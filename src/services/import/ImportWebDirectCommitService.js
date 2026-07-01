'use strict';

const excelImportService = require('../excelImportService');
const importSessionService = require('../importSessionService');

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

function normalizeSelectedRowNumbers(value) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
    : [];
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
    userName: actorName(user)
  });

  if (result && result.error) {
    return result;
  }

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
    normalizeSelectedRowNumbers
  }
};
