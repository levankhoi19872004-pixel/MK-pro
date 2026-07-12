'use strict';

const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');

const MIN_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');

function normalizeZipEntry(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

function assertSafeEntries(entries) {
  const seen = new Set();
  for (const rawEntry of entries) {
    const entry = normalizeZipEntry(rawEntry);
    if (!entry) continue;
    if (entry.startsWith('/') || /^[A-Za-z]:\//.test(entry) || entry.startsWith('../') || entry.includes('/../')) {
      throw new Error(`ZIP_UNSAFE_ENTRY ${entry}`);
    }
    if (seen.has(entry)) throw new Error(`ZIP_DUPLICATE_ENTRY ${entry}`);
    seen.add(entry);
  }
  return [...seen];
}

function normalizedDate(input) {
  const value = input instanceof Date ? input : new Date(input || MIN_ZIP_DATE);
  if (Number.isNaN(value.getTime())) return MIN_ZIP_DATE;
  return value < MIN_ZIP_DATE ? MIN_ZIP_DATE : value;
}

async function loadZip(zipPath, options = {}) {
  const absolute = path.resolve(zipPath);
  if (!fs.existsSync(absolute)) throw new Error(`ZIP_NOT_FOUND ${absolute}`);
  const buffer = fs.readFileSync(absolute);
  return JSZip.loadAsync(buffer, {
    checkCRC32: options.checkCRC32 !== false,
    createFolders: false
  });
}

async function listZipEntries(zipPath, options = {}) {
  const zip = await loadZip(zipPath, options);
  return assertSafeEntries(Object.keys(zip.files).map(normalizeZipEntry).filter(Boolean));
}

async function extractZip(zipPath, targetDir, options = {}) {
  const zip = await loadZip(zipPath, options);
  const entries = assertSafeEntries(Object.keys(zip.files).map(normalizeZipEntry).filter(Boolean));
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of entries) {
    const zipEntry = zip.files[entry] || zip.files[`${entry}/`];
    if (!zipEntry) throw new Error(`ZIP_ENTRY_MISSING ${entry}`);
    const destination = path.join(targetDir, ...entry.split('/'));
    const resolved = path.resolve(destination);
    const root = `${path.resolve(targetDir)}${path.sep}`;
    if (resolved !== path.resolve(targetDir) && !resolved.startsWith(root)) {
      throw new Error(`ZIP_UNSAFE_EXTRACTION_PATH ${entry}`);
    }
    if (zipEntry.dir) {
      fs.mkdirSync(resolved, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const content = await zipEntry.async('nodebuffer');
    fs.writeFileSync(resolved, content);
    if (typeof zipEntry.unixPermissions === 'number') {
      try { fs.chmodSync(resolved, zipEntry.unixPermissions & 0o777); } catch (_) { /* best effort */ }
    }
  }
  return { entries };
}

async function createZipFromFiles(options = {}) {
  const root = path.resolve(options.root || process.cwd());
  const output = path.resolve(options.output || path.join(path.dirname(root), 'artifact.zip'));
  const files = assertSafeEntries((options.files || []).map(normalizeZipEntry).filter(Boolean)).sort();
  const date = normalizedDate(options.date);
  const compressionLevel = Number.isInteger(options.compressionLevel) ? options.compressionLevel : 9;
  const zip = new JSZip();

  for (const entry of files) {
    const absolute = path.join(root, ...entry.split('/'));
    const stat = fs.statSync(absolute, { throwIfNoEntry: false });
    if (!stat?.isFile()) throw new Error(`ZIP_SOURCE_FILE_MISSING ${entry}`);
    zip.file(entry, fs.readFileSync(absolute), {
      date,
      createFolders: false,
      unixPermissions: stat.mode & 0o777,
      compression: 'DEFLATE',
      compressionOptions: { level: compressionLevel }
    });
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    platform: 'UNIX',
    compression: 'DEFLATE',
    compressionOptions: { level: compressionLevel },
    streamFiles: false
  });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, buffer);
  return { output, entries: files, byteLength: buffer.length };
}

async function verifyZipIntegrity(zipPath) {
  const zip = await loadZip(zipPath, { checkCRC32: true });
  const entries = assertSafeEntries(Object.keys(zip.files).map(normalizeZipEntry).filter(Boolean));
  for (const entry of entries) {
    const zipEntry = zip.files[entry] || zip.files[`${entry}/`];
    if (zipEntry && !zipEntry.dir) await zipEntry.async('uint8array');
  }
  return { ok: true, entries };
}

module.exports = {
  MIN_ZIP_DATE,
  normalizeZipEntry,
  assertSafeEntries,
  normalizedDate,
  loadZip,
  listZipEntries,
  extractZip,
  createZipFromFiles,
  verifyZipIntegrity
};
