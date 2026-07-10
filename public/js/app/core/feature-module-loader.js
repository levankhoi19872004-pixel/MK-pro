'use strict';

(function setupFeatureModuleLoader() {
  if (window.MKFeatureModuleLoader) return;

  var registry = Object.create(null);
  var loads = Object.create(null);
  var loadedAssets = Object.create(null);
  var DEFAULT_TIMEOUT_MS = 15000;
  var MAX_RETRIES = 1;

  function normalizeUrl(url) {
    var raw = String(url || '').trim();
    if (!raw || raw.indexOf('..') !== -1 || /^(?:[a-z]+:)?\/\//i.test(raw)) {
      throw new Error('Unsafe feature asset URL');
    }
    if (raw.charAt(0) !== '/') raw = '/' + raw;
    if (!/^\/(?:js|css)\//.test(raw)) throw new Error('Feature asset URL must stay under /js or /css');
    return raw;
  }

  function assetKey(url) {
    return normalizeUrl(url);
  }

  function resolveReadyCheck(check) {
    if (!check) return true;
    if (typeof check === 'function') return !!check(window);
    if (typeof check !== 'string') return false;
    var parts = check.split('.');
    var cursor = window;
    for (var i = 0; i < parts.length; i += 1) {
      cursor = cursor && cursor[parts[i]];
    }
    return typeof cursor !== 'undefined' && cursor !== null;
  }

  function withTimeout(work, timeoutMs, label) {
    return new Promise(function waitForAsset(resolve, reject) {
      var done = false;
      var timer = setTimeout(function onTimeout() {
        if (done) return;
        done = true;
        reject(new Error('Timed out loading feature asset: ' + label));
      }, Math.max(1000, Number(timeoutMs || DEFAULT_TIMEOUT_MS)));
      work(function finish(value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(value);
      }, function fail(error) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function findExistingScript(url) {
    var key = assetKey(url);
    var scripts = document.querySelectorAll('script[src]');
    for (var i = 0; i < scripts.length; i += 1) {
      if (assetKey(scripts[i].getAttribute('src')) === key) return scripts[i];
    }
    return null;
  }

  function findExistingStyle(url) {
    var key = assetKey(url);
    var links = document.querySelectorAll('link[rel="stylesheet"][href]');
    for (var i = 0; i < links.length; i += 1) {
      if (assetKey(links[i].getAttribute('href')) === key) return links[i];
    }
    return null;
  }

  function loadScript(url, timeoutMs) {
    var src = normalizeUrl(url);
    var key = 'script:' + assetKey(src);
    if (loadedAssets[key]) return loadedAssets[key];
    loadedAssets[key] = withTimeout(function appendScript(resolve, reject) {
      var existing = findExistingScript(src);
      if (existing && existing.dataset.mkFeatureLoaded === '1') {
        resolve();
        return;
      }
      var script = existing || document.createElement('script');
      script.src = src;
      script.async = false;
      script.dataset.mkFeatureAsset = '1';
      script.onload = function onLoad() {
        script.dataset.mkFeatureLoaded = '1';
        resolve();
      };
      script.onerror = function onError() {
        delete loadedAssets[key];
        if (script.parentNode && script.dataset.mkFeatureAsset === '1') script.parentNode.removeChild(script);
        reject(new Error('Cannot load feature script: ' + src));
      };
      if (!existing) document.head.appendChild(script);
    }, timeoutMs, src);
    return loadedAssets[key];
  }

  function loadStyle(url, timeoutMs) {
    var href = normalizeUrl(url);
    var key = 'style:' + assetKey(href);
    if (loadedAssets[key]) return loadedAssets[key];
    loadedAssets[key] = withTimeout(function appendStyle(resolve, reject) {
      var existing = findExistingStyle(href);
      if (existing && existing.dataset.mkFeatureLoaded === '1') {
        resolve();
        return;
      }
      var link = existing || document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.mkFeatureAsset = '1';
      link.onload = function onLoad() {
        link.dataset.mkFeatureLoaded = '1';
        resolve();
      };
      link.onerror = function onError() {
        delete loadedAssets[key];
        if (link.parentNode && link.dataset.mkFeatureAsset === '1') link.parentNode.removeChild(link);
        reject(new Error('Cannot load feature style: ' + href));
      };
      if (!existing) document.head.appendChild(link);
    }, timeoutMs, href);
    return loadedAssets[key];
  }

  function register(name, config) {
    var key = String(name || '').trim();
    if (!/^[A-Za-z0-9_-]+$/.test(key)) throw new Error('Invalid feature name');
    var next = Object.assign({ scripts: [], styles: [], dependencies: [], timeoutMs: DEFAULT_TIMEOUT_MS }, config || {});
    next.scripts = (next.scripts || []).map(normalizeUrl);
    next.styles = (next.styles || []).map(normalizeUrl);
    next.dependencies = (next.dependencies || []).map(function normalizeFeature(dep) {
      var value = String(dep || '').trim();
      if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid feature dependency');
      return value;
    });
    registry[key] = next;
    return key;
  }

  async function load(name, options) {
    var key = String(name || '').trim();
    var config = registry[key];
    if (!config) throw new Error('Unknown desktop feature: ' + key);
    if (resolveReadyCheck(config.readyCheck)) return true;
    if (loads[key] && options && options.retry === true) delete loads[key];
    if (loads[key]) return loads[key];
    var retries = Math.min(MAX_RETRIES, Math.max(0, Number(config.retries || 0)));
    loads[key] = (async function loadFeature() {
      var attempt = 0;
      while (attempt <= retries) {
        try {
          for (var i = 0; i < config.dependencies.length; i += 1) await load(config.dependencies[i]);
          for (var s = 0; s < config.styles.length; s += 1) await loadStyle(config.styles[s], config.timeoutMs);
          for (var j = 0; j < config.scripts.length; j += 1) await loadScript(config.scripts[j], config.timeoutMs);
          if (!resolveReadyCheck(config.readyCheck)) throw new Error('Feature ready check failed: ' + key);
          if (!config.__initialized && typeof config.init === 'function') {
            config.__initialized = true;
            await config.init(window);
          }
          return true;
        } catch (error) {
          attempt += 1;
          if (attempt > retries) {
            delete loads[key];
            throw error;
          }
        }
      }
      return false;
    }());
    return loads[key];
  }

  window.MKFeatureModuleLoader = {
    register: register,
    load: load,
    has: function has(name) { return !!registry[String(name || '').trim()]; },
    isReady: function isReady(name) {
      var config = registry[String(name || '').trim()];
      return !!config && resolveReadyCheck(config.readyCheck);
    },
    _registry: registry
  };
}());
