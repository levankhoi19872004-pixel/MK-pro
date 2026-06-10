'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  'src/services/mobile',
  'src/services/master-order',
  'src/controllers/mobile',
  'src/routes/mobileRoutes.js',
  'src/services/reportService.js',
  'src/services/excelImportService.js'
];

function walk(fileOrDir) {
  const full = path.join(ROOT, fileOrDir);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return full.endsWith('.js') ? [full] : [];
  return fs.readdirSync(full).flatMap((name) => walk(path.join(fileOrDir, name)));
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function matchingBrace(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findForBlocks(text) {
  const blocks = [];
  const forRegex = /for\s*\([^)]*\)\s*\{/g;
  for (const match of text.matchAll(forRegex)) {
    const open = text.indexOf('{', match.index);
    const close = matchingBrace(text, open);
    if (close > open) blocks.push({ start: match.index, body: text.slice(open + 1, close) });
  }
  return blocks;
}

const MODEL_FIND = /await\s+[A-Z][A-Za-z0-9_]*\.(?:findById|findOne|find)\s*\(/;
const REPOSITORY_ONE_BY_ONE = /await\s+[a-z][A-Za-z0-9_]*Repository\.findByIdOrCode\s*\(/;
const MAP_ASYNC_MODEL_FIND = /\.map\s*\(\s*async[\s\S]{0,500}?[A-Z][A-Za-z0-9_]*\.(?:findById|findOne|find)\s*\(/g;

test('service trọng điểm không được tái xuất hiện N+1 query nguy hiểm', () => {
  const files = TARGETS.flatMap(walk);
  const violations = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const block of findForBlocks(text)) {
      if (MODEL_FIND.test(block.body)) violations.push(`${path.relative(ROOT, file)}:${lineOf(text, block.start)} for-await-model-find`);
      if (REPOSITORY_ONE_BY_ONE.test(block.body)) violations.push(`${path.relative(ROOT, file)}:${lineOf(text, block.start)} for-await-repository-findByIdOrCode`);
    }
    MAP_ASYNC_MODEL_FIND.lastIndex = 0;
    for (const match of text.matchAll(MAP_ASYNC_MODEL_FIND)) {
      violations.push(`${path.relative(ROOT, file)}:${lineOf(text, match.index)} map-async-model-find`);
    }
  }
  assert.deepEqual(violations, []);
});
