'use strict';

const fs = require('node:fs');
const path = require('node:path');
let ExcelJS = null;

function getExcelJS() {
  if (!ExcelJS) ExcelJS = require('exceljs');
  return ExcelJS;
}

const TEMPLATE_RELATIVE_PATH = 'templates/vnpt/FileMauHoaDon1Thue_TT78.xlsx';
const SHEET_NAME = 'Sheet1';
const MAX_TEMPLATE_COLUMN = 55; // BC

const REQUIRED_HEADERS = Object.freeze({
  A: 'STT',
  B: 'NgayHoaDon',
  C: 'MaKhachHang',
  D: 'TenKhachHang',
  E: 'TenNguoiMua',
  F: 'MaSoThue',
  G: 'DiaChiKhachHang',
  H: 'DienThoaiKhachHang',
  I: 'SoTaiKhoan',
  J: 'NganHang',
  K: 'HinhThucTT',
  L: 'MaSanPham',
  M: 'SanPham',
  N: 'DonViTinh',
  O: 'Extra1SP',
  P: 'Extra2SP',
  Q: 'SoLuong',
  R: 'DonGia',
  S: 'TyLeChietKhau',
  T: 'SoTienChietKhau',
  U: 'ThanhTien',
  V: 'TienBan',
  W: 'ThueSuat',
  X: 'TienThueSanPham',
  Y: 'TienThue',
  Z: 'TongCong',
  AA: 'TinhChatHangHoa',
  AB: 'DonViTienTe',
  AC: 'TyGia',
  AD: 'Fkey',
  AS: 'LDDNBo',
  AT: 'HDSo',
  AU: 'HVTNXHang',
  AV: 'TNVChuyen',
  AW: 'PTVChuyen',
  AX: 'HDKTNgay',
  AY: 'HDKTSo',
  AZ: 'CCCDan',
  BC: 'mau_01'
});

const SHEET1_COLUMN_BY_FIELD = Object.freeze({
  STT: 'A',
  NgayHoaDon: 'B',
  MaKhachHang: 'C',
  TenKhachHang: 'D',
  TenNguoiMua: 'E',
  MaSoThue: 'F',
  DiaChiKhachHang: 'G',
  DienThoaiKhachHang: 'H',
  SoTaiKhoan: 'I',
  NganHang: 'J',
  HinhThucTT: 'K',
  MaSanPham: 'L',
  SanPham: 'M',
  DonViTinh: 'N',
  Extra1SP: 'O',
  Extra2SP: 'P',
  SoLuong: 'Q',
  DonGia: 'R',
  TyLeChietKhau: 'S',
  SoTienChietKhau: 'T',
  ThanhTien: 'U',
  TienBan: 'V',
  ThueSuat: 'W',
  TienThueSanPham: 'X',
  TienThue: 'Y',
  TongCong: 'Z',
  TinhChatHangHoa: 'AA',
  DonViTienTe: 'AB',
  TyGia: 'AC',
  Fkey: 'AD',
  Extra1: 'AE',
  Extra2: 'AF',
  EmailKhachHang: 'AG',
  VungDuLieu: 'AH',
  Extra3: 'AI',
  Extra4: 'AJ',
  Extra5: 'AK',
  Extra6: 'AL',
  Extra7: 'AM',
  Extra8: 'AN',
  Extra9: 'AO',
  Extra10: 'AP',
  Extra11: 'AQ',
  Extra12: 'AR',
  LDDNBo: 'AS',
  HDSo: 'AT',
  HVTNXHang: 'AU',
  TNVChuyen: 'AV',
  PTVChuyen: 'AW',
  HDKTNgay: 'AX',
  HDKTSo: 'AY',
  CCCDan: 'AZ'
});

const TEXT_FIELDS = new Set([
  'MaKhachHang',
  'MaSoThue',
  'DienThoaiKhachHang',
  'SoTaiKhoan',
  'MaSanPham',
  'Fkey',
  'HDSo',
  'HDKTSo',
  'CCCDan'
]);

function templatePath() {
  return path.resolve(process.cwd(), TEMPLATE_RELATIVE_PATH);
}

function cellValueText(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || '').join('');
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return String(value.text || '');
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return cellValueText(value.result);
  }
  return String(value).trim();
}

function validateVnptTt78Template(worksheet) {
  if (!worksheet) throw new Error(`[VNPT_TEMPLATE_INVALID] Missing ${SHEET_NAME}`);
  for (const [column, expected] of Object.entries(REQUIRED_HEADERS)) {
    const address = `${column}1`;
    const actual = cellValueText(worksheet.getCell(address).value);
    if (actual !== expected) {
      throw new Error(`[VNPT_TEMPLATE_INVALID] ${SHEET_NAME} ${address} expected "${expected}" but got "${actual}"`);
    }
  }
}

function cloneStyle(style) {
  return style ? JSON.parse(JSON.stringify(style)) : {};
}

