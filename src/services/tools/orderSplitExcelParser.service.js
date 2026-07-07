'use strict';

/**
 * OUT-OF-FLOW TOOL ONLY.
 * This module must not create/update/delete ERP business data.
 * Do not import order/accounting/inventory/invoice services here.
 */

const ExcelJS = require('exceljs');

const REQUIRED_TOTAL_HEADERS = ['Mã SP', 'Tên SP', 'Số lượng', 'Đơn giá', 'Thành tiền'];
const REQUIRED_TARGET_HEADERS = ['Mã đơn con', 'Giá trị mong muốn'];
const INVOICE_HEADERS = ['Mã đơn con', 'Tên khách hàng', 'Mã số thuế', 'Địa chỉ', 'Người mua hàng', 'Hình thức thanh toán', 'Ghi chú hóa đơn'];

function normalizeHeader(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeKey(value) {
  return normalizeHeader(value).toLowerCase();
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/\s/g, '').replace(/,/g, '').replace(/₫|đ/gi, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function getSheet(workbook, name) {
  return workbook.getWorksheet(name) || workbook.worksheets.find((ws) => normalizeKey(ws.name) === normalizeKey(name));
}

function readHeaderMap(sheet) {
  const row = sheet.getRow(1);
  const map = new Map();
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizeHeader(cell.value);
    if (header) map.set(normalizeKey(header), colNumber);
  });
  return map;
}

function assertHeaders(sheet, required, sheetName) {
  const map = readHeaderMap(sheet);
  const missing = required.filter((header) => !map.has(normalizeKey(header)));
  if (missing.length) {
    throw new Error(`Sheet ${sheetName} thiếu cột bắt buộc: ${missing.join(', ')}`);
  }
  return map;
}

function cellText(row, headerMap, header) {
  const col = headerMap.get(normalizeKey(header));
  if (!col) return '';
  const value = row.getCell(col).value;
  if (value && typeof value === 'object' && value.text) return String(value.text).trim();
  if (value && typeof value === 'object' && value.result != null) return String(value.result).trim();
  return String(value == null ? '' : value).trim();
}

function cellNumber(row, headerMap, header) {
  const col = headerMap.get(normalizeKey(header));
  if (!col) return 0;
  const value = row.getCell(col).value;
  if (value && typeof value === 'object' && value.result != null) return toNumber(value.result);
  return toNumber(value);
}

function readDonTong(sheet) {
  const map = assertHeaders(sheet, REQUIRED_TOTAL_HEADERS, 'DON_TONG');
  const items = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const productCode = cellText(row, map, 'Mã SP');
    const productName = cellText(row, map, 'Tên SP');
    const quantity = cellNumber(row, map, 'Số lượng');
    const unitPrice = cellNumber(row, map, 'Đơn giá');
    const lineAmount = cellNumber(row, map, 'Thành tiền');
    const unit = cellText(row, map, 'Đơn vị tính') || '';
    const vatRate = cellNumber(row, map, 'Thuế suất VAT');
    if (!productCode && !productName && !quantity && !unitPrice && !lineAmount) return;
    items.push({
      rowNumber,
      productCode,
      productName,
      quantity: Math.trunc(quantity),
      unitPrice,
      lineAmount,
      unit,
      vatRate: vatRate > 0 ? vatRate : null
    });
  });
  return items;
}

function readTargets(sheet) {
  const map = assertHeaders(sheet, REQUIRED_TARGET_HEADERS, 'DON_CON_TARGET');
  const targets = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const orderCode = cellText(row, map, 'Mã đơn con');
    const targetAmount = cellNumber(row, map, 'Giá trị mong muốn');
    if (!orderCode && !targetAmount) return;
    targets.push({ rowNumber, orderCode, targetAmount });
  });
  return targets;
}

