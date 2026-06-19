'use strict';

const readXlsxFileModule = require('read-excel-file/node');
const readSheet = readXlsxFileModule.readSheet || readXlsxFileModule.default || readXlsxFileModule;
const readWorkbook = readXlsxFileModule.default || readXlsxFileModule.readExcelFile || readSheet;

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

function normalizeHeader(value = '') {
  return cleanKey(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isEmptyValue(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function rowHasData(row) {
  return Object.keys(row || {}).some((key) => key !== '__rowNo' && key !== '__headerRowNo' && !isEmptyValue(row[key]));
}

function assertSizeLimit(condition) {
  if (!condition) throw new Error(TOO_LARGE_ERROR);
}

function normalizeCell(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function usableHeadersFromLine(line = []) {
  return (Array.isArray(line) ? line : [])
    .map(cleanKey)
    .filter(Boolean)
    .filter((header) => !header.startsWith('__EMPTY'));
}

function headerScore(line = []) {
  const headers = usableHeadersFromLine(line);
  if (!headers.length) return 0;

  const normalized = headers.map(normalizeHeader).join(' | ');
  const keywordScore = [
    'ma kh',
    'ma khach',
    'customer',
    'khach hang',
    'ma sp',
    'ma hang',
    'ma hang hoa',
    'san pham',
    'product',
    'barcode',
    'so luong',
    'quantity',
    'don gia',
    'gia ban',
    'amount',
    'thanh tien',
    'hoa don',
    'invoice',
    'ma don',
    'order',
    'ngay',
    'date',
    'nvbh',
    'nvtt',
    'nhan vien',
    'staff'
  ].reduce((score, keyword) => score + (normalized.includes(keyword) ? 3 : 0), 0);

  return Math.min(headers.length, 20) + keywordScore;
}

function findHeaderRowIndex(matrix = []) {
  const scanLimit = Math.min(Array.isArray(matrix) ? matrix.length : 0, 30);
  let bestIndex = -1;
  let bestScore = 0;

  for (let index = 0; index < scanLimit; index += 1) {
    const line = matrix[index] || [];
    const usableHeaders = usableHeadersFromLine(line);
    if (usableHeaders.length < 2) continue;

    const score = headerScore(line);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function rowsToObjects(matrix = []) {
  if (!Array.isArray(matrix) || matrix.length < 2) return [];

  const headerIndex = findHeaderRowIndex(matrix);
  if (headerIndex < 0) return [];

  const headers = (matrix[headerIndex] || []).map(cleanKey);
  const usableHeaders = headers.filter(Boolean).filter((header) => !header.startsWith('__EMPTY'));

  assertSizeLimit(usableHeaders.length <= MAX_COLUMNS);
  assertSizeLimit(matrix.length - headerIndex - 1 <= MAX_ROWS);

  const rows = [];

  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const line = matrix[i] || [];
    const row = {
      __rowNo: i + 1,
      __headerRowNo: headerIndex + 1
    };

    headers.forEach((header, colIndex) => {
      const cleanedKey = cleanKey(header);
      if (!cleanedKey || cleanedKey.startsWith('__EMPTY')) return;
      row[cleanedKey] = normalizeCell(line[colIndex] ?? '');
    });

    if (rowHasData(row)) rows.push(row);
  }

  return rows;
}

function isMatrix(value) {
  return Array.isArray(value) && (!value.length || Array.isArray(value[0]));
}

function sheetObjectData(row) {
  return row && Array.isArray(row.data) ? row.data : [];
}

function normalizeWorkbookResultToMatrix(result, requestedSheet) {
  if (isMatrix(result)) return result;

  if (!Array.isArray(result)) return [];

  const sheets = result.filter((item) => item && Array.isArray(item.data));
  if (!sheets.length) return [];

  if (requestedSheet) {
    const requested = String(requestedSheet).trim().toLowerCase();
    const byName = sheets.find((item) => String(item.sheet || '').trim().toLowerCase() === requested);
    if (byName) return sheetObjectData(byName);

    const sheetIndex = Number(requestedSheet);
    if (Number.isInteger(sheetIndex) && sheetIndex >= 1 && sheets[sheetIndex - 1]) {
      return sheetObjectData(sheets[sheetIndex - 1]);
    }
  }

  const firstWithData = sheets.find((item) => Array.isArray(item.data) && item.data.length);
  return sheetObjectData(firstWithData || sheets[0]);
}

async function readSheetMatrix(buffer, options = {}) {
  const readOptions = {
    ...options,
    dateFormat: 'dd/mm/yyyy'
  };

  // read-excel-file v8/v9: named export readSheet() returns a single sheet matrix.
  // Older builds may expose only the default reader, which can return either a matrix
  // or [{ sheet, data }] depending on package version.
  if (typeof readXlsxFileModule.readSheet === 'function') {
    return readXlsxFileModule.readSheet(buffer, readOptions);
  }

  const result = await readWorkbook(buffer, readOptions);
  return normalizeWorkbookResultToMatrix(result, options.sheet);
}

async function readSheetRows(buffer, options = {}) {
  const matrix = await readSheetMatrix(buffer, options);
  return rowsToObjects(matrix);
}

async function parseExcelBuffer(buffer) {
  if (!buffer || !buffer.length) return [];

  const attempts = [
    { sheet: 'Import' },
    {},
    ...Array.from({ length: MAX_SHEETS }, (_, index) => ({ sheet: index + 1 }))
  ];

  const seen = new Set();
  const errors = [];

  for (const options of attempts) {
    const key = Object.prototype.hasOwnProperty.call(options, 'sheet') ? `sheet:${options.sheet}` : 'default';
    if (seen.has(key)) continue;
    seen.add(key);

    try {
      const rows = await readSheetRows(buffer, options);
      if (Array.isArray(rows) && rows.length) return rows;
    } catch (err) {
      errors.push(err && err.message ? err.message : String(err));
      // Không phải workbook nào cũng có sheet Import hoặc đủ sheet theo index.
      // Tiếp tục thử sheet khác thay vì báo rỗng ngay.
    }
  }

  return [];
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
