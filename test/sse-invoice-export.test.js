'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const readXlsxFile = require('read-excel-file/node');

const ROOT = path.resolve(__dirname, '..');
const contract = require('./fixtures/sse/sse-contract.json');
const service = require('../src/services/sseInvoiceExport.service');

function fixtureConfig(type = 'VAT', overrides = {}) {
  return { ...service.loadConfig(type), ...overrides };
}

function baseOrder(overrides = {}) {
  return {
    id: 'SO-0001',
    code: '000000123',
    orderDate: '2026-05-01',
    customerCode: '0000456',
    customerName: 'Khách hàng thử nghiệm',
    vatInvoiceRequired: true,
    status: 'delivered',
    items: [{
      lineKey: 'LINE-1',
      productCode: '0000789',
      productName: 'Sản phẩm thử nghiệm',
      baseUnit: 'Gói',
      quantity: 3,
      priceAfterPromotion: 10800
    }],
    ...overrides
  };
}

function fixtureCatalog() {
  return {
    customers: [{ code: '0000456', name: 'Khách hàng thử nghiệm', sseCustomerCode: '0000456' }],
    products: [{ code: '0000789', name: 'Sản phẩm thử nghiệm', baseUnit: 'Gói', sseProductCode: '0000789' }]
  };
}

function unzipEntries(buffer) {
  const files = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const flags = buffer.readUInt16LE(offset + 6);
    assert.equal(flags & 0x0008, 0, 'test reader requires fixed local sizes');
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');
    const dataStart = nameStart + nameLength + extraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    const data = method === 8 ? zlib.inflateRawSync(compressed) : compressed;
    files.set(name, data.toString('utf8'));
    offset = dataStart + compressedSize;
  }
  return files;
}

test('SSE contract contains exact 36 columns A:AJ and decomposed Unicode header', () => {
  assert.equal(service.SSE_HEADERS.length, 36);
  assert.deepEqual([...service.SSE_HEADERS], contract.headers);
  assert.equal(contract.sheetName, 'TỔNG');
  assert.equal(contract.headerRow, 5);
  assert.equal(contract.dataStartRow, 6);
  assert.equal(service.SSE_HEADERS[6], 'Diễn giải');
});

test('VAT and NON_VAT are disjoint and use current invoice classifier', () => {
  const { customers, products } = fixtureCatalog();
  const vat = baseOrder();
  const nonVat = baseOrder({ id: 'SO-0002', code: '000000124', vatInvoiceRequired: 'false' });
  const orders = [vat, nonVat];
  const vatRows = service.buildSseRows({ orders, customers, products, returnOrders: [], invoiceType: 'VAT', config: fixtureConfig('VAT') });
  const nonVatRows = service.buildSseRows({ orders, customers, products, returnOrders: [], invoiceType: 'NON_VAT', config: fixtureConfig('NON_VAT') });
  assert.equal(vatRows.rows.length, 1);
  assert.equal(nonVatRows.rows.length, 1);
  assert.equal(vatRows.rows[0][3].value, '000000123');
  assert.equal(nonVatRows.rows[0][3].value, '000000124');
});

test('VAT price follows verified current rule and NON_VAT keeps after-promotion price', () => {
  const { customers, products } = fixtureCatalog();
  const vat = service.buildSseRows({ orders: [baseOrder()], customers, products, returnOrders: [], invoiceType: 'VAT', config: fixtureConfig('VAT') });
  const nonVat = service.buildSseRows({ orders: [baseOrder({ vatInvoiceRequired: false })], customers, products, returnOrders: [], invoiceType: 'NON_VAT', config: fixtureConfig('NON_VAT') });
  assert.equal(vat.rows[0][15], 10000);
  assert.equal(vat.rows[0][16], 30000);
  assert.equal(nonVat.rows[0][15], 10800);
  assert.equal(nonVat.rows[0][16], 32400);
});

