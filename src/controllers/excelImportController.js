'use strict';

const excelImportService = require('../services/excelImportService');
const ImportWebDirectCommitService = require('../services/import/ImportWebDirectCommitService');
const importShortageReportService = require('../services/importShortageReportService');


function buildSafeImportErrorMessage(err) {
  const raw = String(err && err.message ? err.message : '').trim();
  if (!raw) return 'Không đọc được file Excel. Vui lòng tải lại file mẫu và nhập dữ liệu theo mẫu.';

  const knownPatterns = [
    /^File Excel/i,
    /^Không đọc được file Excel/i,
    /^Không tìm thấy sheet/i,
    /^Không tìm thấy header/i,
    /^File thiếu cột/i,
    /^Thiếu loại import/i,
    /^Loại import/i,
    /^Chưa chọn file Excel/i,
    /^Mỗi lần chỉ được dán/i,
    /^Excel parser stopped unexpectedly/i,
    /^File Excel quá lớn/i,
    /^File Excel xử lý quá lâu/i
  ];

  if (knownPatterns.some((pattern) => pattern.test(raw))) return raw;
  return 'Không đọc được file Excel. Vui lòng tải lại file mẫu và nhập dữ liệu theo mẫu.';
}

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
    const result = await excelImportService.preview({ type: String(req.body?.type || '').trim(), files, buffer: files[0]?.buffer, fileName: files[0]?.originalname || '', userName: req.user?.username || req.user?.fullName || '', importMode: String(req.body?.importMode || req.query?.importMode || '').trim() });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    return res.status(result.accepted ? 202 : 200).json({ ok: true, ...result });
  } catch (err) {
    const message = buildSafeImportErrorMessage(err);
    const knownUserError = message !== 'Không đọc được file Excel. Vui lòng tải lại file mẫu và nhập dữ liệu theo mẫu.';
    res.status(Number(err.status || err.statusCode || (knownUserError ? 400 : 500))).json({
      ok: false,
      message,
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}

async function commit(req, res) {
  try {
    const result = await ImportWebDirectCommitService.commitSession({
      ...(req.body || {}),
      sessionId: req.params?.sessionId || req.body?.sessionId || req.body?.importSessionId
    }, req.user || {});

    if (result.error) {
      return res.status(result.status || 400).json({
        ok: false,
        message: result.error,
        ...result
      });
    }

    return res.json({ ok: true, source: 'mongo-route', ...result });
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

    return res.json({
      ok: true,
      ...result
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      message: 'Không lấy được trạng thái import',
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
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
    res.status(500).json({ ok: false, message: 'Không tải được lịch sử import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function shortageReports(req, res) {
  try {
    const reports = await importShortageReportService.list({
      status: req.query.status,
      search: req.query.search,
      limit: req.query.limit
    });
    return res.json({ ok: true, reports });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không tải được báo cáo hàng thiếu', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function shortageReportDetail(req, res) {
  try {
    const report = await importShortageReportService.getById(String(req.params.id || '').trim());
    if (!report) return res.status(404).json({ ok: false, message: 'Không tìm thấy báo cáo hàng thiếu' });
    return res.json({ ok: true, report });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không tải được chi tiết báo cáo hàng thiếu', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function updateShortageReport(req, res) {
  try {
    const actor = req.user?.username || req.user?.fullName || '';
    const result = await importShortageReportService.updateReport(String(req.params.id || '').trim(), req.body || {}, actor);
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: 'Không cập nhật được báo cáo hàng thiếu', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

module.exports = { preview, commit, direct, logs, sessionStatus, sessionRows, shortageReports, shortageReportDetail, updateShortageReport };
