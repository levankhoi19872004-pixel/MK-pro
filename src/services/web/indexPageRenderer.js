'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const MANIFEST_FILE = path.join(ROOT, 'config', 'index-page-fragments.json');
const PLACEHOLDER = '{{INDEX_BODY}}';

let productionCache = null;

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

async function assembleIndexPage() {
  const manifest = await readManifest();
  const shell = await fs.readFile(resolveProjectFile(manifest.shell), 'utf8');
  if (!shell.includes(PLACEHOLDER)) {
    throw new Error(`index.shell.html thiếu placeholder ${PLACEHOLDER}`);
  }

  const fragments = await Promise.all(
    manifest.fragments.map((file) => fs.readFile(resolveProjectFile(file), 'utf8'))
  );
  return shell.replace(PLACEHOLDER, fragments.join(''));
}

async function renderIndexPage() {
  if (process.env.NODE_ENV !== 'production') return assembleIndexPage();
  if (!productionCache) productionCache = await assembleIndexPage();
  return productionCache;
}

function clearIndexPageCache() {
  productionCache = null;
}

module.exports = {
  PUBLIC_ROOT,
  MANIFEST_FILE,
  PLACEHOLDER,
  assembleIndexPage,
  renderIndexPage,
  clearIndexPageCache
};
