'use strict';

const dmsInventoryService = require('../services/dmsInventoryReconciliation.service');

function sendError(res, err, fallback = 'Không xử lý được dữ liệu tồn DMS') {
  const status = Number(err?.status || err?.statusCode || 500);
  if (status >= 500) console.error('[DMS_INVENTORY_ERROR]', err?.stack || err);
  return res.status(status).json({
    ok: false,
    success: false,
    message: status >= 500 && process.env.NODE_ENV === 'production' ? fallback : (err?.message || fallback),
    code: err?.code || undefined
  });
}

async function preview(req, res) {
  try {
    const result = await dmsInventoryService.previewImport({
      buffer: req.file?.buffer,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      snapshotDate: req.body?.snapshotDate,
      note: req.body?.note,
      user: req.user || {}
    });
    return res.status(200).json({ ok: true, success: true, message: 'Đã đọc file tồn DMS', data: result, ...result });
  } catch (err) {
    return sendError(res, err, 'Không đọc được file tồn DMS');
  }
}

async function commit(req, res) {
  try {
    const result = await dmsInventoryService.commitImport({
      importId: req.params.importId || req.body?.importId,
      previewToken: req.body?.previewToken,
      user: req.user || {}
    });
    return res.json({ ok: true, success: true, message: 'Đã cập nhật đối chiếu và hạn mức bán App', data: result, ...result });
  } catch (err) {
    return sendError(res, err, 'Không lưu được đối chiếu tồn DMS');
  }
}

async function latest(req, res) {
  try {
    const result = await dmsInventoryService.getLatest({
      type: req.query.type,
      search: req.query.search || req.query.q,
      page: req.query.page,
      limit: req.query.limit
    });
    return res.json({ ok: true, success: true, data: result, ...result });
  } catch (err) {
    return sendError(res, err, 'Không tải được đối chiếu tồn DMS');
  }
}

async function history(req, res) {
  try {
    const result = await dmsInventoryService.getHistory({ page: req.query.page, limit: req.query.limit });
    return res.json({ ok: true, success: true, data: result, ...result });
  } catch (err) {
    return sendError(res, err, 'Không tải được lịch sử tồn DMS');
  }
}

module.exports = { preview, commit, latest, history };
