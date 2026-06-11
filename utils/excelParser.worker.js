'use strict';

const readXlsxFile = require('read-excel-file/node');
const { readSheetNames } = require('read-excel-file/node');

const MAX_ROWS = Number(process.env.IMPORT_MAX_ROWS || 10000);
const MAX_COLUMNS = Number(process.env.IMPORT_MAX_COLUMNS || 100);
const MAX_SHEETS = Number(process.env.IMPORT_MAX_SHEETS || 5);
const TOO_LARGE_ERROR = 'File Excel quá lớn, vui lòng tách nhỏ file trước khi import';

function cleanKey(key) {
  return String(key || '')
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEmptyValue(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function rowHasData(row) {
  return Object.keys(row || {}).some((key) => key !== '__rowNo' && !isEmptyValue(row[key]));
}

function assertSizeLimit(condition) {
  if (!condition) throw new Error(TOO_LARGE_ERROR);
}

function normalizeCell(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function rowsToObjects(matrix = []) {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];

  const headers = matrix[0].map(cleanKey);
  const usableHeaders = headers.filter(Boolean).filter((header) => !header.startsWith('__EMPTY'));

  assertSizeLimit(usableHeaders.length <= MAX_COLUMNS);
  assertSizeLimit(matrix.length - 1 <= MAX_ROWS);

  const rows = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const line = matrix[i] || [];
    const row = { __rowNo: i + 1 };

    headers.forEach((header, colIndex) => {
      const cleanedKey = cleanKey(header);
      if (!cleanedKey || cleanedKey.startsWith('__EMPTY')) return;
      row[cleanedKey] = normalizeCell(line[colIndex] ?? '');
    });

    if (rowHasData(row)) rows.push(row);
  }

  return rows;
}

async function parseExcelBuffer(buffer) {
  if (!buffer || !buffer.length) return [];

  const sheetNames = await readSheetNames(buffer);

  if (!Array.isArray(sheetNames) || !sheetNames.length) return [];
  assertSizeLimit(sheetNames.length <= MAX_SHEETS);

  // Ưu tiên sheet Import nếu có, nếu không lấy sheet đầu tiên của file.
  const selectedSheet =
    sheetNames.find((name) => cleanKey(name).toLowerCase() === 'import') ||
    sheetNames[0];

  const matrix = await readXlsxFile(buffer, {
    sheet: selectedSheet,
    dateFormat: 'dd/mm/yyyy'
  });

  return rowsToObjects(matrix);
}

process.on('message', async (message = {}) => {
  try {
    const buffer = Buffer.from(String(message.buffer || ''), 'base64');
    const rows = await parseExcelBuffer(buffer);

    if (process.send) {
      process.send({ ok: true, rows });
    }
  } catch (err) {
    if (process.send) {
      process.send({
        ok: false,
        error: err && err.message ? err.message : String(err)
      });
    }
  }
});
