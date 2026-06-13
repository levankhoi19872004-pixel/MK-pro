'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'public', 'index.html');

function getClassicScriptSources(html) {
  return [...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)]
    .map((match) => String(match[1] || '').split('?')[0])
    .filter((src) => src.startsWith('/') && src.endsWith('.js'));
}

test('web admin classic scripts share one valid global lexical scope', () => {
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  const sources = getClassicScriptSources(html);

  assert.ok(sources.length > 0, 'Không tìm thấy script JavaScript trong public/index.html');

  const bundle = sources.map((src) => {
    const filePath = path.join(ROOT, 'public', src.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `Thiếu script được tham chiếu: ${src}`);
    return `\n// SOURCE: ${src}\n${fs.readFileSync(filePath, 'utf8')}`;
  }).join('\n');

  assert.doesNotThrow(
    () => new vm.Script(bundle, { filename: 'public-index-classic-scripts.js' }),
    'Các classic script trên trang quản trị không được khai báo trùng const/let/class/function gây dừng bootstrap'
  );
});

test('import order and import report modules use separate HTML escape identifiers', () => {
  const importOrderSource = fs.readFileSync(path.join(ROOT, 'public/js/app/04-import-orders.js'), 'utf8');
  const importReportSource = fs.readFileSync(path.join(ROOT, 'public/js/app/08-reports-users-promotions-import-excel.js'), 'utf8');

  assert.match(importOrderSource, /const\s+escapeImportOrderHtml\s*=/);
  assert.doesNotMatch(importOrderSource, /const\s+escapeImportHtml\s*=/);
  assert.match(importReportSource, /function\s+escapeImportHtml\s*\(/);
});
