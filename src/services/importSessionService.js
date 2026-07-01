'use strict';

const { makeId } = require('../utils/common.util');
const ImportSession = require('../models/ImportSession');
const ImportSessionRow = require('../models/ImportSessionRow');
const BackgroundJob = require('../models/BackgroundJob');
const { cleanupImportFiles, cleanupImportSession } = require('../utils/importTempFileStore');

const IMPORT_PREVIEW_LIMIT = Number(process.env.IMPORT_PREVIEW_LIMIT || 100);
const IMPORT_SESSION_ROW_BATCH_SIZE = Number(process.env.IMPORT_SESSION_ROW_BATCH_SIZE || 500);

function cleanText(value) {
  return String(value ?? '').trim();
}

const IMPORT_FAILURE_MESSAGE_MAX = 1200;
const IMPORT_FAILURE_STACK_MAX = 8000;

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeImportFailureText(value, maxLength) {
  let text = String(value ?? '').replace(/\0/g, '').trim();
  if (!text) return '';

  const cwd = cleanText(process.cwd());
  if (cwd) text = text.replace(new RegExp(escapeRegExp(cwd), 'g'), '<app>');

  text = text
    .replace(/(mongodb(?:\+srv)?:\/\/)([^@\s]+)@/gi, '$1<redacted>@')
    .replace(/\b(authorization|cookie|password|passwd|secret|token)\s*[:=]\s*([^\s,;]+)/gi, '$1=<redacted>');

  return text.slice(0, Math.max(1, Number(maxLength) || IMPORT_FAILURE_MESSAGE_MAX));
}

function normalizeImportFailure(failure = {}) {
  const source = failure && typeof failure === 'object' && !Array.isArray(failure)
    ? failure
    : { message: failure };
  const kind = source.kind === 'data' ? 'data' : 'system';
  const rawCode = cleanText(source.code || (kind === 'data' ? 'IMPORT_EXCEL_DATA_ERROR' : 'IMPORT_WORKER_SYSTEM_ERROR'));
  const code = rawCode.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80) || 'IMPORT_WORKER_SYSTEM_ERROR';
  const message = sanitizeImportFailureText(
    source.message || (kind === 'data' ? 'Dữ liệu Excel không hợp lệ' : 'Import worker thất bại'),
    IMPORT_FAILURE_MESSAGE_MAX
  );
  const stack = sanitizeImportFailureText(source.stack || '', IMPORT_FAILURE_STACK_MAX);

  return {
    code,
    kind,
    message,
    stack,
    source: sanitizeImportFailureText(source.source || '', 40),
    exitCode: Number.isInteger(source.exitCode) ? source.exitCode : null,
    signal: sanitizeImportFailureText(source.signal || '', 40),
    at: new Date().toISOString()
  };
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

function getRowProgramCode(row = {}) {
  return cleanText(row.programCode || row.promotionCode || row.groupCode || '');
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
          step: 'parsing'
        }
      }
    },
    { new: true }
  );
}

async function savePreviewResult(id, { rows = [], previewRows = [], fileNames = [] } = {}) {
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

  return ImportSession.findOneAndUpdate(
    { $or: [{ id: value }, { sessionId: value }] },
    {
      $set: {
        status: 'preview_ready',
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
        finishedAt: new Date(),
        progress: {
          percent: 100,
          step: 'preview_ready'
        },
        updatedAt: new Date()
      },
      $unset: {
        errors: '',
        validDataRows: '',
        rawRows: '',
        tempFiles: ''
      }
    },
    { new: true }
  );
}

