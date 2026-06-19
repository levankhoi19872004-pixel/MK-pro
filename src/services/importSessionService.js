'use strict';

const { makeId } = require('../utils/common.util');
const ImportSession = require('../models/ImportSession');
const ImportSessionRow = require('../models/ImportSessionRow');
const { cleanupImportFiles, cleanupImportSession } = require('../utils/importTempFileStore');

const IMPORT_PREVIEW_LIMIT = Number(process.env.IMPORT_PREVIEW_LIMIT || 100);
const IMPORT_SESSION_ROW_BATCH_SIZE = Number(process.env.IMPORT_SESSION_ROW_BATCH_SIZE || 500);

function cleanText(value) {
  return String(value ?? '').trim();
}

function getRowDocumentCode(row = {}) {
  return cleanText(
    row.documentCode ||
    row.orderCode ||
    row.code ||
    row.refCode ||
    row.invoiceCode ||
    row.username ||
    ''
  );
}

function getRowSourceFile(row = {}) {
  return cleanText(
    row.sourceFile ||
    row.__sourceFile ||
    row.fileName ||
    row.originalFileName ||
    ''
  );
}

function compactPreviewRow(row = {}) {
  const cloned = { ...row };

  // Không đưa payload nặng vào import_sessions.
  delete cloned.raw;
  delete cloned.__importRows;
  delete cloned.__adjustedRows;

  if (Array.isArray(cloned.lineDetails)) {
    cloned.lineDetails = cloned.lineDetails.slice(0, 20);
    cloned.lineDetailsTruncated = row.lineDetails.length > 20;
  }

  if (Array.isArray(cloned.detailErrors)) {
    cloned.detailErrors = cloned.detailErrors.slice(0, 20);
    cloned.detailErrorsTruncated = row.detailErrors.length > 20;
  }

  if (Array.isArray(cloned.shortageReport)) {
    cloned.shortageReport = cloned.shortageReport.slice(0, 20);
    cloned.shortageReportTruncated = row.shortageReport.length > 20;
  }

  return cloned;
}

function normalizeErrors(rows = []) {
  return rows.flatMap((row) => {
    const errors = Array.isArray(row?.errors) ? row.errors : [];
    return errors.map((err) => {
      if (err && typeof err === 'object') {
        return {
          row: row.__rowNo || row.rowNo || err.row || 0,
          field: err.field || '',
          message: err.message || err.error || String(err),
          rawValue: err.rawValue
        };
      }

      return {
        row: row?.__rowNo || row?.rowNo || 0,
        field: '',
        message: String(err || ''),
        rawValue: undefined
      };
    });
  }).filter((err) => err.message);
}

function isValidImportRow(row = {}) {
  return row && row.valid !== false && row.canImport !== false && (!Array.isArray(row.errors) || row.errors.length === 0);
}

function buildSessionRowDoc(sessionId, type, row = {}, index = 0) {
  const rowErrors = Array.isArray(row.errors) ? row.errors : [];
  const valid = isValidImportRow(row);

  return {
    sessionId,
    type,
    rowNo: Number(row.rowNo || row.__rowNo || index + 1),
    rowKey: `${getRowSourceFile(row)}|${getRowDocumentCode(row)}|${index + 1}`,
    documentCode: getRowDocumentCode(row),
    sourceFile: getRowSourceFile(row),
    valid,
    canImport: row.canImport !== false,
    status: valid ? 'valid' : 'invalid',
    normalizedRow: row,
    previewRow: compactPreviewRow(row),
    rawRow: row.raw || {},
    rowErrors,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

async function insertRowsInBatches(docs = []) {
  for (let i = 0; i < docs.length; i += IMPORT_SESSION_ROW_BATCH_SIZE) {
    const batch = docs.slice(i, i + IMPORT_SESSION_ROW_BATCH_SIZE);
    if (batch.length) {
      await ImportSessionRow.insertMany(batch, { ordered: false });
    }
  }
}

async function createUploadedSession({ type, fileName = '', fileNames = [], createdBy = '', importMode = 'create' }) {
  const id = makeId('IMP');

  return ImportSession.create({
    id,
    sessionId: id,
    type,
    fileName,
    fileNames,
    importMode: importMode === 'update' ? 'update' : 'create',
    status: 'uploaded',
    createdBy,
    createdAt: new Date(),
    updatedAt: new Date()
  });
}

async function markQueued(id, { files = [] } = {}) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOneAndUpdate(
    { $or: [{ id: value }, { sessionId: value }] },
    {
      $set: {
        status: 'queued',
        queuedAt: new Date(),
        updatedAt: new Date(),
        progress: {
          percent: 0,
          step: 'queued'
        },
        tempFiles: (Array.isArray(files) ? files : []).map((file) => ({
          fileName: cleanText(file.fileName),
          path: cleanText(file.path),
          size: Number(file.size || 0)
        }))
      }
    },
    { new: true }
  );
}

async function updateProgress(id, { percent = 0, step = '' } = {}) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOneAndUpdate(
    { $or: [{ id: value }, { sessionId: value }] },
    {
      $set: {
        progress: {
          percent: Math.max(0, Math.min(100, Number(percent) || 0)),
          step: cleanText(step)
        },
        updatedAt: new Date()
      }
    },
    { new: true }
  );
}

