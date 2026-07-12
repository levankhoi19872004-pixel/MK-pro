'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const MANIFEST_FILE = path.join(ROOT, 'config', 'index-page-fragments.json');
const PLACEHOLDER = '{{INDEX_BODY}}';
const ENTERPRISE_START = '<!-- ENTERPRISE_CORE_ENTRY_START -->';
const ENTERPRISE_END = '<!-- ENTERPRISE_CORE_ENTRY_END -->';

const productionCache = new Map();

async function readManifest() {
  const raw = await fs.readFile(MANIFEST_FILE, 'utf8');
  const manifest = JSON.parse(raw);
  if (!manifest || !Array.isArray(manifest.fragments) || !manifest.shell) {
    throw new Error('Cấu hình index-page-fragments không hợp lệ');
  }
  return manifest;
}

function resolveProjectFile(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const absolute = path.resolve(ROOT, normalized);
  if (!absolute.startsWith(ROOT + path.sep)) {
    throw new Error(`Đường dẫn fragment không hợp lệ: ${relativePath}`);
  }
  return absolute;
}

function applyFeatureVisibility(html, featureSnapshot = {}) {
  const enterpriseEnabled = featureSnapshot.enterpriseCore === true;
  let output = String(html || '');
  let cursor = 0;

  while (true) {
    const start = output.indexOf(ENTERPRISE_START, cursor);
    if (start === -1) break;
    const contentStart = start + ENTERPRISE_START.length;
    const end = output.indexOf(ENTERPRISE_END, contentStart);
    if (end === -1) throw new Error('Enterprise feature block thiếu marker kết thúc');
    const content = output.slice(contentStart, end);
    output = output.slice(0, start) + (enterpriseEnabled ? content : '') + output.slice(end + ENTERPRISE_END.length);
    cursor = start + (enterpriseEnabled ? content.length : 0);
  }

  if (output.includes(ENTERPRISE_END)) {
    throw new Error('Enterprise feature block thiếu marker bắt đầu');
  }
  return output;
}

async function assembleIndexPage(options = {}) {
  const manifest = await readManifest();
  const shell = await fs.readFile(resolveProjectFile(manifest.shell), 'utf8');
  if (!shell.includes(PLACEHOLDER)) {
    throw new Error(`index.shell.html thiếu placeholder ${PLACEHOLDER}`);
  }

  const fragments = await Promise.all(
    manifest.fragments.map((file) => fs.readFile(resolveProjectFile(file), 'utf8'))
  );
  return applyFeatureVisibility(shell.replace(PLACEHOLDER, fragments.join('')), options.featureSnapshot);
}

function cacheKey(featureSnapshot = {}) {
  return `enterpriseCore:${featureSnapshot.enterpriseCore === true ? '1' : '0'}`;
}

async function renderIndexPage(options = {}) {
  if (process.env.NODE_ENV !== 'production') return assembleIndexPage(options);
  const key = cacheKey(options.featureSnapshot);
  if (!productionCache.has(key)) productionCache.set(key, await assembleIndexPage(options));
  return productionCache.get(key);
}

function clearIndexPageCache() {
  productionCache.clear();
}

module.exports = {
  PUBLIC_ROOT,
  MANIFEST_FILE,
  PLACEHOLDER,
  ENTERPRISE_START,
  ENTERPRISE_END,
  applyFeatureVisibility,
  assembleIndexPage,
  renderIndexPage,
  clearIndexPageCache
};
