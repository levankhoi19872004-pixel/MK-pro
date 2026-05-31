const templates = require('../templates/printTemplates');
const { buildPrintData } = require('./printDataBuilder');
function resolvePrintType(type, rawDocument) {
  // Từ yêu cầu V45: mọi đơn con (NVBH và DMS/import Excel) dùng chung
  // mẫu Phiếu giao nhận và thanh toán kiểu Unilever.
  // Không còn tách mẫu in theo nguồn đơn để tránh lệch cột, lệch CS/SU.
  if (type === 'ORDER_SINGLE' || type === 'SALES_ORDER' || type === 'ORDER') return 'DMS_DELIVERY_INVOICE';
  return type;
}

function renderPrintHtml(type, rawDocument, options = {}) {
  const resolvedType = resolvePrintType(type, rawDocument);
  const template = templates[resolvedType];
  if (!template) throw new Error(`Không tìm thấy mẫu in: ${resolvedType}`);
  const data = buildPrintData(rawDocument, options);
  return template(data);
}

module.exports = { renderPrintHtml, resolvePrintType };
