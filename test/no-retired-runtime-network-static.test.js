'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|html|htm|jsfrag)$/.test(entry.name) || entry.name.endsWith('.source.js')) out.push(full);
  }
  return out;
}

test('frontend runtime does not call retired master-return write endpoints', () => {
  const files = walk(path.join(ROOT, 'public'));
  const offenders = [];
  const badPatterns = [
    /fetch\s*\(\s*[`'"]\/api\/master-return-orders[`'"][\s\S]{0,160}method\s*:\s*[`'"]POST/i,
    /fetch\s*\(\s*[`'"]\/api\/master-return-orders[`'"][\s\S]{0,160}method\s*:\s*[`'"]PUT/i,
    /fetch\s*\(\s*[`'"]\/api\/master-return-orders[`'"][\s\S]{0,160}method\s*:\s*[`'"]PATCH/i,
    /\/api\/master-return-orders\/[^`'"\s]+\/receive/,
    /\/api\/master-return-orders\/[^`'"\s]+\/cancel/
  ];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    if (badPatterns.some((pattern) => pattern.test(src))) offenders.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offenders, []);
});

test('frontend runtime does not call retired delivery/mobile legacy namespaces', () => {
  const files = walk(path.join(ROOT, 'public'));
  const offenders = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    if (src.includes('/api/mobile-legacy') || src.includes('/api/delivery-today')) offenders.push(path.relative(ROOT, file));
  }
  assert.deepEqual(offenders, []);
});