test('return quantity is subtracted once and zero remaining line is omitted', () => {
  const { customers, products } = fixtureCatalog();
  const order = baseOrder();
  const returnOrders = [{ code: 'RO-1', salesOrderId: 'SO-0001', status: 'confirmed', items: [{ lineKey: 'LINE-1', productCode: '0000789', returnQty: 1, priceAfterPromotion: 10800 }] }];
  const built = service.buildSseRows({ orders: [order], customers, products, returnOrders, invoiceType: 'VAT', config: fixtureConfig('VAT') });
  assert.equal(built.rows.length, 1);
  assert.equal(built.rows[0][14], 2);
  assert.equal(built.rows[0][16], 20000);

  returnOrders[0].items[0].returnQty = 3;
  const zero = service.buildSseRows({ orders: [order], customers, products, returnOrders, invoiceType: 'VAT', config: fixtureConfig('VAT') });
  assert.equal(zero.rows.length, 0);
});

test('cancelled, deleted and zero-quantity orders are not exported', () => {
  const { customers, products } = fixtureCatalog();
  const orders = [
    baseOrder({ id: 'A', status: 'cancelled' }),
    baseOrder({ id: 'B', deletedAt: '2026-05-02T00:00:00Z' }),
    baseOrder({ id: 'C', items: [{ productCode: '0000789', quantity: 0, price: 100 }] })
  ];
  const built = service.buildSseRows({ orders, customers, products, returnOrders: [], invoiceType: 'VAT', config: fixtureConfig('VAT') });
  assert.equal(built.rows.length, 0);
});

test('missing mapping is blocked and no fake code is generated', () => {
  const config = fixtureConfig('VAT', { allowCanonicalCustomerCodeFallback: false, allowCanonicalProductCodeFallback: false });
  const built = service.buildSseRows({ orders: [baseOrder()], customers: [{ code: '0000456', name: 'Khách' }], products: [{ code: '0000789', name: 'SP', baseUnit: 'Gói' }], returnOrders: [], invoiceType: 'VAT', config });
  assert.equal(built.rows.length, 0);
  assert.ok(built.errors.some((row) => row['Trường bị thiếu'] === 'Mã khách'));
  assert.ok(built.errors.some((row) => row['Trường bị thiếu'] === 'Mã hàng'));
});

test('missing unit and price are reported explicitly', () => {
  const order = baseOrder({ items: [{ lineKey: 'X', productCode: '0000789', productName: 'SP', quantity: 1 }] });
  const built = service.buildSseRows({ orders: [order], customers: [{ code: '0000456', name: 'Khách', sseCustomerCode: '0000456' }], products: [{ code: '0000789', name: 'SP', sseProductCode: '0000789', baseUnit: '', unit: '' }], returnOrders: [], invoiceType: 'VAT', config: fixtureConfig('VAT') });
  assert.ok(built.errors.some((row) => row['Trường bị thiếu'] === 'Đvt'));
  assert.ok(built.errors.some((row) => row['Trường bị thiếu'] === 'Giá bán'));
});

