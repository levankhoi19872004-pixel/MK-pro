'use strict';

function decodePayload(value = '') {
  return JSON.parse(Buffer.from(String(value || ''), 'base64').toString('utf8'));
}

const payload = decodePayload(process.argv[2] || '');

if (payload.mode === 'success') {
  process.send?.({
    type: 'IMPORT_PROGRESS',
    sessionId: payload.sessionId,
    stage: 'saving_rows'
  });
  process.send?.({
    type: 'IMPORT_COMPLETED',
    sessionId: payload.sessionId,
    summary: { total: 2, valid: 2, invalid: 0, totalFiles: 1 }
  }, () => process.exit(0));
} else {
  process.send?.({
    type: 'IMPORT_PROGRESS',
    sessionId: payload.sessionId,
    stage: 'validating'
  });
  process.send?.({
    type: 'IMPORT_FAILED',
    sessionId: payload.sessionId,
    stage: 'validating',
    code: 'TEST_VALIDATION_ERROR',
    message: 'Lỗi dữ liệu gốc từ worker'
  }, () => process.exit(1));
}
