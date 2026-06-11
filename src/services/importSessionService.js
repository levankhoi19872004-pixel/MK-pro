'use strict';

const { makeId } = require('../utils/common.util');
const ImportSession = require('../models/ImportSession');
const ImportSessionRow = require('../models/ImportSessionRow');

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

async function createUploadedSession({ type, fileName = '', fileNames = [], createdBy = '' }) {
  const id = makeId('IMP');

  return ImportSession.create({
    id,
    sessionId: id,
    type,
    fileName,
    fileNames,
    status: 'uploaded',
    createdBy,
    createdAt: new Date(),
    updatedAt: new Date()
  });
}

async function markQueued(id) {
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
        }
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
        rawRows: ''
      }
    },
    { new: true }
  );
}

async function markFailed(id, errorMessage) {
  return ImportSession.findOneAndUpdate(
    { $or: [{ id }, { sessionId: id }] },
    {
      $set: {
        status: 'failed',
        errorMessage: String(errorMessage || ''),
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
}

async function getSession(id) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOne({
    $or: [{ id: value }, { sessionId: value }]
  }).lean();
}

async function markImporting(id) {
  const value = cleanText(id);
  if (!value) return null;

  return ImportSession.findOneAndUpdate(
    { $or: [{ id: value }, { sessionId: value }], status: 'preview_ready' },
    { $set: { status: 'importing', updatedAt: new Date() } },
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
        updatedAt: new Date()
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

module.exports = {
  createUploadedSession,
  markQueued,
  updateProgress,
  markParsing,
  savePreviewResult,
  markFailed,
  getSession,
  markImporting,
  markDone,
  selectRows
};
