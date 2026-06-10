'use strict';

const ExcelJS = require('exceljs');

function sanitizeSheetName(name) {
  const cleaned = String(name || 'Sheet1').replace(/[\\/*?:[\]]/g, ' ').trim();
  return (cleaned || 'Sheet1').slice(0, 31);
}

function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MK-pro';
  workbook.created = new Date();
  workbook.modified = new Date();
  return workbook;
}

function appendAoaSheet(workbook, name, rows = [], options = {}) {
  const worksheet = workbook.addWorksheet(sanitizeSheetName(name));
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    worksheet.addRow(Array.isArray(row) ? row : [row]);
  });

  const widths = options.widths || [];
  if (widths.length) {
    worksheet.columns = widths.map((width) => ({ width: Math.max(8, Number(width) || 12) }));
  } else if (rows.length) {
    const columnCount = Math.max(...rows.map((row) => Array.isArray(row) ? row.length : 1));
    worksheet.columns = Array.from({ length: columnCount }, (_, index) => {
      const maxLength = rows.reduce((max, row) => {
        const value = Array.isArray(row) ? row[index] : (index === 0 ? row : '');
        return Math.max(max, String(value ?? '').length);
      }, 10);
      return { width: Math.max(10, Math.min(35, maxLength + 4)) };
    });
  }

  if (options.autoFilter && rows.length > 0) {
    const columnCount = Array.isArray(rows[0]) ? rows[0].length : 1;
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(rows.length, 1), column: Math.max(columnCount, 1) }
    };
  }

  return worksheet;
}

async function writeWorkbookBuffer(workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

module.exports = {
  createWorkbook,
  appendAoaSheet,
  writeWorkbookBuffer
};