async function markParsing(id) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOneAndUpdate(
    { $or: [{ id: value }, { sessionId: value }] },
    {
      $set: {
        status: 'parsing',
        startedAt: new Date(),
        updatedAt: new Date(),
        progress: {
          percent: 10,
          step: 'reading_file'
        }
      }
    },
    { new: true }
  );
}

async function markWorkerStarted(id, { workerPid, diagnosticId = '', startedAt = new Date() } = {}) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOneAndUpdate(
    { $or: [{ id: value }, { sessionId: value }] },
    {
      $set: {
        worker: {
          pid: Number(workerPid || 0),
          diagnosticId: cleanText(diagnosticId),
          startedAt,
          durationMs: 0,
          exitCode: null,
          signal: ''
        },
        updatedAt: new Date()
      }
    },
    { new: true }
  );
}

async function savePreviewResult(id, { rows = [], previewRows = [], fileNames = [], deferFinalState = false } = {}) {
  const value = cleanText(id);
  if (!value) return null;

  const session = await ImportSession.findOne({
    $or: [{ id: value }, { sessionId: value }]
  }).lean();

  if (!session) return null;

  const sessionId = session.sessionId || session.id;
  const errors = normalizeErrors(rows);
  const validRows = rows.filter(isValidImportRow);
  const errorRowNumbers = new Set(errors.map((err) => err.row).filter(Boolean));

  await ImportSessionRow.deleteMany({ sessionId });

  const rowDocs = rows.map((row, index) =>
    buildSessionRowDoc(sessionId, session.type, row, index)
  );

  await insertRowsInBatches(rowDocs);

  const now = new Date();
  const setPayload = {
    totalRows: rows.length,
    validRows: validRows.length,
    errorRows: errorRowNumbers.size || errors.length,
    importErrors: errors.slice(0, 1000),
    previewRows: (previewRows.length ? previewRows : rows)
      .slice(0, IMPORT_PREVIEW_LIMIT)
      .map(compactPreviewRow),
    rowStorage: 'collection',
    storedRows: rowDocs.length,
    fileNames,
    updatedAt: now
  };

  const unsetPayload = {
    errors: '',
    validDataRows: '',
    rawRows: ''
  };

  if (deferFinalState) {
    setPayload.progress = { percent: 95, step: 'awaiting_finalize' };
  } else {
    setPayload.status = 'preview_ready';
    setPayload.finishedAt = now;
    setPayload.progress = { percent: 100, step: 'completed' };
    unsetPayload.tempFiles = '';
    unsetPayload.failure = '';
    unsetPayload.errorMessage = '';
  }

  return ImportSession.findOneAndUpdate(
    { $or: [{ id: value }, { sessionId: value }] },
    {
      $set: setPayload,
      $unset: unsetPayload
    },
    { new: true }
  );
}

async function finalizePreview(id, { workerPid, diagnosticId = '', durationMs = 0 } = {}) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOneAndUpdate(
    {
      $or: [{ id: value }, { sessionId: value }],
      status: { $in: ['queued', 'parsing'] }
    },
    {
      $set: {
        status: 'preview_ready',
        finishedAt: new Date(),
        progress: {
          percent: 100,
          step: 'completed'
        },
        'worker.pid': Number(workerPid || 0),
        'worker.diagnosticId': cleanText(diagnosticId),
        'worker.durationMs': Math.max(0, Number(durationMs) || 0),
        'worker.exitCode': 0,
        'worker.signal': '',
        updatedAt: new Date()
      },
      $unset: {
        tempFiles: '',
        failure: '',
        errorMessage: ''
      }
    },
    { new: true }
  );
}

async function markFailed(id, errorMessage, details = {}) {
  const value = cleanText(id);
  if (!value) return null;

  const stage = cleanText(details.stage || 'unknown');
  const hasExitCode = details.exitCode !== null && details.exitCode !== undefined && details.exitCode !== '';
  const exitCode = hasExitCode && Number.isFinite(Number(details.exitCode))
    ? Number(details.exitCode)
    : null;

  return ImportSession.findOneAndUpdate(
    {
      $or: [{ id: value }, { sessionId: value }],
      status: { $nin: ['preview_ready', 'done'] }
    },
    {
      $set: {
        status: 'failed',
        errorMessage: String(errorMessage || ''),
        failedAt: new Date(),
        finishedAt: new Date(),
        failure: {
          stage,
          code: cleanText(details.code || 'IMPORT_FAILED'),
          workerPid: Number(details.workerPid || 0),
          exitCode,
          signal: cleanText(details.signal),
          diagnosticId: cleanText(details.diagnosticId),
          durationMs: Math.max(0, Number(details.durationMs) || 0)
        },
        'worker.pid': Number(details.workerPid || 0),
        'worker.diagnosticId': cleanText(details.diagnosticId),
        'worker.durationMs': Math.max(0, Number(details.durationMs) || 0),
        'worker.exitCode': exitCode,
        'worker.signal': cleanText(details.signal),
        progress: {
          percent: 100,
          step: stage && stage !== 'unknown' ? `failed:${stage}` : 'failed'
        },
        updatedAt: new Date()
      },
      $unset: {
        tempFiles: ''
      }
    },
    { new: true }
  );
}

