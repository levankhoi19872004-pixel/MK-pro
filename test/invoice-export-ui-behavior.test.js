'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const SCRIPT = fs.readFileSync(path.resolve(__dirname, '../public/js/app/admin/08f-vat-export.js'), 'utf8');

class FakeClassList {
  constructor() { this.values = new Set(); }
  toggle(name, enabled) { if (enabled) this.values.add(name); else this.values.delete(name); }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(text = '') {
    this.textContent = text;
    this.dataset = {};
    this.disabled = false;
    this.attributes = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.value = '';
    this.clicked = 0;
    this.children = [];
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  remove() { this.removed = true; }
  replaceChildren(...children) { this.children = [...children]; }
  add(child) { this.children.push(child); }
  click() {
    this.clicked += 1;
    const handler = this.listeners.get('click');
    return handler ? handler({ target: this, preventDefault() {} }) : undefined;
  }
}

function makeHarness(fetchImpl) {
  const vat = new FakeElement('Xuất hóa đơn VAT');
  const nonVat = new FakeElement('Xuất hóa đơn không VAT');
  const summary = new FakeElement('Sẵn sàng');
  const from = new FakeElement(); from.value = '2026-06-01';
  const to = new FakeElement(); to.value = '2026-06-20';
  const salesStaff = new FakeElement(); salesStaff.value = 'NVBH01';
  const clear = new FakeElement('Xóa lọc');
  const anchors = [];
  const elements = {
    exportVatInvoiceTT78Button: vat,
    exportVatNonInvoiceOrdersButton: nonVat,
    vatInvoiceExportSummary: summary,
    invoiceExportFromDate: from,
    invoiceExportToDate: to,
    invoiceExportSalesStaffCode: salesStaff,
    clearInvoiceExportFiltersButton: clear
  };
  const urls = [];
  const context = {
    URLSearchParams,
    Blob,
    Option: function Option(text, value) { return { text, value }; },
    console: { error() {} },
    fetch: async (...args) => { urls.push(args[0]); return fetchImpl(...args); },
    window: { UnifiedSearchEngine: { async searchSalesStaff() { return [{ code: 'NVBH01', name: 'Nhân viên 01' }]; } } },
    setReportDefaults() {},
    setTimeout(fn) { fn(); return 1; },
    URL: {
      createObjectURL() { return 'blob:invoice-export'; },
      revokeObjectURL() {}
    },
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement(tag) {
        assert.equal(tag, 'a');
        const anchor = new FakeElement();
        anchors.push(anchor);
        return anchor;
      },
      body: { appendChild() {} }
    }
  };
  vm.runInNewContext(SCRIPT, context, { filename: '08f-vat-export.js' });
  return { vat, nonVat, summary, urls, anchors, salesStaff, clear };
}

function successfulResponse(fileName = 'Hoa_don_VAT.xlsx') {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (String(name).toLowerCase() === 'content-type') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (String(name).toLowerCase() === 'content-disposition') return `attachment; filename="${encodeURIComponent(fileName)}"`;
        return '';
      }
    },
    async blob() { return new Blob(['PK']); }
  };
}

test('one click sends one VAT request, keeps filters and restores button state', async () => {
  let resolveFetch;
  const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
  const harness = makeHarness(() => fetchPromise);
  const first = harness.vat.click();
  harness.vat.click();
  assert.equal(harness.urls.length, 1);
  assert.equal(harness.vat.disabled, true);
  assert.equal(harness.nonVat.disabled, true);
  assert.match(harness.urls[0], /invoiceType=VAT/);
  assert.match(harness.urls[0], /dateFrom=2026-06-01/);
  assert.match(harness.urls[0], /dateTo=2026-06-20/);
  assert.match(harness.urls[0], /salesStaffCode=NVBH01/);
  resolveFetch(successfulResponse('Hoa_don_VAT_01-06-2026_den_20-06-2026.xlsx'));
  await first;
  assert.equal(harness.vat.disabled, false);
  assert.equal(harness.nonVat.disabled, false);
  assert.equal(harness.anchors.length, 1);
  assert.equal(harness.anchors[0].download, 'Hoa_don_VAT_01-06-2026_den_20-06-2026.xlsx');
  assert.match(harness.summary.textContent, /Đã tải/);
});

test('NON_VAT button calls only NON_VAT and surfaces server errors without fake Excel download', async () => {
  const harness = makeHarness(async () => ({
    ok: false,
    status: 400,
    headers: { get(name) { return String(name).toLowerCase() === 'content-type' ? 'application/json' : ''; } },
    async json() { return { message: 'invoiceType không hợp lệ' }; }
  }));
  await harness.nonVat.click();
  assert.equal(harness.urls.length, 1);
  assert.match(harness.urls[0], /invoiceType=NON_VAT/);
  assert.doesNotMatch(harness.urls[0], /invoiceType=VAT(?:&|$)/);
  assert.equal(harness.anchors.length, 0);
  assert.equal(harness.summary.classList.contains('error'), true);
  assert.match(harness.summary.textContent, /invoiceType không hợp lệ/);
});
