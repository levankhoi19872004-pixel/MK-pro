'use strict';

const importExportService = require('../importExportService');
const excelImportService = require('../excelImportService');
const ReconciliationService = require('../../domain/reconciliation/ReconciliationService');
const { runImportPreviewJob } = require('../../jobs/importExcelJob');
const importSessionService = require('../importSessionService');
const ArtifactStore = require('./GridFsArtifactStore');
const BackgroundJobService = require('./BackgroundJobService');

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function jobError(result, fallback = 'Job xử lý thất bại') {
  const error = new Error(result?.error || result?.message || fallback);
  error.code = result?.code || 'BACKGROUND_JOB_HANDLER_ERROR';
  error.statusCode = Number(result?.status || 500);
  error.retryable = error.statusCode >= 500;
  error.details = {
    errors: result?.errors,
    totalErrors: result?.totalErrors,
    errorReportUrl: result?.errorReportUrl
  };
  return error;
}

async function runExport(job) {
  await ArtifactStore.removeByJobId(job.id).catch(() => 0);
  await BackgroundJobService.updateProgress(job.id, { percent: 10, step: 'loading_export_data' });
  const result = await importExportService.exportToExcel(job.payload.type, job.payload.query || {}, job.payload.currentUser || {});
  if (result?.error) throw jobError(result, 'Không tạo được file export');
  await BackgroundJobService.updateProgress(job.id, { percent: 85, step: 'persisting_artifact' });
  const artifact = await ArtifactStore.putBuffer(result.buffer, {
    fileName: result.fileName || 'export.xlsx',
    contentType: XLSX_TYPE,
    metadata: { jobId: job.id, jobType: job.type, artifactKind: 'export_output' }
  });
  return {
    result: {
      fileName: result.fileName || 'export.xlsx',
      rows: Number(result.rows || 0),
      orderCount: Number(result.orderCount || 0),
      warningCount: Number(result.warningCount || 0),
      warnings: Array.isArray(result.warnings) ? result.warnings.slice(0, 100) : [],
      errorReportUrl: result.errorReportUrl || ''
    },
    artifact
  };
}

async function runImportPreview(job) {
  const inputArtifacts = Array.isArray(job.payload.inputArtifacts) ? job.payload.inputArtifacts : [];
  const files = [];
  await BackgroundJobService.updateProgress(job.id, { percent: 5, step: 'loading_import_artifacts' });
  for (const item of inputArtifacts) {
    files.push({
      fileName: item.fileName,
      size: item.size,
      buffer: await ArtifactStore.readBuffer(item.fileId, { maxBytes: Number(process.env.IMPORT_MAX_FILE_SIZE || 10 * 1024 * 1024) })
    });
  }
  const result = await runImportPreviewJob({
    sessionId: job.payload.sessionId,
    type: job.payload.importType,
    files,
    userName: job.payload.userName || '',
    importMode: job.payload.importMode || 'create'
  });
  if (result?.error) throw jobError(result, 'Không xử lý được preview import');
  for (const item of inputArtifacts) await ArtifactStore.remove(item.fileId).catch(() => false);
  return { result: { sessionId: job.payload.sessionId, status: 'preview_ready' } };
}

async function runImportCommit(job) {
  await BackgroundJobService.updateProgress(job.id, { percent: 2, step: 'validating_import_session' });
  const result = await excelImportService.commit({ ...(job.payload || {}), backgroundJobId: job.id });
  if (result?.error) throw jobError(result, 'Không commit được import');
  return {
    result: {
      sessionId: result.sessionId || result.importSessionId || job.payload.sessionId,
      imported: Number(result.imported || 0),
      message: result.message || 'Import thành công',
      shortageReportSaved: Boolean(result.shortageReportSaved),
      shortageReportCode: result.shortageReportCode || ''
    }
  };
}

async function runReconciliation(job) {
  await BackgroundJobService.updateProgress(job.id, { percent: 5, step: 'reconciliation_starting' });
  const result = await ReconciliationService.runReconciliation(job.payload.reconciliationType || 'all', {
    source: job.payload.source || 'background_job',
    checkedBy: job.payload.checkedBy || 'system'
  });
  return {
    result: {
      reportId: result?.id || result?._id || '',
      code: result?.code || '',
      status: result?.status || '',
      mismatchCount: Array.isArray(result?.items) ? result.items.length : Number(result?.mismatchCount || 0)
    }
  };
}

async function execute(job) {
  if (job.type === 'export_excel') return runExport(job);
  if (job.type === 'import_preview') return runImportPreview(job);
  if (job.type === 'import_commit') return runImportCommit(job);
  if (job.type === 'reconciliation') return runReconciliation(job);
  const error = new Error(`Không có handler cho job type ${job.type}`);
  error.code = 'BACKGROUND_JOB_HANDLER_MISSING';
  error.retryable = false;
  throw error;
}

module.exports = { execute, _private: { runExport, runImportPreview, runImportCommit, runReconciliation, jobError } };
