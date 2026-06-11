'use strict';

const importExportService = require('../services/importExportService');
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

function sendWorkbook(res, result) {
  if (result?.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName || 'export.xlsx')}"`);
  return res.send(result.buffer);
}

async function previewImport(req, res) {
  try {
    const files = req.importFiles || normalizeUploadedFiles(req);
    const result = await importExportService.previewImport({
      type: String(req.body?.type || '').trim(),
      files,
      buffer: files[0]?.buffer,
      fileName: files[0]?.originalname || '',
      userName: req.user?.username || req.user?.fullName || ''
    });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    res.json({ ok: true, source: 'import-export-route', ...result });
  } catch (err) {
    console.error('[IMPORT_PREVIEW_ERROR]', err && (err.stack || err.message || err));
    res.status(500).json({ ok: false, message: 'Không đọc được file import', error: err.message, detail: err.stack });
  }
}

async function commitImport(req, res) {
  try {
    const result = await importExportService.commitImport({
      type: String(req.body?.type || '').trim(),
      rows: req.body?.rows,
      shortageMode: String(req.body?.shortageMode || '').trim(),
      sessionId: String(req.body?.sessionId || req.body?.importSessionId || '').trim(),
      selectedOrderCodes: req.body?.selectedOrderCodes || [],
      userName: req.user?.username || req.user?.fullName || ''
    });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    res.json({ ok: true, source: 'import-export-route', ...result });
  } catch (err) {
    console.error('[IMPORT_COMMIT_ERROR]', err && (err.stack || err.message || err));
    res.status(500).json({ ok: false, message: 'Không ghi được dữ liệu import', error: err.message, detail: err.stack });
  }
}


async function directImport(req, res) {
  return res.status(410).json({
    ok: false,
    message: 'Import trực tiếp đã bị khóa. Vui lòng dùng /preview rồi /commit.'
  });
}

async function importLogs(req, res) {
  try {
    res.json({ ok: true, source: 'import-export-route', importLogs: await importExportService.getImportLogs() });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được lịch sử import', error: err.message });
  }
}

async function listBuiltInTemplates(req, res) {
  res.json({ ok: true, templates: importExportService.getBuiltInTemplates() });
}

async function downloadBuiltInTemplate(req, res) {
  try {
    sendWorkbook(res, await importExportService.buildBuiltInTemplateFile(req.params.type));
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, message: err.message || 'Không tạo được mẫu import Excel' });
  }
}

async function fields(req, res) {
  res.json({ ok: true, fields: importExportService.getFields(req.params.type) });
}

async function listCustomTemplates(req, res) {
  try {
    res.json({ ok: true, templates: await importExportService.listCustomTemplates() });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được mẫu import tự tạo', error: err.message });
  }
}

async function saveCustomTemplate(req, res) {
  try {
    const result = await importExportService.saveCustomTemplate(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, message: 'Đã lưu mẫu import', template: result.template });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lưu được mẫu import', error: err.message });
  }
}

async function removeCustomTemplate(req, res) {
  try {
    const result = await importExportService.deleteCustomTemplate(req.params.id);
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, message: 'Đã xóa mẫu import' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được mẫu import', error: err.message });
  }
}

async function downloadCustomTemplate(req, res) {
  try {
    sendWorkbook(res, await importExportService.buildCustomTemplateFile(req.params.id));
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được file mẫu import', error: err.message });
  }
}

async function exportTypes(req, res) {
  res.json({ ok: true, types: importExportService.getExportTypes() });
}

async function exportExcel(req, res) {
  try {
    sendWorkbook(res, await importExportService.exportToExcel(req.params.type, req.query || {}));
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không export được dữ liệu', error: err.message });
  }
}

module.exports = {
  previewImport,
  directImport,
  commitImport,
  importLogs,
  listBuiltInTemplates,
  downloadBuiltInTemplate,
  fields,
  listCustomTemplates,
  saveCustomTemplate,
  removeCustomTemplate,
  downloadCustomTemplate,
  exportTypes,
  exportExcel
};