async function markFailed(id, failure, { preserveExistingDetails = false } = {}) {
  const value = cleanText(id);
  if (!value) return null;

  const normalizedFailure = normalizeImportFailure(failure);
  const identityFilter = { $or: [{ id: value }, { sessionId: value }] };
  const filter = preserveExistingDetails
    ? {
        $and: [
          identityFilter,
          {
            $or: [
              { 'result.importFailure.message': { $exists: false } },
              { 'result.importFailure.message': '' }
            ]
          }
        ]
      }
    : identityFilter;

  const updated = await ImportSession.findOneAndUpdate(
    filter,
    {
      $set: {
        status: 'failed',
        errorMessage: normalizedFailure.message,
        'result.importFailure': normalizedFailure,
        failedAt: new Date(),
        finishedAt: new Date(),
        progress: {
          percent: 100,
          step: 'failed'
        },
        updatedAt: new Date()
      }
    },
    { new: true }
  );

  if (!updated && preserveExistingDetails) return getSession(value);
  return updated;
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

async function selectRows(session, selectedOrderCodes = [], selectedRowNumbers = [], selectedProgramCodes = []) {
  const sessionId = cleanText(session?.sessionId || session?.id);
  if (!sessionId) return [];

  const selected = new Set(
    (selectedOrderCodes || [])
      .map((v) => cleanText(v))
      .filter(Boolean)
  );
  const selectedRows = new Set(
    (selectedRowNumbers || [])
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0)
  );

  const selectedPrograms = new Set(
    (selectedProgramCodes || [])
      .map((v) => cleanText(v))
      .filter(Boolean)
  );

  const query = { sessionId };

  if (selected.size && selectedRows.size) {
    query.$or = [
      { documentCode: { $in: Array.from(selected) } },
      { rowNo: { $in: Array.from(selectedRows) } }
    ];
  } else if (selected.size) {
    query.documentCode = { $in: Array.from(selected) };
  } else if (selectedRows.size) {
    query.rowNo = { $in: Array.from(selectedRows) };
  }

  const docs = await ImportSessionRow
    .find(query)
    .sort({ rowNo: 1 })
    .lean();

  const rows = docs
    .map((doc) => doc.normalizedRow)
    .filter(Boolean);

  if (!selected.size && !selectedRows.size && !selectedPrograms.size) return rows;

  return rows.filter((row, index) => {
    const rowNo = Number(row?.rowNo || row?.sourceRowNo || row?.__rowNo || row?.rowNumber || docs[index]?.rowNo || 0);
    return selected.has(getRowDocumentCode(row)) || selectedRows.has(rowNo) || selectedPrograms.has(getRowProgramCode(row));
  });
}



async function recoverStaleImportSessions({ olderThanMs = Number(process.env.IMPORT_STALE_SESSION_MS || 15 * 60 * 1000), limit = 100 } = {}) {
  const cutoff = new Date(Date.now() - Math.max(60_000, Number(olderThanMs) || 15 * 60 * 1000));
  const stale = await ImportSession.find({
    status: { $in: ['queued', 'parsing'] },
    updatedAt: { $lt: cutoff }
  }).sort({ updatedAt: 1 }).limit(Math.max(1, Math.min(500, Number(limit) || 100))).lean();

  const sessionIds = stale.map((session) => cleanText(session.sessionId || session.id)).filter(Boolean);
  const activeJobs = sessionIds.length ? await BackgroundJob.find({
    type: 'import_preview',
    idempotencyKey: { $in: sessionIds.map((id) => `import-preview:${id}`) },
    status: { $in: ['pending', 'running', 'cancel_requested'] }
  }).select({ idempotencyKey: 1 }).lean() : [];
  const protectedSessions = new Set(activeJobs.map((job) => cleanText(job.idempotencyKey).replace(/^import-preview:/, '')));

  let recovered = 0;
  let preserved = 0;
  for (const session of stale) {
    const sessionId = cleanText(session.sessionId || session.id);
    // Persistent jobs survive web/worker restarts through their Mongo lease. Do not
    // fail a queued session merely because the web process has not updated it recently.
    if (protectedSessions.has(sessionId)) {
      preserved += 1;
      continue;
    }
    await markFailed(sessionId, 'Import bị gián đoạn và không còn background job có thể tiếp tục. Vui lòng tải lại file.');
    const files = Array.isArray(session.tempFiles) ? session.tempFiles : [];
    if (files.length) await cleanupImportFiles(files).catch(() => {});
    await cleanupImportSession(sessionId).catch(() => {});
    recovered += 1;
  }

  return { recovered, preserved, cutoff };
}

module.exports = {
  createUploadedSession,
  markQueued,
  updateProgress,
  markParsing,
  savePreviewResult,
  markFailed,
  normalizeImportFailure,
  recoverStaleImportSessions,
  getSession,
  listSessionRows,
  markImporting,
  markDone,
  selectRows
};
