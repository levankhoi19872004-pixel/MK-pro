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
    column.width = Math.min(Math.max(max, 12), 42);
  });
  sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).getCell(sheet.columnCount).address };
}

function addRows(sheet, rows) {
  rows.forEach((row) => sheet.addRow(row));
  styleSheet(sheet);
}

async function createTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MK-Pro Order Split Tool';

  const total = workbook.addWorksheet('DON_TONG');
  total.columns = [
    { header: 'Mã SP', key: 'productCode' },
    { header: 'Tên SP', key: 'productName' },
    { header: 'Số lượng', key: 'quantity' },
    { header: 'Đơn giá', key: 'unitPrice' },
    { header: 'Thành tiền', key: 'amount' },
    { header: 'Đơn vị tính', key: 'unit' },
    { header: 'Thuế suất VAT', key: 'vatRate' }
  ];
  addRows(total, [
    ['SP001', 'Sản phẩm mẫu 1', 10, 100000, 1000000, 'Thùng', 10],
    ['SP002', 'Sản phẩm mẫu 2', 20, 50000, 1000000, 'Gói', 8]
  ]);

  const targets = workbook.addWorksheet('DON_CON_TARGET');
  targets.columns = [
    { header: 'Mã đơn con', key: 'orderCode' },
    { header: 'Giá trị mong muốn', key: 'targetAmount' }
  ];
  addRows(targets, [
    ['DC001', 750000],
    ['DC002', 650000],
    ['DC003', 600000]
  ]);

  const invoice = workbook.addWorksheet('THONG_TIN_HOA_DON');
  invoice.columns = [
    { header: 'Mã đơn con', key: 'orderCode' },
    { header: 'Tên khách hàng', key: 'customerName' },
    { header: 'Mã số thuế', key: 'taxCode' },
    { header: 'Địa chỉ', key: 'address' },
    { header: 'Người mua hàng', key: 'buyerName' },
    { header: 'Hình thức thanh toán', key: 'paymentMethod' },
    { header: 'Ghi chú hóa đơn', key: 'note' }
  ];
  addRows(invoice, [
    ['DC001', 'Khách hàng A', '0100000000', 'Thái Bình', 'Nguyễn Văn A', 'TM/CK', ''],
    ['DC002', 'Khách hàng B', '', 'Thái Bình', '', 'TM/CK', '']
  ]);

  return workbook.xlsx.writeBuffer();
}

async function createResultWorkbook(result) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MK-Pro Order Split Tool';

  const lines = workbook.addWorksheet('KET_QUA_CHIA_DON');
  lines.columns = [
    { header: 'Mã đơn con', key: 'orderCode' },
    { header: 'Mã SP', key: 'productCode' },
    { header: 'Tên SP', key: 'productName' },
    { header: 'SL chia', key: 'quantity' },
    { header: 'Đơn giá', key: 'unitPrice' },
    { header: 'Thành tiền', key: 'amount' }
  ];
  addRows(lines, (result.resultLines || []).map((row) => [row.orderCode, row.productCode, row.productName, row.quantity, row.unitPrice, row.amount]));

  const compare = workbook.addWorksheet('DOI_CHIEU_TARGET');
  compare.columns = [
    { header: 'Mã đơn con', key: 'orderCode' },
    { header: 'Target', key: 'targetAmount' },
    { header: 'Thực tế', key: 'actualAmount' },
    { header: 'Chênh lệch', key: 'diff' },
    { header: 'Tỷ lệ lệch', key: 'diffPercent' },
    { header: 'Trạng thái', key: 'status' }
  ];
  addRows(compare, (result.compareRows || []).map((row) => [row.orderCode, row.targetAmount, row.actualAmount, row.diff, `${roundMoney(row.diffPercent)}%`, row.status]));

  const stock = workbook.addWorksheet('TON_CON_LAI');
  stock.columns = [
    { header: 'Mã SP', key: 'productCode' },
    { header: 'Tên SP', key: 'productName' },
    { header: 'SL ban đầu', key: 'initialQty' },
    { header: 'SL đã chia', key: 'allocatedQty' },
    { header: 'SL còn lại', key: 'remainingQty' }
  ];
  addRows(stock, (result.stockRows || []).map((row) => [row.productCode, row.productName, row.initialQty, row.allocatedQty, row.remainingQty]));

  const warnings = workbook.addWorksheet('CANH_BAO');
  warnings.columns = [
    { header: 'Mã đơn con', key: 'orderCode' },
    { header: 'Loại cảnh báo', key: 'type' },
    { header: 'Nội dung', key: 'message' },
    { header: 'Mức độ', key: 'level' }
  ];
  addRows(warnings, (result.warnings || []).map((row) => [row.orderCode || '', row.type, row.message, row.level]));

  return workbook.xlsx.writeBuffer();
}

module.exports = { createTemplateWorkbook, createResultWorkbook };
