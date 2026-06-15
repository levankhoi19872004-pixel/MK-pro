'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('customer schema, API payload and form include tax profile fields', () => {
  const model = read('src/models/Customer.js');
  const service = read('src/services/customerService.js');
  const html = read('public/index.html');
  assert.match(model, /taxCode:\s*\{\s*type:\s*String/);
  assert.match(model, /taxInvoiceAddress:\s*\{\s*type:\s*String/);
  assert.match(service, /extractCustomerTaxProfile/);
  assert.match(html, /name="taxCode"/);
  assert.match(html, /name="taxInvoiceAddress"/);
});

test('customer import template and parser include tax fields without breaking old templates', () => {
  const template = read('services/excelTemplateService.js');
  const importer = read('src/services/excelImportService.js');
  assert.match(template, /'taxCode',\s*'taxInvoiceAddress'/);
  assert.match(template, /'Mã số thuế',\s*'Địa chỉ hóa đơn thuế'/);
  assert.match(importer, /extractCustomerTaxProfile\(row\)/);
  assert.match(importer, /if \(taxProfile\.hasTaxCode\) payload\.taxCode/);
  assert.match(importer, /if \(taxProfile\.hasTaxInvoiceAddress\) payload\.taxInvoiceAddress/);
});

test('VAT TT78 prioritizes dedicated tax address over delivery address', () => {
  const exporter = read('src/services/importExportLegacy.service.js');
  assert.match(exporter, /orderTax\.taxInvoiceAddress \|\| customerTax\.taxInvoiceAddress \|\| order\.customerAddress/);
  assert.match(exporter, /MaSoThue:\s*isFirst \? ci\.taxCode/);
  assert.match(exporter, /DiaChiKhachHang:\s*isFirst \? ci\.address/);
  assert.match(exporter, /DiaChiHoaDon/);
});
