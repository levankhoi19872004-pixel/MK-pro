const templates = require('../templates/printTemplates');
const { buildPrintData } = require('./printDataBuilder');

function renderPrintHtml(type, rawDocument, options = {}) {
  const template = templates[type];
  if (!template) throw new Error(`Không tìm thấy mẫu in: ${type}`);
  const data = buildPrintData(rawDocument, options);
  return template(data);
}

module.exports = { renderPrintHtml };
