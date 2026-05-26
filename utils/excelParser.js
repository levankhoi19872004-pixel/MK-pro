const XLSX = require('xlsx');

function cleanKey(key) {
  return String(key || '').trim();
}

function parseExcelBuffer(buffer) {
  if (!buffer || !buffer.length) return [];
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows.map((row, index) => {
    const cleanRow = { __rowNo: index + 2 };
    Object.keys(row).forEach((key) => {
      cleanRow[cleanKey(key)] = typeof row[key] === 'string' ? row[key].trim() : row[key];
    });
    return cleanRow;
  });
}

module.exports = { parseExcelBuffer };
