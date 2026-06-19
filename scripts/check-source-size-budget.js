'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG = require('../config/source-size-budget.json');
const violations = [];

function sizeOf(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) {
    violations.push(`${relativePath}: file is missing`);
    return null;
  }
  return fs.statSync(absolute).size;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

for (const [relativePath, maxBytes] of Object.entries(CONFIG.files || {})) {
  const bytes = sizeOf(relativePath);
  if (bytes !== null && bytes > maxBytes) {
    violations.push(`${relativePath}: ${bytes} bytes > budget ${maxBytes}`);
  }
}

for (const group of CONFIG.groups || []) {
  const absoluteRoot = path.join(ROOT, group.root);
  const suffixes = Array.isArray(group.suffixes) ? group.suffixes : [];
  for (const file of walk(absoluteRoot)) {
    if (!suffixes.some((suffix) => file.endsWith(suffix))) continue;
    const bytes = fs.statSync(file).size;
    if (bytes > group.maxBytes) {
      violations.push(`${path.relative(ROOT, file)}: ${bytes} bytes > budget ${group.maxBytes}`);
    }
  }
}

if (violations.length) {
  console.error('[source-size-budget] FAILED');
  violations.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('[source-size-budget] OK');
