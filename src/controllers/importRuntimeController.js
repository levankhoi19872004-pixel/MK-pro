'use strict';

const excelImportService = require('../services/excelImportService');
const AsyncJobHttpAdapter = require('../services/background-jobs/AsyncJobHttpAdapter');

async function preview(req, res) {
  try {
    const file = (req.importFiles && req.importFiles[0]) || req.file;
    if (!file) return res.status(400).json({ ok: false, message: 'Chưa có file Excel để import' });
    const result = await excelImportService.preview({ type: String(req.body?.type || req.query?.type || '').trim(), buffer: file.buffer, fileName: file.originalname || '', userName: req.user?.username || req.user?.fullName || '', importMode: String(req.body?.importMode || req.query?.importMode || '').trim() });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    return res.status(result.accepted ? 202 : 200).json({ ok: true, source: 'mongo-native-import-controller', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được file import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function commit(req, res) {
  try {
    const sessionId = String(req.body?.sessionId || req.body?.importSessionId || '').trim();
    const submitted = await AsyncJobHttpAdapter.submitImportCommit(req);
    if (submitted.error) return res.status(submitted.status || 400).json({ ok: false, message: submitted.error });
    if (AsyncJobHttpAdapter.prefersAsync(req)) {
      return res.status(202).json(AsyncJobHttpAdapter.acceptedPayload(submitted, {
        source: 'mongo-native-import-controller', sessionId, importSessionId: sessionId
      }));
    }
    const waited = await AsyncJobHttpAdapter.waitImportCompatibility(submitted, sessionId);
    if (waited.timeout) return res.status(202).json(AsyncJobHttpAdapter.acceptedPayload(submitted, { source: 'mongo-native-import-controller', sessionId }));
    if (waited.error) return res.status(waited.status || 500).json({ ok: false, message: waited.error, code: waited.code });
    return res.json({ ok: true, source: 'mongo-native-import-controller', ...waited.result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không ghi được dữ liệu import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}


async function sessionRows(req, res) {
  if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
  try {
    const result = await excelImportService.getSessionRows(
      String(req.params.sessionId || req.query.sessionId || '').trim(),
      {
        offset: Number(req.query.offset || 0),
        limit: Number(req.query.limit || 500)
      }
    );

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        message: result.error,
        ...result
      });
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: 'Không tải được danh sách dòng import',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}

async function sessionStatus(req, res) {
  if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
  try {
    const result = await excelImportService.getSessionStatus(
      String(req.params.sessionId || req.query.sessionId || '').trim()
    );

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        message: result.error,
        ...result
      });
    }

    return res.json({ ok: true, source: 'mongo-native-import-controller', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được trạng thái import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function logs(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const logs = await excelImportService.logs();
    res.json({ ok: true, source: 'mongo-native-import-controller', logs: logs.slice(0, limit), importLogs: logs.slice(0, limit) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được lịch sử import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

module.exports = { preview, commit, logs, sessionStatus, sessionRows };
