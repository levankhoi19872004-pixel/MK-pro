'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Phase35 header uses production NPP branding and no longer shows step text', () => {
  const shell = read('public/index.shell.html');
  const header = read('public/fragments/index/01-index-body.html');

  assert.match(shell, /<title>Unilever - Minh Khai Thái Bình<\/title>/);
  assert.match(header, /class="header app-header"/);
  assert.match(header, /Unilever - Minh Khai Thái Bình/);
  assert.match(header, /Phần mềm quản lý tổng thể NPP/);
  assert.match(header, /Lập trình: Lê Văn Khởi/);
  assert.doesNotMatch(header, /KHO Minh Khai Pro V44/);
  assert.doesNotMatch(header, /Step 6:/);
});

test('Phase35 header keeps status, account actions and responsive styling hooks', () => {
  const header = read('public/fragments/index/01-index-body.html');
  const css = read('public/css/98-header-branding.css');
  const auth = read('public/js/auth-guard.js');

  assert.match(header, /id="serverStatus"/);
  assert.match(header, /app-header__brand/);
  assert.match(header, /app-header__status/);
  assert.match(header, /app-header__actions/);
  assert.match(css, /\.header\.app-header/);
  assert.match(css, /grid-template-columns:\s*minmax\(320px, 1fr\) auto minmax\(0, auto\) auto/);
  assert.match(css, /@media \(max-width: 1024px\)/);
  assert.match(auth, /header\.querySelector\('\.app-header__actions'\)\|\|header/);
  assert.match(auth, /className='app-header__account'/);
  assert.match(auth, /className='user-pill'/);
  assert.match(auth, /className='logout-button secondary-btn'/);
});

test('Phase35 debug speed monitor is hidden by default and preserved behind debug flag', () => {
  const monitor = read('public/js/utils/v45-speed-monitor.js');
  const css = read('public/css/98-header-branding.css');

  assert.match(monitor, /function isDebugMode\(\)/);
  assert.match(monitor, /MKPRO_DEBUG_UI/);
  assert.match(monitor, /V45_DEBUG_UI/);
  assert.match(monitor, /debugArea\.hidden = true/);
  assert.match(monitor, /debugArea\.hidden = false/);
  assert.match(monitor, /document\.querySelector\('\.app-header__debug'\)/);
  assert.match(css, /\.app-header__debug\[hidden\]/);
  assert.match(css, /\.header\.app-header \.v45-speed-monitor/);
});
