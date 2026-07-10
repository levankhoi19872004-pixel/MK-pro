'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const loaderSource = fs.readFileSync(path.join(ROOT, 'public/js/app/core/feature-module-loader.js'), 'utf8');

function createContext(options = {}) {
  const appended = [];
  const failures = new Map(Object.entries(options.failures || {}));
  const window = { setTimeout, clearTimeout };
  const head = {
    appendChild(node) {
      node.parentNode = head;
      appended.push(node);
      setTimeout(() => {
        const key = node.src || node.href;
        const remainingFailures = failures.get(key) || 0;
        if (remainingFailures > 0) {
          failures.set(key, remainingFailures - 1);
          if (typeof node.onerror === 'function') node.onerror(new Error('planned failure'));
          return;
        }
        if (node.src && options.readyByScript && options.readyByScript[key]) {
          window[options.readyByScript[key]] = true;
        }
        if (typeof node.onload === 'function') node.onload();
      }, 0);
    },
    removeChild(node) {
      const index = appended.indexOf(node);
      if (index !== -1) appended.splice(index, 1);
      node.parentNode = null;
    }
  };
  const document = {
    head,
    createElement(tag) {
      return {
        tagName: String(tag).toUpperCase(),
        dataset: {},
        parentNode: null,
        onload: null,
        onerror: null,
        set src(value) { this._src = value; },
        get src() { return this._src; },
        set href(value) { this._href = value; },
        get href() { return this._href; },
        set rel(value) { this._rel = value; },
        get rel() { return this._rel; }
      };
    },
    querySelectorAll(selector) {
      if (selector === 'script[src]') return appended.filter((node) => node.src);
      if (selector === 'link[rel="stylesheet"][href]') return appended.filter((node) => node.href);
      return [];
    }
  };
  window.document = document;
  const context = { window, document, console, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(loaderSource, context);
  return { context, window, appended };
}

test('feature module loader coalesces concurrent script loads', async () => {
  const { window, appended } = createContext({ readyByScript: { '/js/app/mock-feature.js': 'mockFeatureReady' } });
  window.MKFeatureModuleLoader.register('mockFeature', {
    scripts: ['/js/app/mock-feature.js'],
    readyCheck: (win) => win.mockFeatureReady === true
  });

  await Promise.all([
    window.MKFeatureModuleLoader.load('mockFeature'),
    window.MKFeatureModuleLoader.load('mockFeature')
  ]);

  assert.equal(appended.filter((node) => node.src === '/js/app/mock-feature.js').length, 1);
  assert.equal(window.MKFeatureModuleLoader.isReady('mockFeature'), true);
});

test('feature module loader rejects unsafe external asset URLs', () => {
  const { window } = createContext();
  assert.throws(() => {
    window.MKFeatureModuleLoader.register('badFeature', { scripts: ['https://example.test/bad.js'] });
  }, /Unsafe feature asset URL/);
  assert.throws(() => {
    window.MKFeatureModuleLoader.register('badFeature2', { scripts: ['/js/../bad.js'] });
  }, /Unsafe feature asset URL/);
});

test('feature module loader retries a transient failed script once', async () => {
  const { window, appended } = createContext({
    failures: { '/js/app/retry-feature.js': 1 },
    readyByScript: { '/js/app/retry-feature.js': 'retryFeatureReady' }
  });
  window.MKFeatureModuleLoader.register('retryFeature', {
    scripts: ['/js/app/retry-feature.js'],
    retries: 1,
    readyCheck: (win) => win.retryFeatureReady === true
  });

  await window.MKFeatureModuleLoader.load('retryFeature');

  assert.equal(appended.filter((node) => node.src === '/js/app/retry-feature.js').length, 1);
  assert.equal(window.retryFeatureReady, true);
});
