const XLSX = require('xlsx');

function cleanKey(key) {
  return String(key || '').trim();
}

function chooseDataSheet(workbook) {
  if (!workbook || !Array.isArray(workbook.SheetNames)) return '';
  const exactImport = workbook.SheetNames.find((name) => String(name).trim().toLowerCase() === 'import');
  if (exactImport) return exactImport;
  const dataSheet = workbook.SheetNames.find((name) => ['data', 'dulieu', 'du lieu', 'dữ liệu'].includes(String(name).trim().toLowerCase()));
  if (dataSheet) return dataSheet;
  return workbook.SheetNames[0] || '';
}

function parseExcelBuffer(buffer, options = {}) {
  if (!buffer || !buffer.length) return [];
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const requestedSheet = options.sheetName ? String(options.sheetName).trim() : '';
  const sheetName = requestedSheet && workbook.Sheets[requestedSheet] ? requestedSheet : chooseDataSheet(workbook);
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows
    .map((row, index) => {
      const cleanRow = { __rowNo: index + 2, __sheetName: sheetName };
      Object.keys(row).forEach((key) => {
        cleanRow[cleanKey(key)] = typeof row[key] === 'string' ? row[key].trim() : row[key];
      });
      return cleanRow;
    })
    .filter((row) => Object.keys(row).some((key) => !key.startsWith('__') && String(row[key] || '').trim() !== ''));
}

module.exports = { parseExcelBuffer, chooseDataSheet };
