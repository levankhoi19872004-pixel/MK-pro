'use strict';

const excelImportService = require('../services/excelImportService');

async function preview(req, res) {
  try {
    const result = await excelImportService.preview({ type: String(req.body?.type || '').trim(), buffer: req.file?.buffer, userName: req.user?.username || req.user?.fullName || '' });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không đọc được file import', error: err.message });
  }
}

async function commit(req, res) {
  try {
    const result = await excelImportService.commit({ type: String(req.body?.type || '').trim(), rows: req.body?.rows, shortageMode: String(req.body?.shortageMode || '').trim(), sessionId: String(req.body?.sessionId || req.body?.importSessionId || '').trim(), selectedOrderCodes: req.body?.selectedOrderCodes || [], userName: req.user?.username || req.user?.fullName || '' });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không ghi được dữ liệu import', error: err.message });
  }
}

async function direct(req, res) {
  try {
    const result = await excelImportService.importDirect({
      type: String(req.body?.type || '').trim(),
      buffer: req.file?.buffer
    });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không import được dữ liệu', error: err.message });
  }
}

async function logs(req, res) {
  try {
    res.json({ ok: true, source: 'mongo-route', importLogs: await excelImportService.logs() });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được lịch sử import', error: err.message });
  }
}

module.exports = { preview, commit, direct, logs };
