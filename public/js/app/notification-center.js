(function () {
  'use strict';

  var state = {
    summaryLoading: false,
    listLoading: false,
    dropdownOpen: false,
    filters: { unread: '', module: '', severity: '' },
    page: 1,
    limit: 30
  };

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtTime(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value || '');
    return d.toLocaleString('vi-VN', { hour12: false });
  }

  function severityText(value) {
    var key = String(value || 'info').toLowerCase();
    if (key === 'critical') return 'Nghiêm trọng';
    if (key === 'warning') return 'Cảnh báo';
    return 'Thông tin';
  }

  function moduleText(value) {
    var key = String(value || '').toLowerCase();
    return {
      ar: 'Công nợ', delivery: 'Giao hàng', order: 'Đơn hàng', stock: 'Kho',
      import: 'Import', fund: 'Quỹ tiền', user: 'Tài khoản', system: 'Hệ thống', return: 'Hàng trả'
    }[key] || key || 'Hệ thống';
  }

  async function apiJson(url, options) {
    var res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không gọi được API thông báo');
    return json;
  }

  function ensureShell() {
    var actions = document.querySelector('.app-header__actions');
    if (actions && !document.getElementById('notificationBellButton')) {
      var wrap = document.createElement('div');
      wrap.className = 'notification-bell-wrap';
      wrap.innerHTML = '' +
        '<button type="button" id="notificationBellButton" class="notification-bell" aria-label="Thông báo">' +
          '<span aria-hidden="true">🔔</span><span id="notificationBellBadge" class="notification-badge" hidden>0</span>' +
        '</button>' +
        '<div id="notificationDropdown" class="notification-dropdown" hidden>' +
          '<div class="notification-dropdown-head"><strong>Thông báo mới</strong><button type="button" id="notificationReadAllSmall" class="secondary small">Đọc tất cả</button></div>' +
          '<div id="notificationLatestList" class="notification-latest"><div class="notification-empty">Đang tải...</div></div>' +
          '<div class="notification-dropdown-foot"><button type="button" id="notificationOpenCenter" class="secondary small">Xem tất cả</button></div>' +
        '</div>';
      actions.prepend(wrap);
    }

    var tabs = document.querySelector('.tabs');
    if (tabs && !document.querySelector('.tab-button[data-tab="notificationCenterTab"]')) {
      var button = document.createElement('button');
      button.className = 'tab-button';
      button.dataset.tab = 'notificationCenterTab';
      button.textContent = 'Thông báo';
      var system = tabs.querySelector('[data-tab="systemTab"]');
      tabs.insertBefore(button, system || null);
    }

    var app = document.querySelector('.app');
    if (app && !document.getElementById('notificationCenterTab')) {
      var section = document.createElement('section');
      section.id = 'notificationCenterTab';
      section.className = 'tab-content';
      section.innerHTML = '' +
        '<div class="card notification-center-card">' +
          '<div class="toolbar notification-toolbar">' +
            '<div><h2>Thông báo</h2><p class="muted">Theo dõi thay đổi quan trọng về tiền, công nợ, giao hàng, kho và import.</p></div>' +
            '<div class="toolbar-actions notification-filter-actions">' +
              '<select id="notificationUnreadFilter"><option value="">Tất cả</option><option value="1">Chưa đọc</option></select>' +
              '<select id="notificationModuleFilter"><option value="">Mọi module</option><option value="ar">Công nợ</option><option value="delivery">Giao hàng</option><option value="order">Đơn hàng</option><option value="stock">Kho</option><option value="import">Import</option><option value="fund">Quỹ tiền</option><option value="user">Tài khoản</option></select>' +
              '<select id="notificationSeverityFilter"><option value="">Mọi mức độ</option><option value="critical">Nghiêm trọng</option><option value="warning">Cảnh báo</option><option value="info">Thông tin</option></select>' +
              '<button type="button" id="notificationReloadButton" class="secondary">Tải thông báo</button>' +
              '<button type="button" id="notificationReadAllButton" class="secondary">Đánh dấu đã đọc</button>' +
            '</div>' +
          '</div>' +
          '<div id="notificationCenterSummary" class="summary-box notification-summary"><span>Chưa đọc: <strong id="notificationUnreadCount">0</strong></span><span>Nghiêm trọng: <strong id="notificationCriticalCount">0</strong></span></div>' +
          '<div id="notificationCenterMessage" class="notification-message" hidden></div>' +
          '<div class="table-wrap notification-table-wrap"><table class="notification-table"><thead><tr><th>Thời gian</th><th>Mức độ</th><th>Module</th><th>Nội dung</th><th>Người thao tác</th><th>Trạng thái</th><th>Hành động</th></tr></thead><tbody id="notificationCenterTable"><tr><td colspan="7">Bấm Tải thông báo để xem.</td></tr></tbody></table></div>' +
        '</div>';
      var systemTab = document.getElementById('systemTab');
      app.insertBefore(section, systemTab || null);
    }
  }

  function setBadge(count, critical) {
    var badge = document.getElementById('notificationBellBadge');
    if (!badge) return;
    var n = Number(count || 0);
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = n <= 0;
    badge.classList.toggle('is-critical', Number(critical || 0) > 0);
    var unread = document.getElementById('notificationUnreadCount');
    if (unread) unread.textContent = String(n);
    var criticalEl = document.getElementById('notificationCriticalCount');
    if (criticalEl) criticalEl.textContent = String(Number(critical || 0));
  }

  function latestHtml(rows) {
    if (!rows || !rows.length) return '<div class="notification-empty">Chưa có thông báo.</div>';
    return rows.map(function (row) {
      return '<button type="button" class="notification-latest-item ' + (!row.readAt ? 'is-unread' : '') + '" data-notification-id="' + esc(row.id) + '" data-action-url="' + esc(row.actionUrl || '') + '">' +
        '<span class="notification-severity notification-severity-' + esc(row.severity || 'info') + '">' + esc(severityText(row.severity)) + '</span>' +
        '<strong>' + esc(row.title) + '</strong>' +
        '<small>' + esc(row.message) + '</small>' +
        '<em>' + esc(fmtTime(row.createdAt)) + '</em>' +
      '</button>';
    }).join('');
  }

  async function loadSummary() {
    if (state.summaryLoading) return;
    state.summaryLoading = true;
    try {
      var json = await apiJson('/api/notifications/summary?limit=10');
      setBadge(json.unreadCount, json.criticalUnreadCount);
      var latest = document.getElementById('notificationLatestList');
      if (latest) latest.innerHTML = latestHtml(json.latest || []);
    } catch (err) {
      var latestEl = document.getElementById('notificationLatestList');
      if (latestEl) latestEl.innerHTML = '<div class="notification-empty error">Không tải được thông báo.</div>';
      console.warn('[NOTIFICATION_SUMMARY_ERROR]', err);
    } finally {
      state.summaryLoading = false;
    }
  }

  function buildListQuery() {
    var params = new URLSearchParams();
    params.set('page', String(state.page));
    params.set('limit', String(state.limit));
    if (state.filters.unread) params.set('unread', state.filters.unread);
    if (state.filters.module) params.set('module', state.filters.module);
    if (state.filters.severity) params.set('severity', state.filters.severity);
    return params.toString();
  }

  function rowHtml(row) {
    var read = !!row.readAt;
    return '<tr class="notification-row ' + (read ? '' : 'is-unread') + '">' +
      '<td>' + esc(fmtTime(row.createdAt)) + '</td>' +
      '<td><span class="notification-severity notification-severity-' + esc(row.severity || 'info') + '">' + esc(severityText(row.severity)) + '</span></td>' +
      '<td>' + esc(moduleText(row.module)) + '</td>' +
      '<td><strong>' + esc(row.title) + '</strong><small>' + esc(row.message) + '</small></td>' +
      '<td>' + esc(row.actorName || row.actorCode || '') + '</td>' +
      '<td>' + (read ? 'Đã đọc' : '<b>Chưa đọc</b>') + '</td>' +
      '<td><button type="button" class="secondary small notification-view-btn" data-notification-id="' + esc(row.id) + '" data-action-url="' + esc(row.actionUrl || '') + '">Xem</button></td>' +
    '</tr>';
  }

  async function loadList() {
    ensureShell();
    if (state.listLoading) return;
    state.listLoading = true;
    var tbody = document.getElementById('notificationCenterTable');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7">Đang tải thông báo...</td></tr>';
    try {
      var json = await apiJson('/api/notifications?' + buildListQuery());
      var rows = json.notifications || [];
      if (tbody) tbody.innerHTML = rows.length ? rows.map(rowHtml).join('') : '<tr><td colspan="7">Chưa có thông báo.</td></tr>';
      await loadSummary();
    } catch (err) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="7">Không tải được danh sách thông báo.</td></tr>';
      console.warn('[NOTIFICATION_LIST_ERROR]', err);
    } finally {
      state.listLoading = false;
    }
  }


  function navigateActionUrl(actionUrl) {
    if (!actionUrl) return;
    var map = {
      'debt-new': 'debtNewTab',
      'delivery-today-new': 'deliveryTodayNewTab',
      'sales': 'salesTab',
      'return-orders': 'returnOrdersTab',
      'import-data': 'importDataTab',
      'funds': 'fundsTab',
      'users': 'usersTab',
      'stock': 'stockTab'
    };
    var match = String(actionUrl).match(/#\/([^?]+)/);
    var key = match && match[1] ? match[1] : '';
    var tab = map[key];
    if (tab) {
      window.location.hash = actionUrl.split('#')[1] || '';
      document.querySelector('.tab-button[data-tab="' + tab + '"]')?.click();
      return;
    }
    window.location.href = actionUrl;
  }

  async function markRead(id, actionUrl) {
    if (!id) return;
    try { await apiJson('/api/notifications/' + encodeURIComponent(id) + '/read', { method: 'POST' }); } catch (err) { console.warn('[NOTIFICATION_READ_ERROR]', err); }
    await loadSummary();
    if (document.getElementById('notificationCenterTab')?.classList.contains('active')) loadList();
    if (actionUrl) navigateActionUrl(actionUrl);
  }

  async function readAll() {
    try { await apiJson('/api/notifications/read-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.filters) }); } catch (err) { console.warn('[NOTIFICATION_READ_ALL_ERROR]', err); }
    await loadSummary();
    await loadList();
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var bell = event.target.closest && event.target.closest('#notificationBellButton');
      if (bell) {
        var dropdown = document.getElementById('notificationDropdown');
        state.dropdownOpen = !state.dropdownOpen;
        if (dropdown) dropdown.hidden = !state.dropdownOpen;
        if (state.dropdownOpen) loadSummary();
        return;
      }
      if (!event.target.closest || !event.target.closest('.notification-bell-wrap')) {
        var dd = document.getElementById('notificationDropdown');
        if (dd) dd.hidden = true;
        state.dropdownOpen = false;
      }
      var latestItem = event.target.closest && event.target.closest('.notification-latest-item');
      if (latestItem) markRead(latestItem.dataset.notificationId, latestItem.dataset.actionUrl || '');
      var viewBtn = event.target.closest && event.target.closest('.notification-view-btn');
      if (viewBtn) markRead(viewBtn.dataset.notificationId, viewBtn.dataset.actionUrl || '');
      if (event.target.id === 'notificationOpenCenter') {
        document.querySelector('.tab-button[data-tab="notificationCenterTab"]')?.click();
      }
      if (event.target.id === 'notificationReloadButton') loadList();
      if (event.target.id === 'notificationReadAllButton' || event.target.id === 'notificationReadAllSmall') readAll();
    });

    document.addEventListener('change', function (event) {
      if (event.target.id === 'notificationUnreadFilter') { state.filters.unread = event.target.value; state.page = 1; loadList(); }
      if (event.target.id === 'notificationModuleFilter') { state.filters.module = event.target.value; state.page = 1; loadList(); }
      if (event.target.id === 'notificationSeverityFilter') { state.filters.severity = event.target.value; state.page = 1; loadList(); }
    });
  }

  ensureShell();
  bindEvents();
  setTimeout(loadSummary, 800);
  window.NotificationCenter = { loadSummary: loadSummary, loadList: loadList, markRead: markRead };
}());
