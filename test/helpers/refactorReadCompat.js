'use strict';

// Test-only source-view adapter. Static regression tests historically inspected
// monolithic files. After phase 79, this adapter presents the assembled source
// view while Node's module loader still receives the real facade modules.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const originalReadFileSync = fs.readFileSync.bind(fs);
let insideAdapter = false;

function isModuleLoaderCall() {
  const lines = String(new Error().stack || '').split('\n').slice(2);
  const caller = lines.find((line) => !line.includes('phase79ReadFileSync') && !line.includes('isModuleLoaderCall')) || '';
  return caller.includes('node:internal/modules/cjs/loader') || caller.includes('internal/modules/cjs/loader');
}

function readText(file) {
  return originalReadFileSync(file, 'utf8');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function assembledIndex() {
  const manifest = JSON.parse(readText(path.join(ROOT, 'config/index-page-fragments.json')));
  const shell = readText(path.join(ROOT, manifest.shell));
  const body = manifest.fragments.map((file) => readText(path.join(ROOT, file))).join('');
  return shell.replace('{{INDEX_BODY}}', body);
}

function concatenatedFiles(files) {
  return files.map((file) => `\n/* SOURCE: ${path.relative(ROOT, file)} */\n${readText(file)}`).join('\n');
}

function masterOrderSource() {
  const dir = path.join(ROOT, 'src/services/master-order');
  const ordered = [
    'masterOrderQuery.impl.js',
    'masterOrderReturn.impl.js',
    'deliveryAccountingCore.impl.js',
    'deliveryCommon.impl.js',
    'deliveryTodayList.impl.js',
    'deliverySummary.impl.js',
    'deliverySalesSummary.impl.js',
    'deliveryOrdersCompact.impl.js',
    'deliveryOrderCommand.impl.js',
    'deliveryAccountingCommand.impl.js',
    'masterOrderPrintLegacy.impl.js',
    'masterOrderCommand.impl.js',
    'masterOrderIdentity.util.js',
    'deliveryAccounting.service.js',
    'masterOrderLegacy.service.js'
  ].map((name) => path.join(dir, name));
  return concatenatedFiles(ordered);
}

function excelImportSource() {
  const base = path.join(ROOT, 'src/services/import');
  const ordered = [
    'core/importValue.util.js',
    'core/importPersistence.util.js',
    'core/importRow.util.js',
    'operations/catalogImport.impl.js',
    'operations/salesImport.impl.js',
    'operations/financeImport.impl.js',
    'operations/adminImport.impl.js',
    'preview/importPreview.impl.js',
    'importCommit.impl.js',
    '../excelImportService.js'
  ].map((name) => path.resolve(base, name));
  return concatenatedFiles(ordered);
}

function splitCssSource(kind) {
  const dir = path.join(ROOT, 'public/css', kind);
  return walk(dir)
    .filter((file) => file.endsWith('.css'))
    .sort()
    .map(readText)
    .join('');
}

fs.readFileSync = function phase79ReadFileSync(file, ...args) {
  if (insideAdapter || isModuleLoaderCall()) return originalReadFileSync(file, ...args);
  const absolute = path.resolve(String(file));
  const normalized = absolute.replace(/\\/g, '/');
  const encoding = args[0];
  const wantsText = typeof encoding === 'string' || (encoding && typeof encoding === 'object' && encoding.encoding);
  if (!wantsText) return originalReadFileSync(file, ...args);

  try {
    insideAdapter = true;
    let value = null;
    if (normalized === path.join(ROOT, 'public/index.html').replace(/\\/g, '/')) value = assembledIndex();
    else if (normalized === path.join(ROOT, 'public/css/00-base.css').replace(/\\/g, '/')) value = splitCssSource('base');
    else if (normalized === path.join(ROOT, 'public/css/10-operational-overrides.css').replace(/\\/g, '/')) value = splitCssSource('overrides');
    else if (normalized === path.join(ROOT, 'src/services/master-order/masterOrderLegacy.service.js').replace(/\\/g, '/')) value = masterOrderSource();
    else if (normalized === path.join(ROOT, 'src/services/excelImportService.js').replace(/\\/g, '/')) value = excelImportSource();

    if (value !== null) {
      const requestedEncoding = typeof encoding === 'string' ? encoding : encoding.encoding;
      return requestedEncoding ? value : Buffer.from(value);
    }
    return originalReadFileSync(file, ...args);
  } finally {
    insideAdapter = false;
  }
};
