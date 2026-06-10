const readXlsxFile = require('read-excel-file/node');
const { readSheetNames } = require('read-excel-file/node');

const MAX_ROWS = 10000;
const MAX_COLUMNS = 100;
// Mẫu Excel hiện tại của hệ thống có thể có HuongDan, DuLieuMau, Import.
// Không khóa cứng 1 sheet để tránh phá import template đang dùng ở production.
const MAX_SHEETS = 5;
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

function cleanCellValue(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function assertSizeLimit(condition) {
  if (!condition) throw new Error(TOO_LARGE_ERROR);
}

async function pickImportSheet(buffer) {
  const sheetNames = await readSheetNames(buffer);
  assertSizeLimit(sheetNames.length <= MAX_SHEETS);
  if (!sheetNames.length) return '';

  // Mẫu Excel của hệ thống có 3 sheet: HuongDan, DuLieuMau, Import.
  // Dữ liệu thật phải được đọc từ sheet Import, không đọc sheet đầu tiên.
  const importSheet = sheetNames.find((name) => cleanKey(name).toLowerCase() === 'import');
  if (importSheet) return importSheet;

  // Nếu người dùng dùng file riêng, chọn sheet đầu tiên có dữ liệu dạng bảng.
  return sheetNames[0];
}

function rowsToObjects(matrix) {
  if (!Array.isArray(matrix) || !matrix.length) return [];
  assertSizeLimit(matrix.length - 1 <= MAX_ROWS);
  assertSizeLimit(matrix.every((row) => !Array.isArray(row) || row.length <= MAX_COLUMNS));

  const headers = (matrix[0] || []).map(cleanKey);
  assertSizeLimit(headers.length <= MAX_COLUMNS);

  return matrix.slice(1).map((row, index) => {
    const cleanRow = { __rowNo: index + 2 };
    headers.forEach((header, columnIndex) => {
      if (!header || header.startsWith('__EMPTY')) return;
      cleanRow[header] = cleanCellValue(row[columnIndex]);
    });
    return cleanRow;
  }).filter(rowHasData);
}

async function parseExcelBuffer(buffer) {
  if (!buffer || !buffer.length) return [];
  const sheet = await pickImportSheet(buffer);
  if (!sheet) return [];

  const matrix = await readXlsxFile(buffer, {
    sheet,
    dateFormat: 'yyyy-mm-dd'
  });

  return rowsToObjects(matrix);
}

module.exports = {
  parseExcelBuffer,
  MAX_ROWS,
  MAX_COLUMNS,
  MAX_SHEETS
};
