'use strict';

const importExportService = require('../services/importExportService');
const importTemplateService = require('../services/import-template/ImportTemplateApplicationService');
const excelImportService = require('../services/excelImportService');
const BackgroundJobService = require('../services/background-jobs/BackgroundJobService');
const JobSubmissionService = require('../services/background-jobs/JobSubmissionService');
const AsyncJobHttpAdapter = require('../services/background-jobs/AsyncJobHttpAdapter');
const ArtifactStore = require('../services/background-jobs/GridFsArtifactStore');

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
  if (result?.error) return res.status(result.status || 400).json({ ok: false, message: result.error, code: result.code, errors: result.errors, totalErrors: result.totalErrors, errorReportUrl: result.errorReportUrl });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName || 'export.xlsx')}"`);
  res.setHeader('X-Export-Order-Count', String(Number(result.orderCount || 0)));
  res.setHeader('X-Export-Row-Count', String(Number(result.rows || 0)));
  res.setHeader('X-Export-Warning-Count', String(Number(result.warningCount || 0)));
  return res.send(result.buffer);
}

function sendSafeInternalError(res, logCode, publicMessage, err) {
  console.error(logCode, err && (err.stack || err.message || err));

  const payload = {
    ok: false,
    message: publicMessage
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.error = err && err.message ? err.message : String(err || '');
    payload.detail = err && err.stack ? err.stack : '';
  }

  return res.status(500).json(payload);
}

async function previewImport(req, res) {
  try {
    const files = req.importFiles || normalizeUploadedFiles(req);
    console.info('[IMPORT_PREVIEW_POST_STARTED]', {
      type: String(req.body?.type || '').trim(),
      importMode: String(req.body?.importMode || req.query?.importMode || '').trim(),
      fileCount: files.length,
      fileNames: files.map((file) => file.originalname || file.fileName || '').filter(Boolean),
      userName: req.user?.username || req.user?.fullName || ''
    });
    const result = await importExportService.previewImport({
      type: String(req.body?.type || '').trim(),
      files,
      buffer: files[0]?.buffer,
      fileName: files[0]?.originalname || '',
      userName: req.user?.username || req.user?.fullName || '',
      importMode: String(req.body?.importMode || req.query?.importMode || '').trim()
    });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error, ...result });
    return res.status(result.accepted ? 202 : 200).json({ ok: true, source: 'import-export-route', ...result });
  } catch (err) {
    return sendSafeInternalError(
      res,
      '[IMPORT_PREVIEW_ERROR]',
      'Không đọc được file import',
      err
    );
  }
}

async function commitImport(req, res) {
  try {
    const sessionId = String(req.body?.sessionId || req.body?.importSessionId || '').trim();
    const submitted = await AsyncJobHttpAdapter.submitImportCommit(req);
    if (submitted.error) return res.status(submitted.status || 400).json({ ok: false, message: submitted.error });
    if (AsyncJobHttpAdapter.prefersAsync(req)) {
      return res.status(202).json(AsyncJobHttpAdapter.acceptedPayload(submitted, {
        source: 'import-export-route', sessionId, importSessionId: sessionId
      }));
    }
    const waited = await AsyncJobHttpAdapter.waitImportCompatibility(submitted, sessionId);
    if (waited.timeout) return res.status(202).json(AsyncJobHttpAdapter.acceptedPayload(submitted, { source: 'import-export-route', sessionId }));
    if (waited.error) return res.status(waited.status || 500).json({ ok: false, message: waited.error, code: waited.code });
    return res.json({ ok: true, source: 'import-export-route', ...waited.result });
  } catch (err) {
    return sendSafeInternalError(res, '[IMPORT_COMMIT_ERROR]', 'Không ghi được dữ liệu import', err);
  }
}



