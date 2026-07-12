#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ACTIVE_FILES = [
  'public/js/shared/scoped-bulk-selection.js',
  'public/js/app/new/91-delivery-today-new.js',
  'public/js/app/new/92-debt-new.js',
  'public/js/app/05-sales-orders.source/part-03.jsfrag',
  'public/js/app/05-sales-orders.source/part-04.jsfrag',
  'public/js/app/06-master-delivery.js',
  'public/js/app/admin/08d-import-excel.source/part-01.jsfrag',
  'public/js/app/admin/08d-import-excel.source/part-01b.jsfrag',
  'public/js/app/admin/08d-import-excel.source/part-02.jsfrag',
  'public/fragments/index/02-index-body.html',
  'public/fragments/index/03-index-body.html',
  'public/fragments/index/07-index-body.html'
];

const EXPECTED_SCOPES = new Map([
  ['delivery-order-list', 'sales-order'],
  ['debt-order-list', 'debt-order'],
  ['import-preview-valid-rows', 'import-preview-row'],
  ['sales-order-list', 'sales-order'],
  ['master-order-list', 'master-order'],
  ['master-unmerged-child-list', 'sales-order']
]);

const errors = [];
const warnings = [];

function read(relative) {
  const full = path.join(ROOT, relative);
  if (!fs.existsSync(full)) {
    errors.push(`${relative}: missing active runtime file`);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

const sources = new Map(ACTIVE_FILES.map((file) => [file, read(file)]));
const allSource = [...sources.values()].join('\n');

if (!sources.get('public/fragments/index/07-index-body.html').includes('/js/shared/scoped-bulk-selection.js')) {
  errors.push('shared scoped bulk-selection helper is not loaded before active feature code');
}

const forbiddenIds = [
  'deliveryTodayNewSelectAllOrders',
  'deliveryTodayNewClearOrders',
  'deliveryTodayNewHeaderSelectAllOrders',
  'debtNewSelectAllDebtOrders',
  'debtNewClearDebtOrders',
  'selectAllImportPreviewButton',
  'clearAllImportPreviewButton'
];
for (const id of forbiddenIds) {
  if (allSource.includes(id)) errors.push(`retired duplicate bulk control still exists: ${id}`);
}

const forbiddenExactCaption = />\s*Bỏ chọn\s*</g;
for (const [file, source] of sources) {
  if (forbiddenExactCaption.test(source)) errors.push(`${file}: ambiguous caption "Bỏ chọn" remains in active bulk-selection runtime`);
  forbiddenExactCaption.lastIndex = 0;
}

const globalSelectorChecks = [
  [/document\.querySelectorAll\(\s*['"]\.sales-order-check/g, 'sales-order global checkbox selector'],
  [/document\.querySelectorAll\(\s*['"]\.import-row-check/g, 'import-preview global checkbox selector'],
  [/document\.querySelectorAll\(\s*['"]\.import-modal-row-check/g, 'import-modal global checkbox selector'],
  [/document\.querySelectorAll\(\s*['"]\.deliveryTodayNewOrderSelect/g, 'delivery-order global checkbox selector'],
  [/document\.querySelectorAll\(\s*['"]\.debt-new-order-check/g, 'debt-order global checkbox selector'],
  [/document\.querySelectorAll\(\s*['"]\.master-order-check/g, 'master-order global checkbox selector'],
  [/document\.querySelectorAll\(\s*['"]\.child-order-check/g, 'unmerged-order global checkbox selector']
];
for (const [pattern, label] of globalSelectorChecks) {
  for (const [file, source] of sources) {
    if (pattern.test(source)) errors.push(`${file}: ${label}`);
    pattern.lastIndex = 0;
  }
}

const toggleTagPattern = /<button\b[^>]*data-selection-toggle[^>]*>/g;
const scopeContainers = new Map();
for (const [file, source] of sources) {
  const tags = source.match(toggleTagPattern) || [];
  for (const tag of tags) {
    const required = [
      ['type="button"', /\btype=["']button["']/],
      ['data-selection-scope', /\bdata-selection-scope=["'][^"']+["']/],
      ['aria-controls', /\baria-controls=["'][^"']+["']/],
      ['aria-label', /\baria-label=["'][^"']+["']/],
      ['aria-pressed', /\baria-pressed=["'][^"']+["']/]
    ];
    for (const [name, pattern] of required) if (!pattern.test(tag)) errors.push(`${file}: data-selection-toggle missing ${name}`);
  }

  const containerPattern = /<[^>]+\bid=["']([^"']+)["'][^>]+\bdata-selection-scope=["']([^"']+)["'][^>]+\bdata-selection-entity=["']([^"']+)["'][^>]*>/g;
  let match;
  while ((match = containerPattern.exec(source))) {
    const [, id, scope, entity] = match;
    if (scopeContainers.has(scope)) errors.push(`${file}: duplicate selection scope container ${scope}`);
    else scopeContainers.set(scope, { id, entity, file });
  }
}

for (const [scope, entity] of EXPECTED_SCOPES) {
  const found = scopeContainers.get(scope);
  if (!found) errors.push(`missing selection scope container: ${scope}`);
  else if (found.entity !== entity) errors.push(`${scope}: expected entity ${entity}, found ${found.entity}`);
}

const delivery = sources.get('public/js/app/new/91-delivery-today-new.js');
const functionSlice = (source, name, nextName) => {
  const start = source.indexOf(`function ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  return start < 0 ? '' : source.slice(start, end < 0 ? source.length : end);
};
const orderToggle = functionSlice(delivery, 'toggleVisibleOrderSelection', 'getSelectedOrders');
if (/selectedSalesmanKeys|selectGroupOrders|toggleSalesmanSelection/.test(orderToggle)) {
  errors.push('Delivery Today order bulk toggle mutates or calls the NVBH selection scope');
}
const manualOrderToggle = functionSlice(delivery, 'toggleOrderSelection', 'selectAllVisibleOrders');
if (/selectedSalesmanKeys|salesmanKey\(|groupSelectedCount|renderSalesmanGroupPanel/.test(manualOrderToggle)) {
  errors.push('Delivery Today manual order selection mutates the NVBH filter scope');
}
if (!/selectedOrderIds/.test(delivery) || !/selectedSalesmanKeys/.test(delivery)) {
  errors.push('Delivery Today must keep separate order and NVBH selection stores');
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (packageJson.scripts?.['audit:bulk-selection'] !== 'node scripts/audit-scoped-bulk-selection.js') {
  errors.push('package.json missing audit:bulk-selection script');
}

// P2 inventory: active header checkboxes are tracked but are not P0/P1 button-pair migrations.
const p2Files = [
  'public/fragments/index/01-index-body.html',
  'public/js/app/05-sales-orders.source/part-02.jsfrag'
];
for (const file of p2Files) {
  const source = fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), 'utf8') : '';
  if (/productCheckAll|customerCheckAll|checkAllImportOrders/.test(source)) warnings.push(`${file}: active header-checkbox bulk control retained as P2`);
}

if (errors.length) {
  console.error('[bulk-selection-audit] FAILED');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`[bulk-selection-audit] OK ${EXPECTED_SCOPES.size} governed scopes`);
warnings.forEach((warning) => console.log(`[bulk-selection-audit] P2 ${warning}`));