function captureRowStyle(row) {
  const styles = [];
  for (let col = 1; col <= MAX_TEMPLATE_COLUMN; col += 1) {
    const cell = row.getCell(col);
    styles[col] = {
      style: cloneStyle(cell.style),
      numFmt: cell.numFmt
    };
  }
  return { height: row.height, hidden: row.hidden, outlineLevel: row.outlineLevel, styles };
}

function applyRowStyle(targetRow, rowStyle) {
  if (!rowStyle) return;
  if (rowStyle.height) targetRow.height = rowStyle.height;
  if (rowStyle.hidden) targetRow.hidden = rowStyle.hidden;
  if (rowStyle.outlineLevel) targetRow.outlineLevel = rowStyle.outlineLevel;
  for (let col = 1; col <= MAX_TEMPLATE_COLUMN; col += 1) {
    const source = rowStyle.styles[col] || {};
    const target = targetRow.getCell(col);
    // Reuse the captured style object instead of deep-cloning it per cell/per row.
    // ExcelJS already serializes style IDs on write; cloning here is a major heap amplifier
    // when Render runs with a small old-space limit.
    target.style = source.style || {};
    if (source.numFmt) target.numFmt = source.numFmt;
  }
}

function setText(cell, value) {
  cell.value = value == null || value === '' ? '' : String(value);
  cell.numFmt = '@';
}

function setCellValue(cell, value, { text = false } = {}) {
  if (text) return setText(cell, value);
  if (value == null || value === '') {
    cell.value = '';
    return;
  }
  cell.value = value;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return '';
}

function normalizeSheet1Row(row = {}, state = {}) {
  const fkey = firstNonEmpty(row.Fkey, row.orderCode, row.MaDon, row.salesOrderCode, state.lastFkey);
  if (fkey) state.lastFkey = String(fkey);
  return {
    STT: row.STT,
    NgayHoaDon: row.NgayHoaDon,
    MaKhachHang: row.MaKhachHang ?? row.customerCode,
    TenKhachHang: row.TenKhachHang ?? row.customerName,
    TenNguoiMua: row.TenNguoiMua ?? row.buyerName,
    MaSoThue: row.MaSoThue ?? row.taxCode,
    DiaChiKhachHang: row.DiaChiKhachHang ?? row.DiaChi ?? row.address,
    DienThoaiKhachHang: row.DienThoaiKhachHang ?? row.DienThoai ?? row.phone,
    SoTaiKhoan: row.SoTaiKhoan ?? row.bankAccount,
    NganHang: row.NganHang ?? row.bankName,
    HinhThucTT: row.HinhThucTT ?? row.HinhThucThanhToan ?? row.paymentMethod,
    MaSanPham: row.MaSanPham ?? row.productCode,
    SanPham: row.SanPham ?? row.TenSanPham ?? row.productName,
    DonViTinh: row.DonViTinh ?? row.unit,
    Extra1SP: row.Extra1SP ?? row.conversionRate,
    Extra2SP: row.Extra2SP ?? row.salePrice,
    SoLuong: row.SoLuong ?? row.quantity,
    DonGia: row.DonGia ?? row.unitPriceBeforeVat,
    TyLeChietKhau: row.TyLeChietKhau,
    SoTienChietKhau: row.SoTienChietKhau,
    ThanhTien: row.ThanhTien ?? row.lineAmountBeforeVat,
    TienBan: row.TienBan,
    ThueSuat: row.ThueSuat,
    TienThueSanPham: row.TienThueSanPham,
    TienThue: row.TienThue,
    TongCong: row.TongCong,
    TinhChatHangHoa: row.TinhChatHangHoa,
    DonViTienTe: row.DonViTienTe,
    TyGia: row.TyGia,
    Fkey: fkey,
    Extra1: row.Extra1,
    Extra2: row.Extra2,
    EmailKhachHang: row.EmailKhachHang ?? row.Email ?? row.email,
    VungDuLieu: row.VungDuLieu,
    Extra3: row.Extra3,
    Extra4: row.Extra4,
    Extra5: row.Extra5,
    Extra6: row.Extra6,
    Extra7: row.Extra7,
    Extra8: row.Extra8,
    Extra9: row.Extra9,
    Extra10: row.Extra10,
    Extra11: row.Extra11,
    Extra12: row.Extra12,
    LDDNBo: row.LDDNBo,
    HDSo: row.HDSo,
    HVTNXHang: row.HVTNXHang,
    TNVChuyen: row.TNVChuyen,
    PTVChuyen: row.PTVChuyen,
    HDKTNgay: row.HDKTNgay,
    HDKTSo: row.HDKTSo,
    CCCDan: row.CCCDan
  };
}

function clearDataRows(worksheet) {
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let col = 1; col <= MAX_TEMPLATE_COLUMN; col += 1) {
      row.getCell(col).value = null;
    }
    row.commit();
  }
}

function maxExportRows() {
  const configured = Number(process.env.MAX_VNPT_EXPORT_ROWS || 3000);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : 3000;
}