function readInvoiceInfo(sheet, warnings) {
  const info = new Map();
  if (!sheet) {
    warnings.push({ type: 'MISSING_INVOICE_INFO', message: 'Không có sheet THONG_TIN_HOA_DON. File VAT sẽ để trống thông tin khách hàng.', level: 'WARN' });
    return info;
  }
  const map = readHeaderMap(sheet);
  const missing = ['Mã đơn con'].filter((header) => !map.has(normalizeKey(header)));
  if (missing.length) {
    warnings.push({ type: 'INVALID_INVOICE_INFO', message: 'Sheet THONG_TIN_HOA_DON thiếu Mã đơn con. Bỏ qua thông tin hóa đơn.', level: 'WARN' });
    return info;
  }
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const orderCode = cellText(row, map, 'Mã đơn con');
    if (!orderCode) return;
    const record = { orderCode };
    INVOICE_HEADERS.forEach((header) => { record[header] = cellText(row, map, header); });
    info.set(orderCode, record);
  });
  return info;
}

function validateParsedData(items, targets, warnings) {
  if (!items.length) throw new Error('Sheet DON_TONG không có dòng hàng hợp lệ.');
  if (!targets.length) throw new Error('Sheet DON_CON_TARGET không có dòng target hợp lệ.');
  const seenItems = new Set();
  items.forEach((item) => {
    if (!item.productCode) throw new Error(`DON_TONG dòng ${item.rowNumber} thiếu Mã SP.`);
    if (!item.productName) warnings.push({ type: 'MISSING_PRODUCT_NAME', message: `DON_TONG dòng ${item.rowNumber} thiếu Tên SP.`, level: 'WARN' });
    if (!Number.isInteger(item.quantity) || item.quantity < 0) throw new Error(`DON_TONG dòng ${item.rowNumber} có Số lượng không hợp lệ.`);
    if (item.unitPrice < 0) throw new Error(`DON_TONG dòng ${item.rowNumber} có Đơn giá không hợp lệ.`);
    const expected = item.quantity * item.unitPrice;
    if (Math.abs(expected - item.lineAmount) > 1) {
      warnings.push({ type: 'LINE_AMOUNT_MISMATCH', message: `DON_TONG dòng ${item.rowNumber}: Thành tiền lệch so với Số lượng × Đơn giá. Hệ thống dùng Số lượng × Đơn giá.`, level: 'WARN' });
    }
    const key = item.productCode;
    if (seenItems.has(key)) warnings.push({ type: 'DUPLICATE_PRODUCT', message: `Mã SP ${key} xuất hiện nhiều dòng. Hệ thống xử lý như các dòng độc lập.`, level: 'WARN' });
    seenItems.add(key);
  });
  const seenTargets = new Set();
  targets.forEach((target) => {
    if (!target.orderCode) throw new Error(`DON_CON_TARGET dòng ${target.rowNumber} thiếu Mã đơn con.`);
    if (target.targetAmount <= 0) throw new Error(`DON_CON_TARGET dòng ${target.rowNumber} có Giá trị mong muốn không hợp lệ.`);
    if (seenTargets.has(target.orderCode)) throw new Error(`Mã đơn con ${target.orderCode} bị trùng trong DON_CON_TARGET.`);
    seenTargets.add(target.orderCode);
  });
}

async function parseWorkbookBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const warnings = [];
  const totalSheet = getSheet(workbook, 'DON_TONG');
  const targetSheet = getSheet(workbook, 'DON_CON_TARGET');
  if (!totalSheet) throw new Error('Không tìm thấy sheet DON_TONG.');
  if (!targetSheet) throw new Error('Không tìm thấy sheet DON_CON_TARGET.');
  const items = readDonTong(totalSheet);
  const targets = readTargets(targetSheet);
  const invoiceInfo = readInvoiceInfo(getSheet(workbook, 'THONG_TIN_HOA_DON'), warnings);
  validateParsedData(items, targets, warnings);
  return { items, targets, invoiceInfo: Array.from(invoiceInfo.values()), warnings };
}

module.exports = {
  parseWorkbookBuffer,
  REQUIRED_TOTAL_HEADERS,
  REQUIRED_TARGET_HEADERS,
  INVOICE_HEADERS,
  toNumber
};
