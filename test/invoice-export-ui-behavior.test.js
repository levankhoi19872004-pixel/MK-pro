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
    this.hidden = false;
    this.innerHTML = '';
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  appendChild(child) { this.children.push(child); return child; }
  contains(child) { return this.children.includes(child); }
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
  const customerSearch = new FakeElement();
  const customerCode = new FakeElement();
  const customerClear = new FakeElement('×');
  customerClear.hidden = true;
  const customerSuggestions = new FakeElement();
  customerSuggestions.hidden = true;
  const anchors = [];
  const elements = {
    exportVatInvoiceTT78Button: vat,
    exportVatNonInvoiceOrdersButton: nonVat,
    vatInvoiceExportSummary: summary,
    invoiceExportFromDate: from,
    invoiceExportToDate: to,
    invoiceExportSalesStaffCode: salesStaff,
    invoiceExportCustomerSearch: customerSearch,
    invoiceExportCustomerCode: customerCode,
    clearInvoiceExportCustomerButton: customerClear,
    invoiceExportCustomerSuggestions: customerSuggestions,
    clearInvoiceExportFiltersButton: clear
  };
  const urls = [];
  const context = {
    URLSearchParams,
    Blob,
    Option: function Option(text, value) { return { text, value }; },
    console: { error() {} },
    fetch: async (...args) => { urls.push(args[0]); return fetchImpl(...args); },
    window: { UnifiedSearchEngine: {
      async searchSalesStaff() { return [{ code: 'NVBH01', name: 'Nhân viên 01' }]; },
      async searchCustomer(q) { return [{ code: 'KH01', customerCode: 'KH01', name: 'Khách 01', customerName: 'Khách 01', phone: '0901' }].filter(item => String(item.code).includes(q) || String(item.name).includes(q)); }
    } },
    setReportDefaults() {},
    setTimeout(fn) { fn(); return 1; },
    URL: {
      createObjectURL() { return 'blob:invoice-export'; },
      revokeObjectURL() {}
    },
    document: {
      getElementById(id) { return elements[id] || null; },
      createElement(tag) {
        const el = new FakeElement();
        if (tag === 'a') anchors.push(el);
        return el;
      },
      addEventListener() {},
      body: { appendChild() {} }
    }
  };
  vm.runInNewContext(SCRIPT, context, { filename: '08f-vat-export.js' });
  return { vat, nonVat, summary, urls, anchors, salesStaff, clear, customerSearch, customerCode, customerClear, customerSuggestions };
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


function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return String(name).toLowerCase() === 'content-type' ? 'application/json' : ''; } },
    async json() { return payload; }
  };
}

test('one click downloads VAT workbook directly, keeps filters and restores button state', async () => {
  let resolveDownload;
  const downloadPromise = new Promise((resolve) => { resolveDownload = resolve; });
  const harness = makeHarness(() => downloadPromise);
  const first = harness.vat.click();
  harness.vat.click();
  assert.equal(harness.urls.length, 1);
  assert.equal(harness.vat.disabled, true);
  assert.equal(harness.nonVat.disabled, true);
  assert.match(harness.urls[0], /invoiceType=VAT/);
  assert.match(harness.urls[0], /dateFrom=2026-06-01/);
  assert.match(harness.urls[0], /dateTo=2026-06-20/);
  assert.match(harness.urls[0], /salesStaffCode=NVBH01/);
  assert.doesNotMatch(harness.urls[0], /async=1/);
  resolveDownload(successfulResponse('Hoa_don_VAT_01-06-2026_den_20-06-2026.xlsx'));
  await first;
  assert.equal(harness.urls.filter((url) => String(url).includes('/api/export/invoice-orders.xlsx')).length, 1);
  assert.equal(harness.urls.length, 1);
  assert.equal(harness.vat.disabled, false);
  assert.equal(harness.nonVat.disabled, false);
  assert.equal(harness.anchors.length, 1);
  assert.equal(harness.anchors[0].download, 'Hoa_don_VAT_01-06-2026_den_20-06-2026.xlsx');
  assert.match(harness.summary.textContent, /Đã tải/);
});


test('selected customerCode is sent to VAT/NON_VAT/SSE exports and clear resets customer', async () => {
  const harness = makeHarness(async () => successfulResponse('Hoa_don_VAT_customer.xlsx'));
  harness.customerSearch.value = 'KH01 - Khách 01';
  harness.customerCode.value = 'KH01';
  harness.customerClear.hidden = false;
  await harness.vat.click();
  assert.match(harness.urls[0], /customerCode=KH01/);
  harness.clear.click();
  assert.equal(harness.customerSearch.value, '');
  assert.equal(harness.customerCode.value, '');
  assert.equal(harness.customerClear.hidden, true);
});

test('typed customer without selecting suggestion blocks export to avoid misleading full export', async () => {
  const harness = makeHarness(async () => successfulResponse('Hoa_don_VAT.xlsx'));
  harness.customerSearch.value = 'Khách chưa chọn';
  await harness.vat.click();
  assert.equal(harness.urls.length, 0);
  assert.equal(harness.summary.classList.contains('error'), true);
  assert.match(harness.summary.textContent, /chọn khách hàng/);
});


test('JSON accepted export response still polls job and downloads artifact for worker mode', async () => {
  let call = 0;
  const harness = makeHarness((url) => {
    call += 1;
    if (call === 1) return jsonResponse({ ok: true, accepted: true, jobId: 'JOB1' }, 202);
    if (String(url).includes('/api/background-jobs/JOB1') && !String(url).endsWith('/artifact')) {
      return jsonResponse({
        ok: true,
        job: {
          id: 'JOB1',
          status: 'completed',
          progress: { percent: 100, step: 'completed' },
          artifact: {
            fileName: 'Hoa_don_VAT_async.xlsx',
            downloadUrl: '/api/background-jobs/JOB1/artifact'
          }
        }
      });
    }
    return successfulResponse('Hoa_don_VAT_async.xlsx');
  });
  await harness.vat.click();
  assert.equal(harness.urls.length, 3);
  assert.match(harness.urls[1], /\/api\/background-jobs\/JOB1/);
  assert.match(harness.urls[2], /\/api\/background-jobs\/JOB1\/artifact/);
  assert.equal(harness.anchors.length, 1);
  assert.equal(harness.anchors[0].download, 'Hoa_don_VAT_async.xlsx');
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
