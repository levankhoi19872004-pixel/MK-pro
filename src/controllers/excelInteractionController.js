'use strict';

const fs = require('node:fs/promises');
const ExcelInteractionService = require('../services/excel/ExcelInteractionService');
const excelImportService = require('../services/excelImportService');

function sendWorkbook(res, result) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName || 'export.xlsx')}`);
  res.setHeader('X-Export-Row-Count', String(result.rowCount || 0));
  if (result.outputBytes !== undefined) res.setHeader('X-Export-Output-Bytes', String(result.outputBytes || 0));
  if (result.filePath) {
    return res.sendFile(result.filePath, (err) => {
      fs.unlink(result.filePath).catch(() => {});
      if (err && !res.headersSent) {
        return res.status(500).json({
          ok: false,
          code: 'EXCEL_CONTEXT_EXPORT_STREAM_FAILED',
          message: 'Không xuất được dữ liệu Excel'
        });
      }
      return undefined;
    });
  }
  return res.send(result.buffer);
}

async function exportWorkbook(req, res) {
  try {
    const result = await ExcelInteractionService.exportWorkbook(req.body || {}, req.user || {});
    return sendWorkbook(res, result);
  } catch (err) {
    console.error('[EXCEL_CONTEXT_EXPORT_ERROR]', err && (err.stack || err.message || err));
    return res.status(err.status || err.statusCode || 500).json({
      ok: false,
      code: err.code || 'EXCEL_CONTEXT_EXPORT_FAILED',
      message: err.message || 'Không xuất được dữ liệu Excel'
    });
  }
}

async function previewPastedImport(req, res) {
  try {
    const result = await excelImportService.previewPastedRows({
      type: String(req.body?.type || '').trim(),
      rows: req.body?.rows,
      importMode: String(req.body?.importMode || '').trim(),
      userName: req.user?.username || req.user?.fullName || req.user?.name || ''
    });
    if (result.error) {
      return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    }
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[EXCEL_PASTE_PREVIEW_ERROR]', err && (err.stack || err.message || err));
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Không kiểm tra được dữ liệu đã dán'
    });
  }
}

async function resolveProducts(req, res) {
  try {
    const result = await ExcelInteractionService.resolveProducts(req.body?.codes || []);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Không đối chiếu được mã sản phẩm'
    });
  }
}

module.exports = { exportWorkbook, previewPastedImport, resolveProducts };
