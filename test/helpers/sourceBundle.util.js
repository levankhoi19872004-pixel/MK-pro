'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG = require('../../config/source-bundles.json');
const BY_TARGET = new Map((CONFIG.bundles || []).map((entry) => [entry.target, entry]));

const EXCEL_IMPORT_CANONICAL_PARTS = [
  'src/services/excelImportService.js',
  'src/services/import/importCommit.impl.js',
  'src/services/import/ImportCommitOrchestrator.js',
  'src/services/import/importTransaction.service.js',
  'src/services/import/preview/importPreview.impl.js',
  'src/services/import/core/importValue.util.js',
  'src/services/import/core/importRow.util.js',
  'src/services/import/core/importPersistence.util.js',
  'src/services/import/selectiveUpdate.util.js',
  'src/services/import/operations/adminImport.impl.js',
  'src/services/import/operations/catalogImport.impl.js',
  'src/services/import/operations/financeImport.impl.js',
  'src/services/import/operations/salesImport.impl.js'
];

function normalizeRelativePath(file) {
  const raw = String(file || '');
  const resolved = path.isAbsolute(raw) ? path.relative(ROOT, raw) : raw;
  return resolved.replace(/\\/g, '/').replace(/^\.\//, '');
}

function canonicalFiles(entry) {
  if (entry.canonicalSource) return [entry.canonicalSource];
  return Array.isArray(entry.parts) ? entry.parts : [];
}

function readFileRelative(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function assembledIndexSource() {
  const manifest = JSON.parse(readFileRelative('config/index-page-fragments.json'));
  const shell = readFileRelative(manifest.shell);
  const body = (manifest.fragments || []).map((part) => readFileRelative(part)).join('');
  return shell.replace('{{INDEX_BODY}}', body);
}

function expandCssImports(normalized, seen = new Set()) {
  if (seen.has(normalized)) return '';
  seen.add(normalized);
  const source = readFileRelative(normalized);
  const dir = path.posix.dirname(normalized);
  return source.replace(/@import\s+url\(['"]?([^)'";]+)['"]?\)\s*;?/g, (full, imported) => {
    const cleanImport = String(imported || '').replace(/^\/+/, '');
    const next = imported.startsWith('/') ? cleanImport : path.posix.normalize(path.posix.join(dir, imported));
    if (!fs.existsSync(path.join(ROOT, next))) return full;
    return `/* expanded ${next} */\n${expandCssImports(next, seen)}\n/* end ${next} */`;
  });
}

function readSource(file) {
  const normalized = normalizeRelativePath(file);
  if (normalized === 'public/index.html') return assembledIndexSource();
  if (normalized === 'src/services/excelImportService.js') {
    return EXCEL_IMPORT_CANONICAL_PARTS
      .filter((part) => fs.existsSync(path.join(ROOT, part)))
      .map((part) => `\n/* canonical import source: ${part} */\n${readFileRelative(part)}`)
      .join('\n');
  }
  const entry = BY_TARGET.get(normalized);
  if (entry) return canonicalFiles(entry).map((part) => readFileRelative(part)).join('');
  if (normalized.endsWith('.css')) return expandCssImports(normalized);
  return readFileRelative(normalized);
}

function sourceParts(file) {
  const normalized = normalizeRelativePath(file);
  if (normalized === 'public/index.html') {
    const manifest = JSON.parse(readFileRelative('config/index-page-fragments.json'));
    return [manifest.shell, ...(manifest.fragments || [])];
  }
  if (normalized === 'src/services/excelImportService.js') return EXCEL_IMPORT_CANONICAL_PARTS;
  const entry = BY_TARGET.get(normalized);
  return entry ? canonicalFiles(entry) : [normalized];
}

module.exports = { readSource, sourceParts };