test('workbook is values-only, has TỔNG first, four blank rows, exact header row 5 and real Excel date', async () => {
  const { customers, products } = fixtureCatalog();
  const built = service.buildSseRows({ orders: [baseOrder()], customers, products, returnOrders: [], invoiceType: 'VAT', config: fixtureConfig('VAT') });
  const buffer = service.buildUploadWorkbook(built.rows, fixtureConfig('VAT'));
  assert.equal(buffer.subarray(0, 2).toString('hex'), '504b');
  const sheets = await readXlsxFile(buffer);
  assert.deepEqual(sheets.map((sheet) => sheet.sheet), ['TỔNG']);
  const rows = sheets[0].data;
  assert.equal(rows.length, 6);
  for (let index = 0; index < 4; index += 1) assert.ok(rows[index].every((cell) => cell === null));
  assert.deepEqual(rows[4], contract.headers);
  assert.equal(rows[5].length, 36);
  assert.equal(rows[5][0], '0000456');
  assert.equal(rows[5][3], '000000123');
  assert.equal(rows[5][7], '0000789');
  assert.ok(rows[5][2] instanceof Date);
  assert.equal(rows[5][2].toISOString(), '2026-05-01T00:00:00.000Z');
  assert.equal(typeof rows[5][14], 'number');
  assert.equal(typeof rows[5][15], 'number');
  assert.equal(typeof rows[5][16], 'number');

  const entries = unzipEntries(buffer);
  assert.equal(entries.has('xl/worksheets/sheet1.xml'), true);
  assert.doesNotMatch(entries.get('xl/worksheets/sheet1.xml'), /<f[ >]/);
  assert.match(entries.get('xl/styles.xml'), /formatCode="dd\/mm\/yyyy"/);
  assert.doesNotMatch([...entries.values()].join('\n'), /#N\/A|null|undefined|NaN/);
});

test('one product line creates exactly one SSE row and repeated invoice fields stay populated', () => {
  const { customers, products } = fixtureCatalog();
  const order = baseOrder({ items: [
    { lineKey: 'L1', productCode: '0000789', quantity: 1, price: 10800, baseUnit: 'Gói' },
    { lineKey: 'L2', productCode: '0000789', quantity: 2, price: 10800, baseUnit: 'Gói' }
  ] });
  const built = service.buildSseRows({ orders: [order], customers, products, returnOrders: [], invoiceType: 'VAT', config: fixtureConfig('VAT') });
  assert.equal(built.rows.length, 2);
  for (const row of built.rows) {
    assert.equal(row[0].value, '0000456');
    assert.equal(row[3].value, '000000123');
    assert.equal(row[4].value, '3');
    assert.equal(row[35].value, 'BANBUON');
  }
});

test('duplicate order document does not produce duplicate rows', () => {
  const { customers, products } = fixtureCatalog();
  const order = baseOrder();
  const built = service.buildSseRows({ orders: [order, { ...order }], customers, products, returnOrders: [], invoiceType: 'VAT', config: fixtureConfig('VAT') });
  assert.equal(built.rows.length, 1);
});

test('optional real golden fixture comparison is enforced when sample is present', { skip: !fs.existsSync(path.join(ROOT, 'templates/sse/Mẫu 2 (01-31.05).xlsx')) }, async () => {
  const golden = await readXlsxFile(fs.readFileSync(path.join(ROOT, 'templates/sse/Mẫu 2 (01-31.05).xlsx')));
  assert.equal(golden[0].sheet, contract.sheetName);
  assert.deepEqual(golden[0].data[contract.headerRow - 1].slice(0, 36), contract.headers);
});

test('frontend exposes SSE selector, one download action and mapping-error download without removing VAT actions', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public/fragments/index/05-index-body.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'public/js/app/admin/08f-vat-export.js'), 'utf8');
  assert.match(html, /id="exportVatInvoiceTT78Button"/);
  assert.match(html, /id="exportVatNonInvoiceOrdersButton"/);
  assert.match(html, /id="sseInvoiceTypeSelect"/);
  assert.match(html, /id="exportSseInvoiceButton"[^>]*>Xuất Excel SSE</);
  assert.match(html, /id="downloadSseErrorReportButton"[^>]*hidden/);
  assert.match(js, /\/api\/export\/sse-invoice-orders\.xlsx/);
  assert.match(js, /errorReportUrl/);
  assert.match(js, /if\(exportInFlight\)return/);
  assert.doesNotMatch(js, /location\.reload|window\.location\s*=/);
});

test('route reuses existing authentication and export role guard', () => {
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/importExportRoutes.js'), 'utf8');
  const controller = fs.readFileSync(path.join(ROOT, 'src/controllers/importExportController.js'), 'utf8');
  const legacy = fs.readFileSync(path.join(ROOT, 'src/services/importExportLegacy.service.source/part-03.jsfrag'), 'utf8');
  assert.match(route, /exportRouter\.use\(viewExports\)/);
  assert.match(route, /requireRole\(\['admin', 'manager', 'accountant', 'warehouse'\]\)/);
  assert.match(controller, /req\.user \|\| \{\}/);
  assert.match(legacy, /sse-invoice-orders/);
  assert.match(legacy, /sse-invoice-errors/);
});