async function sessionRows(req, res) {
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

    if (result.status === 'failed') {
      const httpStatus = result.errorKind === 'data' ? 422 : 500;
      return res.status(httpStatus).json({
        ok: false,
        source: 'import-export-route',
        message: result.errorMessage || 'Import worker thất bại',
        ...result
      });
    }

    return res.json({
      ok: true,
      source: 'import-export-route',
      ...result
    });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được trạng thái import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
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
    res.status(500).json({ ok: false, message: 'Không tải được lịch sử import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function listBuiltInTemplates(req, res) {
  res.json({ ok: true, templates: importTemplateService.getBuiltInTemplates() });
}

async function downloadBuiltInTemplate(req, res) {
  try {
    sendWorkbook(res, await importTemplateService.buildBuiltInTemplateFile(req.params.type));
  } catch (err) {
    res.status(err.statusCode || 500).json({ ok: false, message: err.message || 'Không tạo được mẫu import Excel' });
  }
}

async function fields(req, res) {
  res.json({ ok: true, fields: importTemplateService.getFields(req.params.type) });
}

async function listCustomTemplates(req, res) {
  try {
    res.json({ ok: true, templates: await importTemplateService.listCustomTemplates() });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tải được mẫu import tự tạo', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function saveCustomTemplate(req, res) {
  try {
    const result = await importTemplateService.saveCustomTemplate(req.body || {});
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, message: 'Đã lưu mẫu import', template: result.template });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lưu được mẫu import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function removeCustomTemplate(req, res) {
  try {
    const result = await importTemplateService.deleteCustomTemplate(req.params.id);
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, message: 'Đã xóa mẫu import' });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không xóa được mẫu import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function downloadCustomTemplate(req, res) {
  try {
    sendWorkbook(res, await importTemplateService.buildCustomTemplateFile(req.params.id));
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không tạo được file mẫu import', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function exportTypes(req, res) {
  res.json({ ok: true, types: importExportService.getExportTypes() });
}

async function exportExcel(req, res) {
  try {
    const idempotencyKey = String(req.headers['x-idempotency-key'] || req.query.idempotencyKey || '').trim();
    const submitted = await JobSubmissionService.submitExport({
      type: req.params.type,
      query: req.query || {},
      user: req.user || {},
      idempotencyKey
    });
    if (AsyncJobHttpAdapter.prefersAsync(req)) {
      return res.status(202).json(AsyncJobHttpAdapter.acceptedPayload(submitted, { source: 'import-export-route' }));
    }
    const terminal = await BackgroundJobService.waitForTerminal(submitted.job.id, {
      timeoutMs: Number(process.env.BACKGROUND_JOB_COMPAT_WAIT_MS || 10 * 60 * 1000)
    });
    if (!terminal) return res.status(202).json(AsyncJobHttpAdapter.acceptedPayload(submitted, { source: 'import-export-route' }));
    if (terminal.status !== 'completed') {
      return res.status(terminal.lastError?.retryable === false ? 422 : 500).json({
        ok: false,
        message: terminal.lastError?.message || 'Không export được dữ liệu',
        code: terminal.lastError?.code || terminal.status,
        ...(terminal.lastError?.details || {})
      });
    }
    if (!terminal.artifact?.fileId) return res.status(500).json({ ok: false, message: 'Export hoàn thành nhưng thiếu artifact' });
    res.setHeader('Content-Type', terminal.artifact.contentType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(terminal.artifact.fileName || 'export.xlsx')}`);
    res.setHeader('Content-Length', String(Number(terminal.artifact.size || 0)));
    res.setHeader('X-Export-Order-Count', String(Number(terminal.result?.orderCount || 0)));
    res.setHeader('X-Export-Row-Count', String(Number(terminal.result?.rows || 0)));
    res.setHeader('X-Export-Warning-Count', String(Number(terminal.result?.warningCount || 0)));
    const stream = ArtifactStore.openDownloadStream(terminal.artifact.fileId);
    stream.once('error', (error) => {
      if (!res.headersSent) res.status(404).json({ ok: false, message: 'Không đọc được artifact export' });
      else res.destroy(error);
    });
    return stream.pipe(res);
  } catch (err) {
    const status = Number(err.statusCode || err.status || 500);
    return res.status(status).json({
      ok: false,
      message: status < 500 ? (err.message || 'Bộ lọc xuất dữ liệu không hợp lệ') : 'Không export được dữ liệu',
      code: err.code,
      error: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
}

module.exports = {
  previewImport,
  sessionStatus,
  sessionRows,
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
