'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const closeoutPath = path.join(root, 'src/services/accounting/AccountingCloseoutService.js');
const routePath = path.join(root, 'src/routes/newOperationsRoutes.js');
const frontendPath = path.join(root, 'public/js/app/new/91-delivery-today-new.js');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('closeout command response exposes queued read-model sync contract', () => {
  const source = read(closeoutPath);
  assert.match(source, /readModelSync:\s*{\s*mode:\s*'queued'/);
  assert.match(source, /status:\s*readModelSyncQueued\s*>\s*0\s*\?\s*'pending'\s*:\s*'not_needed'/);
  assert.match(source, /readModelSync:\s*{\s*mode:\s*'skipped'/);
});

test('route forwards readModelSync to frontend/API clients', () => {
  const source = read(routePath);
  assert.match(source, /const\s+readModelSync\s*=\s*result\.readModelSync/);
  assert.match(source, /readModelSync,/);
  assert.match(source, /Công nợ đang đồng bộ nền/);
});

test('frontend treats queued sync as success notice and does not block closeout', () => {
  const source = read(frontendPath);
  assert.match(source, /json\.readModelSync\s*\|\|\s*data\.readModelSync/);
  assert.match(source, /syncPending/);
  assert.match(source, /Công nợ đang đồng bộ nền/);
});
