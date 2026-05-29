'use strict';

const { renderPrintHtml } = require('../../services/printService');
const systemService = require('./systemService');

function findDocument(data, type, id) {
  if (type === 'ORDER_SINGLE') return (data.salesOrders || []).find(order => order.id === id || order.code === id);
  if (type === 'IMPORT_ORDER') return (data.importOrders || []).find(order => order.id === id || order.code === id);
  if (type === 'PAYMENT_RECEIPT') return (data.cashbooks || data.cashbook || []).find(entry => entry.id === id || entry.code === id);
  return null;
}

function renderFromDocument(type, document, options = {}) {
  if (!type) return { error: 'Thiếu loại mẫu in', status: 400 };
  if (!document) return { error: 'Thiếu dữ liệu chứng từ để in', status: 400 };
  return { html: renderPrintHtml(type, document, options || {}) };
}

async function renderById(type, id) {
  if (!type || !id) return { error: 'Thiếu loại mẫu in hoặc mã chứng từ', status: 400 };
  const data = await systemService.getDataSnapshot();
  const document = findDocument(data, type, id);
  if (!document) return { error: 'Không tìm thấy chứng từ để in', status: 404 };
  return { html: renderPrintHtml(type, document, {}) };
}

module.exports = { renderFromDocument, renderById };
