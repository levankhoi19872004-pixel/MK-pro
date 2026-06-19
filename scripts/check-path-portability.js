'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'coverage', 'backups', 'uploads']);
const sourceFiles = [];
const allPaths = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name) || entry.name.endsWith('.source')) continue;
    const full = path.join(dir, entry.name);
    const relative = path.relative(ROOT, full).split(path.sep).join('/');
    allPaths.push(relative);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) sourceFiles.push(full);
  }
}

function exactEntryExists(target) {
  const absolute = path.resolve(target);
  const relative = path.relative(ROOT, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;

  let cursor = ROOT;
  if (!relative) return true;
  for (const segment of relative.split(path.sep)) {
    let entries;
    try {
      entries = fs.readdirSync(cursor);
    } catch {
      return false;
    }
    if (!entries.includes(segment)) return false;
    cursor = path.join(cursor, segment);
  }
  return true;
}

function resolveLocalRequire(fromFile, request) {
  const base = path.resolve(path.dirname(fromFile), request);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.json`,
    path.join(base, 'index.js'),
    path.join(base, 'index.json')
  ];
  return candidates.find((candidate) => exactEntryExists(candidate) && fs.existsSync(candidate));
}

walk(ROOT);

const errors = [];
const byLowerPath = new Map();
for (const relative of allPaths) {
  const key = relative.toLocaleLowerCase('en-US');
  const previous = byLowerPath.get(key);
  if (previous && previous !== relative) {
    errors.push(`CASE_COLLISION ${previous} <-> ${relative}`);
  } else {
    byLowerPath.set(key, relative);
  }
}

const requirePattern = /\brequire\(\s*(['"])(\.{1,2}\/[^'"\r\n]+)\1\s*\)/g;
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(requirePattern)) {
    const request = match[2];
    if (!resolveLocalRequire(file, request)) {
      errors.push(`UNRESOLVED_LOCAL_REQUIRE ${path.relative(ROOT, file)} -> ${request}`);
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`PATH_PORTABILITY_OK ${allPaths.length} paths, ${sourceFiles.length} JavaScript files`);
