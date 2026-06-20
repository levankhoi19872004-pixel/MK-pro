const templates = require('../templates/printTemplates');
const { buildPrintData } = require('./printDataBuilder');

function resolvePrintType(type, rawDocument) {
  const key = String(type || '').trim().toUpperCase().replace(/[\s-]+/g, '_');

  // Mọi đơn con dùng chung profile SALES_INVOICE.
  if (['ORDER_SINGLE', 'SALES_ORDER', 'ORDER', 'DMS_DELIVERY_INVOICE', 'SALES_INVOICE'].includes(key)) {
    return 'SALES_INVOICE_DMS_EXACT_V1';
  }

  // Mọi chứng từ nhặt hàng/kho dùng chung profile WAREHOUSE_PICKING.
  if (['ORDER_TOTAL', 'MASTER_ORDER', 'WAREHOUSE_PICKING', 'IMPORT_ORDER', 'IMPORT_ORDER_AGGREGATE', 'MASTER_RETURN_ORDER'].includes(key)) {
    return 'WAREHOUSE_PICKING';
  }

  return key;
}

function renderPrintHtml(type, rawDocument, options = {}) {
  const resolvedType = resolvePrintType(type, rawDocument);
  const template = templates[resolvedType];
  if (!template) throw new Error(`Không tìm thấy mẫu in: ${resolvedType}`);
  const data = buildPrintData(rawDocument, options);
  return template(data);
}

function stripStandaloneHtml(html = '') {
  const source = String(html || '');
  const lower = source.toLowerCase();
  const bodyOpen = lower.indexOf('<body');
  const bodyStart = bodyOpen >= 0 ? source.indexOf('>', bodyOpen) + 1 : -1;
  const bodyEnd = lower.lastIndexOf('</body>');
  let body = bodyStart > 0 && bodyEnd > bodyStart
    ? source.slice(bodyStart, bodyEnd)
    : source;

  // Do not parse <body> with a non-greedy regex: the export script contains
  // a literal "</body>" string, which previously truncated all print pages.
  body = body.replace(/<div class="[^"]*print-preview-actions[^"]*">[\s\S]*?<\/div>\s*(?:<script(?:\s+[^>]*)?>[\s\S]*?<\/script>)?/i, '');
  body = body.replace(/<script>[\s\S]*?<\/script>/gi, '');
  return body.trim();
}

function previewActions() {
  return `
  <div class="print-preview-actions">
    <button type="button" data-print-action="close">Bỏ qua</button>
    <button type="button" data-print-action="print">In đơn</button>
    <button type="button" data-print-action="excel">Xuất Excel</button>
  </div>
  <script src="/js/print-preview-actions.js?v=phase09-csp-v1"></script>`;
}

function renderPrintBatchHtml(type, documents = [], options = {}) {
  const rows = Array.isArray(documents) ? documents.filter(Boolean) : [];
  if (!rows.length) throw new Error('Không có chứng từ để in');
  const pages = rows.map((document) => stripStandaloneHtml(renderPrintHtml(type, document, options))).join('\n');
  const resolvedType = resolvePrintType(type);
  const isExactSalesInvoice = resolvedType === 'SALES_INVOICE_DMS_EXACT_V1';
  const bodyClass = isExactSalesInvoice ? 'dms-exact-body' : 'warehouse-picking-body';
  const title = options.title || `In ${rows.length} chứng từ`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${String(title).replace(/[<>]/g, '')}</title>
  ${isExactSalesInvoice ? '<link rel="stylesheet" href="/dms-exact-sales-invoice.css?v=dms-exact-v1" />' : '<link rel="stylesheet" href="/print.css" /><link rel="stylesheet" href="/print-tokens.css?v=print-domain-v1" />'}
</head>
<body class="${bodyClass}">
  ${previewActions()}
  ${pages}
</body>
</html>`;
}

module.exports = {
  renderPrintHtml,
  renderPrintBatchHtml,
  resolvePrintType,
  stripStandaloneHtml
};
