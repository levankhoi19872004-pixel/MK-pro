'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('child sales order uses the Invoice-36 exact print profile', () => {
  const contract = read('src/domain/print/PrintContract.js');
  const service = read('services/printService.js');
  const readService = read('src/domain/print/PrintReadService.js');

  assert.match(contract, /SALES_INVOICE_DMS_EXACT_V1/);
  assert.match(service, /return 'SALES_INVOICE_DMS_EXACT_V1'/);
  assert.match(readService, /buildDmsExactSalesInvoice/);
});

test('exact template is isolated from warehouse and legacy DMS templates', () => {
  const templates = read('templates/printTemplates.js');
  const exactTemplate = read('templates/print/dmsExactSalesInvoice.template.js');

  assert.match(templates, /DMS_DELIVERY_INVOICE:\s*dmsExactSalesInvoiceTemplate/);
  assert.match(templates, /SALES_INVOICE_DMS_EXACT_V1:\s*dmsExactSalesInvoiceTemplate/);
  assert.match(exactTemplate, /data-profile="SALES_INVOICE_DMS_EXACT_V1"/);
  const pagination = read('src/domain/print/DmsExactPagination.js');
  assert.match(pagination, /copies:\s*\['Liên 1', 'Liên 2'\]/);
});

test('exact child invoice uses Letter page and Invoice-36 column widths', () => {
  const css = read('public/dms-exact-sales-invoice.css');
  const template = read('templates/print/dmsExactSalesInvoice.template.js');

  assert.match(css, /--dmsx-page-width:\s*612pt/);
  assert.match(css, /--dmsx-page-height:\s*792pt/);
  assert.match(css, /@page\s*\{\s*size:\s*Letter portrait;\s*margin:\s*0;/);
  assert.doesNotMatch(css, /size:\s*A4/);

  for (const width of ['21.60pt', '44.28pt', '213.84pt', '37.44pt', '25.20pt', '40.32pt', '54.72pt']) {
    assert.ok(template.includes(width), `missing exact column width ${width}`);
  }
});

test('exact monetary snapshots are preferred for historical reprint', () => {
  const normalizer = read('src/domain/print/PrintLineNormalizer.js');
  const builder = read('src/domain/print/builders/DmsExactSalesInvoiceBuilder.js');

  assert.match(normalizer, /preTaxPriceAtOrder/);
  assert.match(normalizer, /vatAmountAtOrder/);
  assert.match(normalizer, /lineAmountAtOrder/);
  assert.match(builder, /ORDER_SNAPSHOT_ONLY_WITH_LEGACY_FALLBACK/);
});
