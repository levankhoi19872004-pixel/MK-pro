'use strict';

const excelImportService = require('../services/excelImportService');

function normalizeUploadedFiles(req) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files && typeof req.files === 'object') {
    Object.values(req.files).forEach((list) => {
      if (Array.isArray(list)) files.push(...list);
    });
  }
  return files.filter((file) => file && file.buffer);
}

async function preview(req, res) {
  try {
    const files = req.importFiles || normalizeUploadedFiles(req);
    const result = await excelImportService.preview({ type: String(req.body?.type || '').trim(), files, buffer: files[0]?.buffer, fileName: files[0]?.originalname || '', userName: req.user?.username || req.user?.fullName || '' });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    return res.status(result.accepted ? 202 : 200).json({ ok: true, ...result });
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


async function sessionStatus(req, res) {
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

    return res.json({
      ok: true,
      ...result
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: 'Không lấy được trạng thái import',
      error: err.message
    });
  }
}

async function direct(req, res) {
  return res.status(410).json({
    ok: false,
    message: 'Import trực tiếp đã bị khóa. Vui lòng dùng /preview rồi /commit.'
  });
}

async function logs(req, res) {
  try {
    res.json({ ok: true, source: 'mongo-route', importLogs: await excelImportService.logs() });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được lịch sử import', error: err.message });
  }
}

module.exports = { preview, commit, direct, logs, sessionStatus };
