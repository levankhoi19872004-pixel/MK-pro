'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.join(__dirname, '..', '..');

class FakeClassList {
  constructor(element) {
    this.element = element;
    this.values = new Set();
  }

  _sync() {
    this.element._className = Array.from(this.values).join(' ');
  }

  setFromString(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
    this._sync();
  }

  add(...names) {
    names.forEach((name) => {
      if (name) this.values.add(String(name));
    });
    this._sync();
  }

  remove(...names) {
    names.forEach((name) => this.values.delete(String(name)));
    this._sync();
  }

  contains(name) {
    return this.values.has(String(name));
  }

  toggle(name, force) {
    const key = String(name);
    const shouldAdd = force === undefined ? !this.values.has(key) : Boolean(force);
    if (shouldAdd) this.values.add(key);
    else this.values.delete(key);
    this._sync();
    return shouldAdd;
  }

  toString() {
    return Array.from(this.values).join(' ');
  }
}

class FakeElement {
  constructor(document, tagName = 'div') {
    this.ownerDocument = document;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.style = {};
    this.dataset = {};
    this.eventListeners = new Map();
    this.classList = new FakeClassList(this);
    this._className = '';
    this._innerHTML = '';
    this._textContent = '';
    this._id = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.files = [];
    this.onclick = null;
    this.onchange = null;
  }

  get id() {
    return this._id;
  }

  set id(value) {
    if (this._id) this.ownerDocument.unregisterId(this._id, this);
    this._id = String(value || '');
    if (this._id) this.ownerDocument.registerId(this._id, this);
  }

  get className() {
    return this._className;
  }

  set className(value) {
    this.classList.setFromString(value);
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children.slice().forEach((child) => child.remove());
    this.children = [];
    this.ownerDocument.registerMarkup(this, this._innerHTML);
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value || '');
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    this.children.push(child);
    child.parentNode = this;
    this.ownerDocument.registerTree(child);
    return child;
  }

  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const index = before ? this.children.indexOf(before) : -1;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    child.parentNode = this;
    this.ownerDocument.registerTree(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  setAttribute(name, value) {
    const key = String(name);
    const stringValue = String(value);
    this.attributes.set(key, stringValue);
    if (key === 'id') this.id = stringValue;
    if (key === 'class') this.className = stringValue;
    if (key.startsWith('data-')) {
      const dataKey = key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[dataKey] = stringValue;
    }
  }

  getAttribute(name) {
    const key = String(name);
    if (key === 'id') return this.id;
    if (key === 'class') return this.className;
    return this.attributes.has(key) ? this.attributes.get(key) : null;
  }

  addEventListener(type, handler) {
    const key = String(type);
    if (!this.eventListeners.has(key)) this.eventListeners.set(key, []);
    this.eventListeners.get(key).push(handler);
  }

  removeEventListener(type, handler) {
    const list = this.eventListeners.get(String(type)) || [];
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }

  dispatchEvent(event) {
    const evt = event || { type: '' };
    evt.target = evt.target || this;
    const prop = `on${evt.type}`;
    const results = [];
    if (typeof this[prop] === 'function') results.push(this[prop](evt));
    (this.eventListeners.get(evt.type) || []).forEach((handler) => results.push(handler(evt)));
    const pending = results.filter((result) => result && typeof result.then === 'function');
    return pending.length ? Promise.all(pending).then(() => true) : true;
  }

  click() {
    return this.dispatchEvent({ type: 'click', target: this, preventDefault() {} });
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    walk(this, (node) => {
      if (node !== this && matchesSelector(node, selector)) matches.push(node);
    });
    return matches;
  }
}

class FakeFormData {
  constructor() {
    this.entriesList = [];
  }

  append(name, value) {
    this.entriesList.push([String(name), value]);
  }

  get(name) {
    const entry = this.entriesList.find(([key]) => key === String(name));
    return entry ? entry[1] : null;
  }

  getAll(name) {
    return this.entriesList.filter(([key]) => key === String(name)).map(([, value]) => value);
  }
}

