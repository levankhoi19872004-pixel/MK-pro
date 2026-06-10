'use strict';

const { renderPrintHtml } = require('../../services/printService');
const printRepository = require('../repositories/printRepository');

const SUPPORTED_PRINT_TYPES = [
  { type: 'ORDER_SINGLE', name: 'Phiếu giao nhận và thanh toán - mẫu dùng chung đơn con', source: 'salesOrders' },
  { type: 'DMS_DELIVERY_INVOICE', name: 'Phiếu giao nhận và thanh toán - mẫu Unilever', source: 'salesOrders' },
  { type: 'ORDER_TOTAL', name: 'Phiếu gộp đơn tổng', source: 'masterOrders' },
  { type: 'IMPORT_ORDER', name: 'Phiếu nhập kho', source: 'importOrders' },
  { type: 'PAYMENT_RECEIPT', name: 'Phiếu thu tiền', source: 'receipts/cashbooks/bankbooks' }
];

function listSupportedTypes() {
  return SUPPORTED_PRINT_TYPES;
}

function renderFromDocument(type, document, options = {}) {
  const printType = printRepository.normalizePrintType(type);
  if (!printType) return { error: 'Thiếu loại mẫu in', status: 400 };
  if (!document) return { error: 'Thiếu dữ liệu chứng từ để in', status: 400 };
  return { html: renderPrintHtml(printType, document, options || {}), printType };
}

async function renderById(type, id, options = {}) {
  const printType = printRepository.normalizePrintType(type);
  if (!printType || !id) return { error: 'Thiếu loại mẫu in hoặc mã chứng từ', status: 400 };

  const result = await printRepository.findDocumentByPrintType(printType, id);
  if (!result.document) return { error: 'Không tìm thấy chứng từ để in', status: 404, printType: result.printType };

  return {
    html: renderPrintHtml(result.printType, result.document, options || {}),
    printType: result.printType,
    document: result.document
  };
}

module.exports = {
  listSupportedTypes,
  renderFromDocument,
  renderById
};
