'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const readPublicIndex = require('./helpers/readPublicIndex');

const HEAVY_INITIAL_MODULES = [
  '/js/app/new/91-delivery-today-new.js',
  '/js/app/new/92-debt-new.js',
  '/js/app/admin/08a-reports.js',
  '/js/app/06-master-delivery.js',
  '/js/app/debt/07d-master-return-orders.js',
  '/js/app/admin/08e-promotion-programs.js'
];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function scriptInventory() {
  const html = readPublicIndex(ROOT);
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match, index) => {
    const src = match[1];
    const pathname = src.split('?')[0];
    const absolute = path.join(ROOT, 'public', pathname.replace(/^\//, ''));
    const content = fs.existsSync(absolute) ? fs.readFileSync(absolute) : Buffer.alloc(0);
    return {
      index: index + 1,
      src,
      bytes: content.length,
      gzipBytes: content.length ? zlib.gzipSync(content).length : 0
    };
  });
}

test('Phase234 keeps six large desktop modules out of the initial shell', () => {
  const scripts = scriptInventory();
  const srcList = scripts.map((script) => script.src);
  for (const modulePath of HEAVY_INITIAL_MODULES) {
    assert.ok(!srcList.some((src) => src.startsWith(modulePath)), `${modulePath} must be lazy-loaded`);
  }
  assert.ok(srcList.some((src) => src.startsWith('/js/app/core/feature-module-loader.js')));
  assert.ok(srcList.some((src) => src.startsWith('/js/app/core/desktop-feature-facades.js')));
  assert.ok(srcList.indexOf(srcList.find((src) => src.includes('desktop-feature-facades.js'))) < srcList.indexOf(srcList.find((src) => src.includes('03-tab-loader.js'))));

  const totalBytes = scripts.reduce((sum, script) => sum + script.bytes, 0);
  const totalGzipBytes = scripts.reduce((sum, script) => sum + script.gzipBytes, 0);
  assert.equal(scripts.length, 63);
  assert.ok(totalBytes <= 750 * 1024, `initial decoded JS too large: ${totalBytes}`);
  assert.ok(totalGzipBytes <= 205 * 1024, `initial gzip JS too large: ${totalGzipBytes}`);
});

test('Phase234 desktop facade registry preserves feature entrypoint contracts', () => {
  const facades = read('public/js/app/core/desktop-feature-facades.js');
  for (const modulePath of HEAVY_INITIAL_MODULES) {
    assert.match(facades, new RegExp(modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const contract of [
    'loadDeliveryTodayNew',
    'openDeliveryTodayAdjustmentFromNotification',
    'loadDebtNew',
    'loadReports',
    'setReportDefaults',
    'loadMasterOrderModule',
    'loadMasterOrders',
    'openMasterOrderModal',
    'loadMasterReturnOrders',
    'openMasterReturnOrderModal',
    'loadPromotionPrograms',
    'loadPromotionProgramsByType',
    'openPromotionWorkspace'
  ]) {
    assert.match(facades, new RegExp(contract));
  }

  const bootstrap = read('public/js/bootstrap/03-tab-loader.js');
  assert.match(bootstrap, /loadDesktopFeature\('deliveryTodayNew'\)/);
  assert.match(bootstrap, /loadDesktopFeature\('debtNew'\)/);
  assert.match(bootstrap, /loadDesktopFeature\('reports'\)/);
  assert.match(bootstrap, /loadDesktopFeature\('masterOrders'\)/);
  assert.match(bootstrap, /loadDesktopFeature\('promotionPrograms'\)/);
  assert.match(bootstrap, /MKDesktopFeatures\.isFacade\(setReportDefaults\)/);
});
