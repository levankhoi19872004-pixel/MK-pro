'use strict';

/**
 * OUT-OF-FLOW TOOL ONLY.
 * This module must not create/update/delete ERP business data.
 * Do not import order/accounting/inventory/invoice services here.
 */

const ExcelJS = require('exceljs');
const { roundMoney } = require('./orderSplitAlgorithm.service');

function styleSheet(sheet) {
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.columns.forEach((column) => {
    let max = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      max = Math.max(max, String(cell.value == null ? '' : cell.value).length + 2);
    });
    column.width = Math.min(Math.max(max, 12), 45);
  });
  sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).getCell(sheet.columnCount).address };
}

function normalizeVatRate(rate, fallback) {
  const value = Number(rate != null ? rate : fallback);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > 1 ? value / 100 : value;
}

function calcVatLine(line, options) {
  const rate = normalizeVatRate(line.vatRate, options.vatRate || 10);
  const grossInput = options.priceIncludesVat === true;
  const rawAmount = roundMoney(line.quantity * line.unitPrice);
  if (grossInput) {
    const beforeVat = roundMoney(rawAmount / (1 + rate));
    const vatAmount = roundMoney(rawAmount - beforeVat);
    return { beforeVat, vatAmount, afterVat: rawAmount, ratePercent: roundMoney(rate * 100) };
  }
  const beforeVat = rawAmount;
  const vatAmount = roundMoney(beforeVat * rate);
  return { beforeVat, vatAmount, afterVat: roundMoney(beforeVat + vatAmount), ratePercent: roundMoney(rate * 100) };
}

function buildInvoiceMap(invoiceInfo = []) {
  const map = new Map();
  invoiceInfo.forEach((row) => {
    if (row && row.orderCode) map.set(row.orderCode, row);
    if (row && row['Mã đơn con']) map.set(row['Mã đơn con'], row);
  });
  return map;
}

function pickInfo(info, header) {
  if (!info) return '';
  const aliases = {
    'Tên khách hàng': ['Tên khách hàng', 'customerName'],
    'Mã số thuế': ['Mã số thuế', 'taxCode'],
    'Địa chỉ': ['Địa chỉ', 'address'],
    'Người mua hàng': ['Người mua hàng', 'buyerName'],
    'Hình thức thanh toán': ['Hình thức thanh toán', 'paymentMethod'],
    'Ghi chú hóa đơn': ['Ghi chú hóa đơn', 'note']
  };
  const keys = aliases[header] || [header];
  for (const key of keys) {
    if (info[key] != null && String(info[key]).trim()) return info[key];
  }
  return '';
}

async function createVatWorkbook(result, rawOptions = {}) {
  const options = {
    vatRate: Number(rawOptions.vatRate) || 10,
    priceIncludesVat: rawOptions.priceIncludesVat === true,
    roundingMode: rawOptions.roundingMode || 'line',
    orderPrefix: String(rawOptions.orderPrefix || '').trim()
  };
  const invoiceMap = buildInvoiceMap(result.invoiceInfo || []);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MK-Pro Order Split VAT Export Tool';

  const vat = workbook.addWorksheet('HOA_DON_VAT');
  vat.columns = [
    { header: 'STT', key: 'stt' },
    { header: 'Mã đơn con', key: 'orderCode' },
    { header: 'Tên khách hàng', key: 'customerName' },
    { header: 'Mã số thuế', key: 'taxCode' },
    { header: 'Địa chỉ', key: 'address' },
    { header: 'Người mua hàng', key: 'buyerName' },
    { header: 'Hình thức thanh toán', key: 'paymentMethod' },
    { header: 'Mã hàng', key: 'productCode' },
    { header: 'Tên hàng hóa', key: 'productName' },
    { header: 'Đơn vị tính', key: 'unit' },
    { header: 'Số lượng', key: 'quantity' },
    { header: 'Đơn giá chưa VAT', key: 'unitPriceBeforeVat' },
    { header: 'Thành tiền chưa VAT', key: 'beforeVat' },
    { header: 'Thuế suất VAT', key: 'vatRate' },
    { header: 'Tiền VAT', key: 'vatAmount' },
    { header: 'Tổng tiền sau VAT', key: 'afterVat' },
    { header: 'Ghi chú', key: 'note' }
  ];

  const totalsByOrder = new Map();
  let stt = 1;
  (result.resultLines || []).forEach((line) => {
    const info = invoiceMap.get(line.orderCode);
    const calc = calcVatLine(line, options);
    const beforeUnit = line.quantity ? roundMoney(calc.beforeVat / line.quantity) : 0;
    const outputOrderCode = `${options.orderPrefix}${line.orderCode}`;
    vat.addRow([
      stt++, outputOrderCode, pickInfo(info, 'Tên khách hàng'), pickInfo(info, 'Mã số thuế'), pickInfo(info, 'Địa chỉ'),
      pickInfo(info, 'Người mua hàng'), pickInfo(info, 'Hình thức thanh toán'), line.productCode, line.productName,
      line.unit || '', line.quantity, beforeUnit, calc.beforeVat, `${calc.ratePercent}%`, calc.vatAmount, calc.afterVat, pickInfo(info, 'Ghi chú hóa đơn')
    ]);
    const current = totalsByOrder.get(line.orderCode) || { beforeVat: 0, vatAmount: 0, afterVat: 0 };
    current.beforeVat = roundMoney(current.beforeVat + calc.beforeVat);
    current.vatAmount = roundMoney(current.vatAmount + calc.vatAmount);
    current.afterVat = roundMoney(current.afterVat + calc.afterVat);
    totalsByOrder.set(line.orderCode, current);
  });
  styleSheet(vat);

  const compare = workbook.addWorksheet('DOI_CHIEU_HOA_DON');
  compare.columns = [
    { header: 'Mã đơn con', key: 'orderCode' },
    { header: 'Target', key: 'target' },
    { header: 'Giá trị hàng trước VAT', key: 'beforeVat' },
    { header: 'Tiền VAT', key: 'vatAmount' },
    { header: 'Tổng sau VAT', key: 'afterVat' },
    { header: 'Chênh lệch với target', key: 'diff' },
    { header: 'Trạng thái', key: 'status' }
  ];
  (result.compareRows || []).forEach((row) => {
    const totals = totalsByOrder.get(row.orderCode) || { beforeVat: 0, vatAmount: 0, afterVat: 0 };
    const comparedValue = options.priceIncludesVat ? totals.afterVat : totals.beforeVat;
    const diff = roundMoney(comparedValue - row.targetAmount);
    compare.addRow([`${options.orderPrefix}${row.orderCode}`, row.targetAmount, totals.beforeVat, totals.vatAmount, totals.afterVat, diff, row.status]);
  });
  styleSheet(compare);

  const warnings = workbook.addWorksheet('CANH_BAO');
  warnings.columns = [
    { header: 'Mã đơn con', key: 'orderCode' },
    { header: 'Loại cảnh báo', key: 'type' },
    { header: 'Nội dung', key: 'message' },
    { header: 'Mức độ', key: 'level' }
  ];
  (result.warnings || []).forEach((row) => warnings.addRow([row.orderCode || '', row.type, row.message, row.level]));
  (result.compareRows || []).forEach((row) => {
    if (!invoiceMap.has(row.orderCode)) warnings.addRow([row.orderCode, 'MISSING_INVOICE_INFO', 'Thiếu thông tin khách hàng/hóa đơn cho đơn con này.', 'WARN']);
  });
  styleSheet(warnings);

  return workbook.xlsx.writeBuffer();
}

module.exports = { createVatWorkbook };
