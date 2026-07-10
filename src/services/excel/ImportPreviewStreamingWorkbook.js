'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

function sanitizeSheetName(name) {
  return String(name || 'Sheet')
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'Sheet';
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function sanitizeExcelValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function cellValue(row, column) {
  const value = typeof column.value === 'function' ? column.value(row) : row?.[column.key];
  if (column.type === 'number' || column.type === 'money') {
    if (column.preserveBlank && (value === '' || value === null || value === undefined)) return '';
    return toNumber(value);
  }
  return sanitizeExcelValue(value);
}

async function createTempWorkbookPath() {
  const dir = path.join(os.tmpdir(), 'mkpro-export-workbooks');
  await fs.mkdir(dir, { recursive: true });
  return path.join(dir, `import-preview-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.xlsx`);
}

function appendAoaSheet(workbook, name, rows = [], options = {}) {
  const worksheet = workbook.addWorksheet(sanitizeSheetName(name));
  if (Array.isArray(options.widths)) {
    worksheet.columns = options.widths.map((width) => ({ width: Number(width) || 12 }));
  }
  for (const row of rows || []) {
    worksheet.addRow(Array.isArray(row) ? row : [row]).commit();
  }
  if (options.autoFilter && rows.length) {
    const colCount = Math.max(...rows.map((row) => (Array.isArray(row) ? row.length : 1)), 1);
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: colCount }
    };
  }
  worksheet.commit();
}

function appendObjectSheet(workbook, name, columns = [], rows = []) {
  const worksheet = workbook.addWorksheet(sanitizeSheetName(name));
  worksheet.columns = columns.map((column) => ({ width: column.width || 16 }));
  worksheet.addRow(columns.map((column) => column.label)).commit();
  for (const row of rows || []) {
    worksheet.addRow(columns.map((column) => cellValue(row, column))).commit();
  }
  if (columns.length) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length }
    };
  }
  worksheet.commit();
}

async function writeImportPreviewWorkbook({ infoRows = [], columns = [], allRows = [], validRows = [], invalidRows = [] } = {}) {
  const filePath = await createTempWorkbookPath();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: filePath,
    useStyles: false,
    useSharedStrings: false
  });

  appendAoaSheet(workbook, 'ThongTin', infoRows, { widths: [28, 55] });
  appendObjectSheet(workbook, 'TatCa', columns, allRows);
  appendObjectSheet(workbook, 'HopLe', columns, validRows);
  appendObjectSheet(workbook, 'Loi', columns, invalidRows);

  await workbook.commit();
  const stat = await fs.stat(filePath);
  return { filePath, outputBytes: stat.size };
}

module.exports = {
  writeImportPreviewWorkbook,
  _internal: {
    sanitizeSheetName,
    cellValue
  }
};
