'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(path.join(ROOT, file));
const html = read('public/mobile/sales.html');
const css = read('public/mobile/mobile.css');

const VIEWPORTS = [320, 360, 390, 412];

test('phase 4 mobile viewport contract covers supported phone widths', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1\.0"/);
  assert.match(css, /\.mobile-page\s*\{[\s\S]*max-width:\s*520px/);
  assert.match(css, /\.mobile-tabs\.mobile-bottom-nav[\s\S]*left:\s*50%[\s\S]*width:\s*min\(100%,\s*520px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /padding-bottom:\s*calc\([^;]*env\(safe-area-inset-bottom/);
  VIEWPORTS.forEach((width) => assert.ok(width <= 520));
});

test('phase 4 keeps touch and responsive contracts for narrow Android screens', () => {
  assert.match(css, /\.sales-app-page button,[\s\S]*min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*420px\)/);
  assert.match(css, /@media\s*\(max-width:\s*380px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere|word-break:\s*break-word/);
  assert.match(css, /:focus-visible/);
});
