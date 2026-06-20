'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG = require('../../config/source-bundles.json');
const BY_TARGET = new Map((CONFIG.bundles || []).map((entry) => [entry.target, entry]));

function normalizeRelativePath(file) {
  const raw = String(file || '');
  const resolved = path.isAbsolute(raw) ? path.relative(ROOT, raw) : raw;
  return resolved.replace(/\\/g, '/').replace(/^\.\//, '');
}

function canonicalFiles(entry) {
  if (entry.canonicalSource) return [entry.canonicalSource];
  return Array.isArray(entry.parts) ? entry.parts : [];
}

function readSource(file) {
  const normalized = normalizeRelativePath(file);
  const entry = BY_TARGET.get(normalized);
  if (!entry) return fs.readFileSync(path.join(ROOT, normalized), 'utf8');
  return canonicalFiles(entry).map((part) => fs.readFileSync(path.join(ROOT, part), 'utf8')).join('');
}

function sourceParts(file) {
  const normalized = normalizeRelativePath(file);
  const entry = BY_TARGET.get(normalized);
  return entry ? canonicalFiles(entry) : [normalized];
}

module.exports = { readSource, sourceParts };