function assertExportSize(rows = []) {
  const maxRows = maxExportRows();
  if (rows.length <= maxRows) return;
  const error = new Error(`[VNPT_EXPORT_TOO_LARGE] ${rows.length} rows exceeds limit ${maxRows}. Please split date range.`);
  error.status = 413;
  error.statusCode = 413;
  error.code = 'VNPT_EXPORT_TOO_LARGE';
  error.details = { rowCount: rows.length, maxRows };
  throw error;
}

function writeSheet1Rows(worksheet, rows = [], rowStyle) {
  const state = { lastFkey: '' };
  rows.forEach((row, index) => {
    const normalized = normalizeSheet1Row(row, state);
    const targetRow = worksheet.getRow(index + 2);
    applyRowStyle(targetRow, rowStyle);
    for (const [field, column] of Object.entries(SHEET1_COLUMN_BY_FIELD)) {
      const cell = targetRow.getCell(column);
      setCellValue(cell, normalized[field], { text: TEXT_FIELDS.has(field) });
    }
    targetRow.commit();
  });
}

function removeSheetIfExists(workbook, name) {
  const sheet = workbook.getWorksheet(name);
  if (sheet) workbook.removeWorksheet(sheet.id);
}

function addRowsSheet(workbook, name, headers = [], rows = []) {
  removeSheetIfExists(workbook, name);
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(headers.map((header) => row[header] ?? '')));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(headers.length).letter}1` };
  headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    const maxLength = Math.max(String(header).length, ...rows.slice(0, 100).map((row) => String(row[header] ?? '').length));
    column.width = Math.min(Math.max(maxLength + 2, 10), 42);
  });
  return sheet;
}

function summarizeRows(rows = []) {
  const fkeys = new Set();
  const summary = rows.reduce((acc, row) => {
    const fkey = firstNonEmpty(row.Fkey, row.orderCode, row.MaDon);
    if (fkey) fkeys.add(String(fkey));
    if (row.MaSanPham) acc.lineCount += 1;
    if (row.TienBan !== '' && row.TienBan != null) {
      acc.amountBeforeVat += Number(row.TienBan) || 0;
      acc.vatAmount += Number(row.TienThue) || 0;
      acc.totalAmount += Number(row.TongCong) || 0;
    }
    return acc;
  }, { lineCount: 0, amountBeforeVat: 0, vatAmount: 0, totalAmount: 0 });
  summary.invoiceCount = fkeys.size;
  return summary;
}

function addThongTinSheet(workbook, { dateFrom, dateTo, summary = {}, warnings = [] }) {
  removeSheetIfExists(workbook, 'ThongTin');
  const sheet = workbook.addWorksheet('ThongTin');
  const data = [
    ['Mẫu', 'TT78 - VNPT template'],
    ['Template', TEMPLATE_RELATIVE_PATH],
    ['Từ ngày', dateFrom === '0000-01-01' ? '' : (dateFrom || '')],
    ['Đến ngày', dateTo === '9999-12-31' ? '' : (dateTo || '')],
    ['Số hóa đơn', summary.invoiceCount || 0],
    ['Số dòng sản phẩm', summary.lineCount || 0],
    ['Tiền bán trước thuế', summary.amountBeforeVat || 0],
    ['Tiền thuế 8%', summary.vatAmount || 0],
    ['Tổng cộng', Math.round(summary.totalAmount || 0)],
    ['Cảnh báo', Array.isArray(warnings) ? warnings.length : 0],
    ['Quy tắc', 'Workbook clone từ template VNPT; Sheet1 giữ nguyên header/style/marker; dữ liệu fill từ dòng 2.']
  ];
  data.forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 90;
  return sheet;
}

async function buildVnptTt78WorkbookFromTemplate({ rows = [], auditRows = [], auditHeaders = [], summary, dateFrom = '', dateTo = '', warnings = [] } = {}) {
  assertExportSize(rows);
  const sourceTemplatePath = templatePath();
  if (!fs.existsSync(sourceTemplatePath)) {
    throw new Error(`[VNPT_TEMPLATE_MISSING] Missing committed template at ${TEMPLATE_RELATIVE_PATH}`);
  }
  const ExcelJSLib = getExcelJS();
  const workbook = new ExcelJSLib.Workbook();
  await workbook.xlsx.readFile(sourceTemplatePath);
  const worksheet = workbook.getWorksheet(SHEET_NAME);
  validateVnptTt78Template(worksheet);
  const rowStyle = captureRowStyle(worksheet.getRow(2));
  clearDataRows(worksheet);
  writeSheet1Rows(worksheet, rows, rowStyle);
  worksheet.views = worksheet.views && worksheet.views.length ? worksheet.views : [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = { from: 'A1', to: 'BC1' };

  if (auditHeaders.length) addRowsSheet(workbook, 'DoiChieu', auditHeaders, auditRows);
  const finalSummary = summary || summarizeRows(rows);
  addThongTinSheet(workbook, { dateFrom, dateTo, summary: finalSummary, warnings });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}

module.exports = {
  TEMPLATE_RELATIVE_PATH,
  REQUIRED_HEADERS,
  validateVnptTt78Template,
  maxExportRows,
  assertExportSize,
  buildVnptTt78WorkbookFromTemplate
};