class FakeDocument {
  constructor() {
    this.elementsById = new Map();
    this.body = new FakeElement(this, 'body');
    this.body.id = 'body';
    this.documentElement = new FakeElement(this, 'html');
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  getElementById(id) {
    return this.elementsById.get(String(id)) || null;
  }

  ensureElement(id, tagName = 'div') {
    const key = String(id);
    if (!this.elementsById.has(key)) {
      const element = this.createElement(tagName);
      element.id = key;
      this.body.appendChild(element);
    }
    return this.elementsById.get(key);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  addEventListener() {}
  removeEventListener() {}

  registerId(id, element) {
    this.elementsById.set(String(id), element);
  }

  unregisterId(id, element) {
    if (this.elementsById.get(String(id)) === element) this.elementsById.delete(String(id));
  }

  registerTree(element) {
    if (element.id) this.registerId(element.id, element);
    element.children.forEach((child) => this.registerTree(child));
  }

  registerMarkup(parent, html) {
    const tags = String(html || '').matchAll(/<([a-zA-Z][\w:-]*)([^>]*)>/g);
    for (const match of tags) {
      const element = this.createElement(match[1]);
      const attrs = match[2] || '';
      const id = attrs.match(/\sid=(["'])(.*?)\1/);
      const className = attrs.match(/\sclass=(["'])(.*?)\1/);
      const type = attrs.match(/\stype=(["'])(.*?)\1/);
      if (id) element.id = id[2];
      if (className) element.className = className[2];
      if (type) element.setAttribute('type', type[2]);
      for (const data of attrs.matchAll(/\sdata-([\w-]+)=(["'])(.*?)\2/g)) {
        element.setAttribute(`data-${data[1]}`, data[3]);
      }
      parent.appendChild(element);
    }
  }
}

function walk(node, visit) {
  visit(node);
  node.children.forEach((child) => walk(child, visit));
}

function matchesSelector(element, selector) {
  const raw = String(selector || '').trim();
  if (!raw) return false;
  if (raw.includes(' ')) {
    const last = raw.split(/\s+/).pop();
    return matchesSelector(element, last);
  }
  if (raw.startsWith('#')) return element.id === raw.slice(1);
  if (raw.startsWith('.')) {
    return raw.slice(1).split('.').every((name) => element.classList.contains(name));
  }
  const parts = raw.split('.');
  if (parts[0] && element.tagName.toLowerCase() !== parts[0].toLowerCase()) return false;
  return parts.slice(1).every((name) => element.classList.contains(name));
}

function readProjectFile(file) {
  return fs.readFileSync(path.join(rootDir, file), 'utf8');
}

function createImportShortageRuntime(options = {}) {
  const document = new FakeDocument();
  seedDocumentElements(document);
  const fetchCalls = [];
  const rawImportType = options.rawImportType || 'salesOrders';
  const sessionId = options.sessionId || 'IMP-257A-R1';
  const previewRows = options.previewRows || [{
    documentCode: 'SO-S3',
    customerName: 'Customer S3',
    productCode: 'SP-S3',
    productName: 'Product S3',
    valid: true,
    canImport: true,
    hasShortage: true,
    shortageQuantity: 3,
    shortageAmount: 36000,
    rowNo: 3
  }];
  const window = {
    document,
    console,
    URLSearchParams,
    URL: {
      createObjectURL: () => 'blob:fake',
      revokeObjectURL() {}
    },
    Blob: function Blob(parts = [], init = {}) {
      this.parts = parts;
      this.type = init.type || '';
    },
    IMPORT_PREVIEW_RENDER_LIMIT: 120,
    __reportsModuleLoaded: false,
    __commitCalled: false,
    __loadCalls: [],
    confirm: () => true,
    getComputedStyle: getComputedStyleFor
  };
  const context = {
    window,
    document,
    console,
    URLSearchParams,
    FormData: FakeFormData,
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout() {},
    fetch: async (url, init = {}) => {
      fetchCalls.push({ url: String(url), init });
      if (String(url).includes('/api/import/shortage-reports')) {
        return jsonResponse({ ok: true, reports: [] });
      }
      if (typeof options.fetchImpl === 'function') return options.fetchImpl(url, init, fetchCalls);
      return jsonResponse(buildReviewPayload());
    },
    getComputedStyle: getComputedStyleFor,
    escapeImportHtml: (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch])),
    formatNumber: (value) => String(Number(value || 0)),
    money: (value) => String(Number(value || 0)),
    displayImportAggregateQty: (value) => String(Number(value || 0)),
    displayImportQtyTL: (value) => String(Number(value || 0)),
    showMessage: (_target, message, isError) => {
      window.__lastMessage = { message: String(message || ''), isError: Boolean(isError) };
    },
    renderImportWarningModal() {},
    resetForm() {},
    loadSalesOrders: async () => { window.__loadCalls.push('loadSalesOrders'); },
    loadStock: async () => { window.__loadCalls.push('loadStock'); },
    loadProducts: async () => { window.__loadCalls.push('loadProducts'); },
    loadCustomers: async () => { window.__loadCalls.push('loadCustomers'); },
    loadUsers: async () => { window.__loadCalls.push('loadUsers'); },
    loadImportOrders: async () => { window.__loadCalls.push('loadImportOrders'); },
    loadDebts: async () => { window.__loadCalls.push('loadDebts'); },
    loadReceipts: async () => { window.__loadCalls.push('loadReceipts'); },
    loadCashbook: async () => { window.__loadCalls.push('loadCashbook'); },
    URL: window.URL,
    Blob: window.Blob
  };
  window.window = window;
  context.globalThis = context;
  context.self = window;
  context.window = window;
  window.fetch = context.fetch;
  window.setTimeout = context.setTimeout;
  window.clearTimeout = context.clearTimeout;

  vm.createContext(context);
  [
    'public/js/app/state/00a-catalog-orders-state.js',
    'public/js/app/state/00b-debt-return-fund-state.js',
    'public/js/app/state/00c-admin-system-state.js',
    'public/js/app/admin/08d-import-excel.js',
    'public/js/app/admin/08d-import-excel.part04.js',
    'public/js/app/admin/08d-import-excel.part02.js',
    'public/js/app/admin/08d-import-excel.part05.js',
    'public/js/app/admin/08d-import-excel.part03.js'
  ].forEach((file) => vm.runInContext(readProjectFile(file), context, { filename: file }));

  vm.runInContext(`
    importDataType.value=${JSON.stringify(rawImportType)};
    importPreviewSessionId=${JSON.stringify(sessionId)};
    importPreviewRows=${JSON.stringify(previewRows)};
    if(importPreviewRows[0])importSelectedRowKeySet.add(getImportRowSelectKey(importPreviewRows[0],0));
  `, context);
  if (options.stubCommitCore !== false) {
    vm.runInContext('commitImportExcelCore=async function(){window.__commitCalled=true;};', context);
  }
  fetchCalls.length = 0;

  return { context, window, document, fetchCalls, vm };
}

function seedDocumentElements(document) {
  const files = [
    'public/js/app/state/00a-catalog-orders-state.js',
    'public/js/app/state/00b-debt-return-fund-state.js',
    'public/js/app/state/00c-admin-system-state.js',
    'public/js/app/admin/08d-import-excel.js',
    'public/js/app/admin/08d-import-excel.part04.js',
    'public/js/app/admin/08d-import-excel.part02.js',
    'public/js/app/admin/08d-import-excel.part05.js',
    'public/js/app/admin/08d-import-excel.part03.js'
  ];
  const modalOwnedIds = new Set([
    'importShortageReviewModal',
    'importShortageReviewTitle',
    'importShortageReviewMeta',
    'importShortageReviewSummary',
    'importShortageReviewTable',
    'closeImportShortageReviewButton',
    'skipImportShortageReviewButton',
    'confirmImportShortageQuantityButton',
    'confirmImportShortageOrderButton'
  ]);
  const ids = new Set();
  files.forEach((file) => {
    const source = readProjectFile(file);
    for (const match of source.matchAll(/getElementById\((["'`])([^"'`]+)\1\)/g)) ids.add(match[2]);
  });
  ids.forEach((id) => {
    if (!modalOwnedIds.has(id)) document.ensureElement(id);
  });
}

function getComputedStyleFor(element) {
  return {
    position: element && element.classList && element.classList.contains('modal-backdrop') ? 'fixed' : '',
    display: element && element.hidden ? 'none' : 'flex',
    visibility: element && element.hidden ? 'hidden' : 'visible'
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function buildReviewPayload(overrides = {}) {
  return {
    ok: true,
    sessionId: 'IMP-257A-R1',
    fingerprint: 'fp-r1',
    selectedScopeFingerprint: 'scope-r1',
    status: 'pending',
    summary: {
      selectedOrderCount: 1,
      shortageOrderCount: 1,
      productCount: 1,
      itemCount: 1,
      totalMissingQuantity: 3,
      totalCutAmount: 36000
    },
    items: [{
      documentCode: 'SO-S3',
      customerName: 'Customer S3',
      productCode: 'SP-S3',
      productName: 'Product S3',
      requestedQuantity: 10,
      availableQuantity: 7,
      missingQuantity: 3,
      cutAmount: 36000
    }],
    ...overrides
  };
}

module.exports = {
  createImportShortageRuntime,
  buildReviewPayload,
  jsonResponse
};
