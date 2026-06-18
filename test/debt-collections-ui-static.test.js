'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => require('./helpers/sourceBundle.util').readSource(file);

test('web UI exposes debt collection pending confirmation tab and actions', () => {
  const html = read('public/index.html');
  const appState = read('public/js/app/state/00b-debt-return-fund-state.js');
  const debtJs = read('public/js/app/debt/07e-debt-collections.js');
  const routes = read('src/routes/debtCollectionRoutes.js');
  const controller = read('src/controllers/debtCollectionController.js');

  assert.match(html, /data-tab="debtCollectionsTab"/);
  assert.match(html, /id="debtCollectionTable"/);
  assert.match(appState, /const debtCollectionTable=/);
  assert.match(debtJs, /async function loadDebtCollections/);
  assert.match(debtJs, /confirmDebtCollectionFromWeb/);
  assert.match(debtJs, /rejectDebtCollectionFromWeb/);
  assert.match(routes, /router\.post\('\/'/);
  assert.match(controller, /async function submit\(req, res\)/);
});

test('mobile apps can submit pending debt collections', () => {
  const config = read('public/mobile/js/config.js');
  const api = read('public/mobile/js/api.js');
  const salesHtml = read('public/mobile/sales.html');
  const salesJs = read('public/mobile/js/sales.js');
  const deliveryJs = read('public/mobile/js/delivery-mobile-view.js');

  assert.match(config, /debtCollections:\s*'\/api\/mobile\/debt-collections'/);
  assert.match(api, /submitDebtCollection\(payload = \{\}\)/);
  assert.match(salesHtml, /debtPendingAmount/);
  assert.match(salesJs, /submitMobileDebtCollection/);
  assert.match(salesJs, /mobileApi\.submitDebtCollection/);
  assert.match(deliveryJs, /submitDeliveryDebtCollection/);
  assert.match(deliveryJs, /\/api\/mobile\/debt-collections/);
});
