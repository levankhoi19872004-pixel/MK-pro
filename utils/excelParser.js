const XLSX = require('xlsx');

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

function pickImportSheet(workbook) {
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) return '';

  // Mẫu Excel của hệ thống có 3 sheet: HuongDan, DuLieuMau, Import.
  // Dữ liệu thật phải được đọc từ sheet Import, không đọc sheet đầu tiên.
  const importSheet = sheetNames.find((name) => cleanKey(name).toLowerCase() === 'import');
  if (importSheet) return importSheet;

  // Nếu người dùng dùng file riêng, chọn sheet đầu tiên có dữ liệu dạng bảng.
  return sheetNames[0];
}

function parseExcelBuffer(buffer) {
  if (!buffer || !buffer.length) return [];
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = pickImportSheet(workbook);
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  // Dùng raw:true + cellDates:true để giữ ô ngày Excel là Date object.
  // Nếu dùng raw:false, file DMS có format mm-dd-yy sẽ thành chuỗi 06-01-26,
  // sau đó hệ thống Việt Nam hiểu nhầm là 06/01/2026 thay vì 01/06/2026.
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true, blankrows: false });

  return rows.map((row, index) => {
    const cleanRow = { __rowNo: index + 2 };
    Object.keys(row).forEach((key) => {
      const cleanedKey = cleanKey(key);
      if (!cleanedKey || cleanedKey.startsWith('__EMPTY')) return;
      cleanRow[cleanedKey] = typeof row[key] === 'string' ? row[key].trim() : row[key];
    });
    return cleanRow;
  }).filter(rowHasData);
}

module.exports = { parseExcelBuffer };
