'use strict';

const excelImportService = require('../services/excelImportService');

async function preview(req, res) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'Chưa có file Excel để import' });
    const result = await excelImportService.preview({ type: String(req.body?.type || req.query?.type || '').trim(), buffer: req.file.buffer, userName: req.user?.username || req.user?.fullName || '' });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    res.json({ ok: true, source: 'mongo-native-import-controller', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được file import', error: err.message });
  }
}

async function commit(req, res) {
  try {
    const result = await excelImportService.commit({ type: String(req.body?.type || '').trim(), rows: req.body?.rows, sessionId: String(req.body?.sessionId || req.body?.importSessionId || '').trim(), selectedOrderCodes: req.body?.selectedOrderCodes || [], userName: req.user?.username || req.user?.fullName || '' });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    res.json({ ok: true, source: 'mongo-native-import-controller', ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ghi được dữ liệu import', error: err.message });
  }
}

async function logs(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const logs = await excelImportService.logs();
    res.json({ ok: true, source: 'mongo-native-import-controller', logs: logs.slice(0, limit), importLogs: logs.slice(0, limit) });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được lịch sử import', error: err.message });
  }
}

module.exports = { preview, commit, logs };
