(function () {
  'use strict';

  if (window.__V45_SPEED_MONITOR_INSTALLED__) return;
  window.__V45_SPEED_MONITOR_INSTALLED__ = true;

  var MAX_ITEMS = 20;
  var SLOW_MS = 1000;
  var WARN_MS = 600;
  var FAST_MS = 300;
  var items = [];
  var activeArea = 'Khởi động';
  var originalFetch = window.fetch ? window.fetch.bind(window) : null;

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function pad2(n) {
    return String(n).padStart ? String(n).padStart(2, '0') : ('0' + n).slice(-2);
  }

  function timeText() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function safeText(v) {
    return String(v == null ? '' : v).replace(/[<>&"]/g, function (c) {
      return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] || c;
    });
  }

  function getUrl(input) {
    if (typeof input === 'string') return input;
    if (input && input.url) return input.url;
    return String(input || '');
  }

  function cleanUrl(url) {
    try {
      var u = new URL(url, window.location.origin);
      return u.pathname + (u.search || '');
    } catch (err) {
      return String(url || '');
    }
  }

  function labelFromUrl(url) {
    var u = cleanUrl(url);
    if (u.indexOf('/api/sales-orders/search') >= 0) return 'Danh sách đơn bán';
    if (u.indexOf('/api/orders') >= 0) return 'Đơn bán';
    if (u.indexOf('/api/products') >= 0 || u.indexOf('/api/catalog/products') >= 0) return 'Sản phẩm';
    if (u.indexOf('/api/customers') >= 0 || u.indexOf('/api/catalog/customers') >= 0) return 'Khách hàng';
    if (u.indexOf('/api/stock') >= 0 || u.indexOf('/api/inventory') >= 0) return 'Tồn kho';
    if (u.indexOf('/api/master-orders') >= 0) return 'Đơn tổng';
    if (u.indexOf('/api/return') >= 0) return 'Trả hàng';
    if (u.indexOf('/api/delivery') >= 0 || u.indexOf('/api/mobile/delivery') >= 0) return 'App giao hàng';
    if (u.indexOf('/api/mobile/sales') >= 0) return 'App bán hàng';
    if (u.indexOf('/api/ar') >= 0 || u.indexOf('/api/debt') >= 0 || u.indexOf('/api/receivable') >= 0) return 'Công nợ';
    if (u.indexOf('/api/fund') >= 0 || u.indexOf('/api/cash') >= 0 || u.indexOf('/api/bank') >= 0) return 'Quỹ tiền';
    if (u.indexOf('/api/reports') >= 0) return 'Báo cáo';
    if (u.indexOf('/api/health') >= 0 || u.indexOf('/api/status') >= 0) return 'Server';
    return u.split('?')[0].replace('/api/', '') || 'API';
  }

  function statusClass(ms, ok) {
    if (!ok) return 'danger';
    if (ms >= SLOW_MS) return 'danger';
    if (ms >= WARN_MS) return 'warn';
    return 'ok';
  }

  function ensurePanel() {
    var panel = document.getElementById('v45SpeedMonitor');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'v45SpeedMonitor';
    panel.className = 'v45-speed-monitor';
    panel.innerHTML =
      '<div class="v45-speed-main">' +
        '<span class="v45-speed-dot"></span>' +
        '<strong id="v45SpeedTitle">Tốc độ</strong>' +
        '<span id="v45SpeedLast">Chưa đo</span>' +
      '</div>' +
      '<div id="v45SpeedDetail" class="v45-speed-detail">API: 0 · Chậm: 0</div>' +
      '<div id="v45SpeedList" class="v45-speed-list" aria-live="polite"></div>';

    var header = document.querySelector('.header') || document.querySelector('.mobile-header') || document.body;
    header.appendChild(panel);
    return panel;
  }

  function render() {
    if (!document.body) return;
    var panel = ensurePanel();
    var last = items[0];
    var slowCount = items.filter(function (x) { return x.ms >= SLOW_MS || !x.ok; }).length;
    var avg = items.length ? Math.round(items.reduce(function (s, x) { return s + x.ms; }, 0) / items.length) : 0;

    var cls = last ? statusClass(last.ms, last.ok) : 'ok';
    panel.classList.remove('ok', 'warn', 'danger');
    panel.classList.add(cls);

    var title = document.getElementById('v45SpeedTitle');
    var lastEl = document.getElementById('v45SpeedLast');
    var detail = document.getElementById('v45SpeedDetail');
    var list = document.getElementById('v45SpeedList');

    if (title) title.textContent = activeArea || 'Tốc độ';
    if (lastEl) {
      lastEl.textContent = last
        ? (last.label + ' ' + last.ms + 'ms' + (last.status ? ' · ' + last.status : ''))
        : 'Chưa đo';
    }
    if (detail) detail.textContent = 'API: ' + items.length + ' · TB: ' + avg + 'ms · Chậm: ' + slowCount;

    if (list) {
      list.innerHTML = items.slice(0, 8).map(function (x) {
        return '<div class="v45-speed-row ' + statusClass(x.ms, x.ok) + '">' +
          '<span>' + safeText(x.time) + ' · ' + safeText(x.label) + '</span>' +
          '<strong>' + safeText(x.ms) + 'ms</strong>' +
          '<small>' + safeText(cleanUrl(x.url)).slice(0, 90) + '</small>' +
        '</div>';
      }).join('');
    }
  }

  function pushMetric(metric) {
    items.unshift(metric);
    if (items.length > MAX_ITEMS) items = items.slice(0, MAX_ITEMS);
    window.__V45_SPEED_METRICS__ = items.slice();
    render();

    if (metric.ms >= SLOW_MS || !metric.ok) {
      console.warn('[V45_SPEED_SLOW]', metric);
    } else {
      console.log('[V45_SPEED]', metric);
    }
  }

  function detectActiveArea() {
    var active =
      document.querySelector('.tab-button.active') ||
      document.querySelector('.tab-btn.active') ||
      document.querySelector('.delivery-tab.active') ||
      document.querySelector('[data-tab].active') ||
      document.querySelector('[data-delivery-tab].active');

    if (!active) {
      activeArea = document.title || 'Tốc độ';
      render();
      return;
    }

    var text = (active.textContent || '').trim();
    activeArea = text || active.getAttribute('data-tab') || active.getAttribute('data-delivery-tab') || 'Tốc độ';
    render();
  }

  function installTabWatcher() {
    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('.tab-button, .tab-btn, .delivery-tab')) {
        setTimeout(detectActiveArea, 60);
      }
    }, true);
    setTimeout(detectActiveArea, 100);
  }

  if (originalFetch) {
    window.fetch = function (input, init) {
      var url = getUrl(input);
      var started = now();
      return originalFetch(input, init).then(function (res) {
        var ms = Math.round(now() - started);
        pushMetric({
          time: timeText(),
          area: activeArea,
          label: labelFromUrl(url),
          url: url,
          ms: ms,
          ok: res.ok,
          status: res.status
        });
        return res;
      }).catch(function (err) {
        var ms = Math.round(now() - started);
        pushMetric({
          time: timeText(),
          area: activeArea,
          label: labelFromUrl(url),
          url: url,
          ms: ms,
          ok: false,
          status: err && err.name ? err.name : 'ERR'
        });
        throw err;
      });
    };
  }

  window.V45SpeedMonitor = {
    getMetrics: function () { return items.slice(); },
    clear: function () { items = []; render(); },
    render: render,
    markArea: function (name) { activeArea = name || activeArea; render(); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      ensurePanel();
      installTabWatcher();
      render();
    });
  } else {
    ensurePanel();
    installTabWatcher();
    render();
  }
})();