async function getSession(id) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOne({
    $or: [{ id: value }, { sessionId: value }]
  }).lean();
}


async function listSessionRows(id, { offset = 0, limit = 500 } = {}) {
  const session = await getSession(id);
  if (!session) return null;

  const sessionId = cleanText(session.sessionId || session.id);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 500));

  const [docs, total] = await Promise.all([
    ImportSessionRow.aggregate([
      { $match: { sessionId } },
      { $sort: { rowNo: 1, _id: 1 } },
      { $skip: safeOffset },
      { $limit: safeLimit },
      {
        $project: {
          row: { $ifNull: ['$previewRow', '$normalizedRow'] },
          rowNo: 1,
          documentCode: 1,
          valid: 1,
          canImport: 1,
          status: 1
        }
      }
    ]),
    ImportSessionRow.countDocuments({ sessionId })
  ]);

  const rows = docs.map((doc) => {
    const row = compactPreviewRow(doc.row || {});
    if (!row.rowNo && doc.rowNo) row.rowNo = doc.rowNo;
    if (!row.documentCode && doc.documentCode) row.documentCode = doc.documentCode;
    if (row.valid === undefined) row.valid = doc.valid;
    if (row.canImport === undefined) row.canImport = doc.canImport;
    return row;
  });

  return {
    sessionId,
    rows,
    offset: safeOffset,
    limit: safeLimit,
    total,
    hasMore: safeOffset + rows.length < total
  };
}

async function markImporting(id) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOneAndUpdate(
    { $or: [{ id: value }, { sessionId: value }], status: 'preview_ready' },
    {
      $set: {
        status: 'importing',
        updatedAt: new Date(),
        progress: {
          percent: 1,
          step: 'preparing_commit'
        }
      }
    },
    { new: true }
  );
}

async function markDone(id, result = {}) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOneAndUpdate(
    { $or: [{ id: value }, { sessionId: value }] },
    {
      $set: {
        status: 'done',
        result,
        confirmedAt: new Date(),
        updatedAt: new Date(),
        progress: {
          percent: 100,
          step: 'done'
        }
      }
    },
    { new: true }
  );
}

async function selectRows(session, selectedOrderCodes = []) {
  const sessionId = cleanText(session?.sessionId || session?.id);
  if (!sessionId) return [];

  const selected = new Set(
    (selectedOrderCodes || [])
      .map((v) => cleanText(v))
      .filter(Boolean)
  );

  const query = { sessionId };

  if (selected.size) {
    query.documentCode = { $in: Array.from(selected) };
  }

  const docs = await ImportSessionRow
    .find(query)
    .sort({ rowNo: 1 })
    .lean();

  const rows = docs
    .map((doc) => doc.normalizedRow)
    .filter(Boolean);

  if (!selected.size) return rows;

  return rows.filter((row) =>
    selected.has(getRowDocumentCode(row))
  );
}


async function recoverStaleImportSessions({ olderThanMs = Number(process.env.IMPORT_STALE_SESSION_MS || 15 * 60 * 1000), limit = 100 } = {}) {
  const cutoff = new Date(Date.now() - Math.max(60_000, Number(olderThanMs) || 15 * 60 * 1000));
  const stale = await ImportSession.find({
    status: { $in: ['queued', 'parsing'] },
    updatedAt: { $lt: cutoff }
  }).sort({ updatedAt: 1 }).limit(Math.max(1, Math.min(500, Number(limit) || 100))).lean();

  for (const session of stale) {
    const sessionId = cleanText(session.sessionId || session.id);
    await markFailed(sessionId, 'Import bị gián đoạn do server restart hoặc worker không phản hồi. Vui lòng tải lại file.');
    const files = Array.isArray(session.tempFiles) ? session.tempFiles : [];
    if (files.length) await cleanupImportFiles(files).catch(() => {});
    await cleanupImportSession(sessionId).catch(() => {});
  }

  return { recovered: stale.length, cutoff };
}

module.exports = {
  createUploadedSession,
  markQueued,
  updateProgress,
  markParsing,
  markWorkerStarted,
  savePreviewResult,
  finalizePreview,
  markFailed,
  recoverStaleImportSessions,
  getSession,
  listSessionRows,
  markImporting,
  markDone,
  selectRows
};
