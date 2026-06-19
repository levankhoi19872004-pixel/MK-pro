'use strict';

const { renderPrintHtml, renderPrintBatchHtml } = require('../../services/printService');
const printRepository = require('../repositories/printRepository');
const PrintReadService = require('../domain/print/PrintReadService');

const SUPPORTED_PRINT_TYPES = [
  { type: 'SALES_INVOICE_DMS_EXACT_V1', profile: 'SALES_INVOICE_DMS_EXACT_V1', name: 'Phiếu giao nhận và thanh toán - mẫu Invoice-36', source: 'salesOrders' },
  { type: 'WAREHOUSE_PICKING', profile: 'WAREHOUSE_PICKING', name: 'Phiếu nhặt hàng/kho dùng chung', source: 'masterOrders/importOrders/returnOrders' },
  { type: 'PAYMENT_RECEIPT', profile: 'PAYMENT_RECEIPT', name: 'Phiếu thu tiền', source: 'receipts/cashbooks/bankbooks' }
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

async function renderSalesOrder(id, options = {}) {
  const [document] = await PrintReadService.readSalesOrders([id]);
  return { html: renderPrintHtml('SALES_INVOICE', document, options), printType: 'SALES_INVOICE_DMS_EXACT_V1', document };
}

async function renderSalesOrdersBatch(ids = [], options = {}) {
  const documents = await PrintReadService.readSalesOrders(ids);
  return {
    html: renderPrintBatchHtml('SALES_INVOICE', documents, { ...options, title: `In ${documents.length} đơn bán` }),
    printType: 'SALES_INVOICE_DMS_EXACT_V1',
    documents
  };
}

async function renderMasterOrders(ids = [], options = {}) {
  const document = await PrintReadService.readMasterOrders(ids, options);
  return { html: renderPrintHtml('WAREHOUSE_PICKING', document, options), printType: 'WAREHOUSE_PICKING', document };
}

async function renderImportOrders(ids = [], options = {}) {
  const document = await PrintReadService.readImportOrders(ids, options);
  return { html: renderPrintHtml('WAREHOUSE_PICKING', document, options), printType: 'WAREHOUSE_PICKING', document };
}

async function renderMasterReturnOrder(id, options = {}) {
  const document = await PrintReadService.readMasterReturnOrder(id);
  return { html: renderPrintHtml('WAREHOUSE_PICKING', document, options), printType: 'WAREHOUSE_PICKING', document };
}

async function renderMasterReturnOrdersBatch(ids = [], options = {}) {
  const documents = await PrintReadService.readMasterReturnOrders(ids);
  return {
    html: renderPrintBatchHtml('WAREHOUSE_PICKING', documents, { ...options, title: `In ${documents.length} đơn tổng trả` }),
    printType: 'WAREHOUSE_PICKING',
    documents
  };
}

async function renderById(type, id, options = {}) {
  const printType = printRepository.normalizePrintType(type);
  if (!printType || !id) return { error: 'Thiếu loại mẫu in hoặc mã chứng từ', status: 400 };

  if (['ORDER_SINGLE', 'DMS_DELIVERY_INVOICE', 'SALES_INVOICE', 'SALES_INVOICE_DMS_EXACT_V1'].includes(printType)) {
    return renderSalesOrder(id, options);
  }
  if (['ORDER_TOTAL', 'MASTER_ORDER', 'WAREHOUSE_PICKING'].includes(printType)) {
    return renderMasterOrders([id], options);
  }
  if (['IMPORT_ORDER', 'IMPORT_ORDER_AGGREGATE'].includes(printType)) {
    return renderImportOrders([id], options);
  }
  if (['MASTER_RETURN_ORDER'].includes(printType)) {
    return renderMasterReturnOrder(id, options);
  }
  if (printType === 'PAYMENT_RECEIPT') {
    const document = await PrintReadService.readPaymentReceipt(id);
    if (!document) return { error: 'Không tìm thấy chứng từ để in', status: 404, printType };
    return { html: renderPrintHtml(printType, document, options), printType, document };
  }

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
  renderById,
  renderSalesOrder,
  renderSalesOrdersBatch,
  renderMasterOrders,
  renderImportOrders,
  renderMasterReturnOrder,
  renderMasterReturnOrdersBatch
};
