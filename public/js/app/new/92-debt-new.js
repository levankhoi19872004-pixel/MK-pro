(function () {
  'use strict';

  var rootId = 'debtNewRoot';
  var state = {
    customers: [],
    selectedIndex: -1,
    loaded: false,
    hasSearched: false,
    userTouchedFilters: false,
    selectedOrderKeys: {},
    collections: [],
    selectedFilters: { customerCode: '', orderCode: '', salesStaffCode: '', deliveryStaffCode: '' },
    modalOpen: false,
    modalTab: 'overview',
    detailLoading: false,
    suggest: {
      timers: {},
      requestSeq: { search: 0, salesman: 0, delivery: 0 },
      items: { search: [], salesman: [], delivery: [] },
      active: { search: -1, salesman: -1, delivery: -1 },
      loading: { search: false, salesman: false, delivery: false }
    }
  };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function num(value) { var n = Number(String(value || 0).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; }
  function money(value) { return num(value).toLocaleString('vi-VN'); }
  function orderKey(order) { return String((order && (order.orderCode || order.salesOrderCode || order.orderId || order.salesOrderId || order.id)) || ''); }
  function openDebt(order) { return Math.max(0, num(order && (order.debt ?? order.remainingDebt ?? order.availableDebt ?? order.availableDebtAmount))); }
  function statusLabel(status) {
    var value = String(status || 'open').toLowerCase();
    if (value === 'open') return 'Còn nợ';
    if (value === 'paid' || value === 'closed') return 'Hết nợ';
    if (value === 'overpaid') return 'Dư có';
    if (value === 'submitted') return 'Chờ xác nhận';
    if (value === 'accounting_confirmed') return 'Đã xác nhận';
    if (value === 'rejected') return 'Từ chối';
    return value || 'Còn nợ';
  }

  function ensureRoot() {
    var root = byId(rootId);
    if (!root) return null;
    if (root.dataset.phase100DebtReady === '1') return root;
    root.dataset.phase100DebtReady = '1';
    root.innerHTML = '' +
      '<section class="card debt-new-filter-card">' +
        '<div class="debt-new-filter-header">' +
          '<div class="debt-new-filter-title"><h2>Công nợ (New)</h2><p class="muted">Tra cứu công nợ theo khách hàng, đơn, NVBH hoặc NVGH từ AR read model.</p></div>' +
          '<span class="new-badge debt-new-source-badge">AR-DEBT only</span>' +
        '</div>' +
        '<div class="debt-new-filter-grid" role="search" aria-label="Bộ lọc Công nợ New">' +
          '<label class="debt-new-field debt-new-field-wide debt-new-suggest-wrap">Tìm khách / đơn<input id="debtNewSearch" autocomplete="off" placeholder="Mã KH, tên KH, SĐT hoặc mã đơn"><div id="debtNewSearchSuggestions" class="debt-new-suggest" hidden></div></label>' +
          '<label class="debt-new-field debt-new-suggest-wrap">NVBH<input id="debtNewSalesman" autocomplete="off" placeholder="Mã/tên NVBH"><div id="debtNewSalesmanSuggestions" class="debt-new-suggest" hidden></div></label>' +
          '<label class="debt-new-field debt-new-suggest-wrap">NVGH<input id="debtNewDelivery" autocomplete="off" placeholder="Mã/tên NVGH"><div id="debtNewDeliverySuggestions" class="debt-new-suggest" hidden></div></label>' +
          '<label class="debt-new-field">Trạng thái<select id="debtNewStatus"><option value="open">Còn nợ</option><option value="all">Tất cả</option><option value="paid">Hết nợ</option><option value="overpaid">Dư có</option></select></label>' +
          '<button id="debtNewLoad" type="button" class="primary-action debt-new-load-btn">Tải</button>' +
          '<button id="debtNewReset" type="button" class="secondary debt-new-reset-btn">Xóa lọc</button>' +
        '</div>' +
        '<p id="debtNewMessage" class="message debt-new-message"></p>' +
      '</section>' +
      '<section id="debtNewEmptyState" class="card debt-new-empty-state"><b>Chưa có dữ liệu hiển thị.</b><span>Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải.</span></section>' +
      '<section class="new-kpi-grid debt-new-kpis" aria-label="KPI Công nợ New">' +
        '<article class="new-kpi-card"><span>Tổng nợ</span><b id="debtNewTotalDebt">0</b></article>' +
        '<article class="new-kpi-card"><span>Khách nợ</span><b id="debtNewCustomerCount">0</b></article>' +
        '<article class="new-kpi-card"><span>Đơn nợ</span><b id="debtNewOrderCount">0</b></article>' +
        '<article class="new-kpi-card"><span>Dư có</span><b id="debtNewCreditBalance">0</b></article>' +
        '<article class="new-kpi-card"><span>Debit</span><b id="debtNewDebit">0</b></article>' +
        '<article class="new-kpi-card"><span>Credit</span><b id="debtNewCredit">0</b></article>' +
      '</section>' +
      '<section class="card debt-new-customers-panel debt-new-results">' +
        '<div class="ui-page-header debt-new-main-header"><div><h3>Khách công nợ New</h3><p class="muted">Chọn một khách hoặc bấm <b>Chi tiết</b> để mở popup công nợ, đơn nợ và lập phiếu thu.</p></div></div>' +
        '<div class="new-table-wrap debt-new-customer-table-wrap"><table class="new-table debt-new-customer-table"><thead><tr><th>Mã khách hàng</th><th>Tên khách hàng</th><th>NVBH</th><th>NVGH</th><th>Số đơn nợ</th><th>Còn nợ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="debtNewCustomerTable"><tr><td colspan="8">Chưa tải dữ liệu.</td></tr></tbody></table></div>' +
      '</section>' +
      '<section class="card debt-new-collections-panel debt-new-results"><div class="ui-page-header"><div><h3>Phiếu thu chờ xác nhận</h3><p class="muted">Phiếu <b>submitted</b> chưa làm giảm công nợ. Chi tiết và thao tác confirm/reject nằm trong popup từng khách.</p></div><button id="debtNewReloadCollections" type="button" class="secondary">Tải phiếu</button></div><div id="debtNewCollectionsList" class="new-detail-list"><div class="empty-state">Chưa tải phiếu thu.</div></div></section>' +
      '<div id="debtNewCustomerModal" class="debt-new-modal" hidden></div>';

    ensureScopedStyle();
    var loadButton = byId('debtNewLoad');
    var resetButton = byId('debtNewReset');
    var reloadCollections = byId('debtNewReloadCollections');
    if (loadButton) loadButton.addEventListener('click', load);
    if (resetButton) resetButton.addEventListener('click', resetFiltersToEmptyState);
    if (reloadCollections) reloadCollections.addEventListener('click', loadCollections);
    attachFilterInputs();
    document.addEventListener('click', function (event) {
      if (!event.target || !event.target.closest || !event.target.closest('.debt-new-suggest-wrap')) closeAllSuggestions();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && state.modalOpen) closeDebtCustomerModal();
    });
    var status = byId('debtNewStatus');
    if (status) status.addEventListener('change', function () { state.userTouchedFilters = true; });
    resetResultsState('Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải.');
    return root;
  }

  function ensureScopedStyle() {
    if (document.getElementById('debtNewScopedStyle')) return;
    var style = document.createElement('style');
    style.id = 'debtNewScopedStyle';
    style.textContent = '' +
      '.debt-new-filter-card{padding:14px 16px 12px;margin-bottom:12px;}.debt-new-filter-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px;}.debt-new-filter-title h2{margin:0 0 4px;font-size:18px;line-height:1.2;}.debt-new-filter-title p{margin:0;font-size:12px;line-height:1.35;}.debt-new-source-badge{white-space:nowrap;padding:5px 10px;font-size:12px;align-self:flex-start;}.debt-new-filter-grid{display:grid;grid-template-columns:minmax(320px,2fr) minmax(170px,1fr) minmax(170px,1fr) minmax(145px,.75fr) auto auto;gap:10px;align-items:end;}.debt-new-field{position:relative;display:flex;flex-direction:column;gap:4px;margin:0;font-weight:800;color:#334155;font-size:12px;line-height:1.2;}.debt-new-field input,.debt-new-field select,.debt-new-load-btn,.debt-new-reset-btn{height:34px;box-sizing:border-box;border-radius:9px;}.debt-new-field input,.debt-new-field select{width:100%;padding:7px 10px;border:1px solid #cbd5e1;background:#fff;font-size:13px;}.debt-new-load-btn,.debt-new-reset-btn{padding:0 14px;white-space:nowrap;align-self:end;}.debt-new-message{min-height:18px;margin:8px 0 0;}.debt-new-suggest-wrap{position:relative;}.debt-new-suggest{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:1000;background:#fff;border:1px solid #dbe7f5;border-radius:12px;box-shadow:0 18px 36px rgba(15,23,42,.16);padding:6px;max-height:280px;overflow:auto;}.debt-new-suggest[hidden]{display:none!important;}.debt-new-suggest-item{display:block;width:100%;border:0;background:#fff;text-align:left;border-radius:9px;padding:8px 10px;cursor:pointer;color:#14213d;}.debt-new-suggest-item:hover,.debt-new-suggest-item.active{background:#eff6ff;outline:2px solid rgba(37,99,235,.12);}.debt-new-suggest-item b{display:block;font-size:13px;color:#0f3ea9;}.debt-new-suggest-item span{display:block;margin-top:2px;font-size:12px;color:#64748b;}.debt-new-suggest-empty,.debt-new-suggest-loading{padding:9px 10px;color:#64748b;font-weight:700;font-size:12px;}.debt-new-empty-state{margin:12px 0;padding:20px;text-align:center;border:1px dashed #cbd5e1;background:#f8fafc;color:#334155;}.debt-new-empty-state b{display:block;font-size:16px;margin-bottom:6px;color:#0f172a;}.debt-new-empty-state span{display:block;color:#64748b;font-weight:700;}.debt-new-results-hidden{display:none!important;}.debt-new-status{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-weight:800;font-size:12px;background:#eef2ff;color:#1d0fb4;}.debt-new-status.open{background:#fee2e2;color:#b91c1c;}.debt-new-status.paid{background:#dcfce7;color:#166534;}.debt-new-status.overpaid{background:#e0f2fe;color:#075985;}.debt-new-allocation-box{border:1px solid #dbe7f5;border-radius:12px;padding:12px;margin-top:12px;background:#f8fafc;}.debt-new-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0;}.debt-new-form-grid label{display:flex;flex-direction:column;gap:4px;font-weight:800;color:#334155;}.debt-new-form-grid input,.debt-new-form-grid select{padding:8px;border:1px solid #cbd5e1;border-radius:10px;}.debt-new-order-check{width:16px;height:16px;}.debt-new-collection-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:10px;}.debt-new-collection-card{border:1px solid #dbe7f5;border-radius:12px;padding:10px;margin:8px 0;background:#fff;}.debt-new-collection-card h4{margin:0 0 6px;}.debt-new-collection-card small{display:block;color:#64748b;margin-top:2px;}.debt-new-allocation-warning{color:#b91c1c;font-weight:800;}.new-table tbody tr.active{background:#eff6ff;}.debt-new-main-header{margin-bottom:8px;}.debt-new-customer-table-wrap{overflow:auto;}.debt-new-customer-table{min-width:1040px;}.debt-new-customer-table tbody tr{cursor:pointer;}.debt-new-detail-btn{white-space:nowrap;}.debt-new-collections-summary{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px dashed #cbd5e1;border-radius:12px;padding:12px;background:#f8fafc;}.debt-new-modal{position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:24px;}.debt-new-modal[hidden]{display:none!important;}.debt-new-modal-card{width:min(1180px,96vw);max-height:90vh;background:#fff;border-radius:18px;box-shadow:0 24px 72px rgba(15,23,42,.32);display:flex;flex-direction:column;overflow:hidden;}.debt-new-modal-header{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #dbe7f5;padding:16px 18px 12px;}.debt-new-modal-titlebar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;}.debt-new-modal-titlebar h3{margin:0 0 6px;font-size:20px;}.debt-new-modal-meta{display:flex;flex-wrap:wrap;gap:8px 16px;color:#475569;font-weight:700;font-size:12px;}.debt-new-modal-close{border:0;border-radius:10px;background:#2563eb;color:#fff;font-weight:800;padding:8px 12px;box-shadow:0 8px 18px rgba(37,99,235,.25);}.debt-new-modal-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}.debt-new-modal-tab{border:1px solid #cbd5e1;background:#f8fafc;color:#334155;border-radius:10px;padding:8px 12px;font-weight:800;}.debt-new-modal-tab.active{background:#2563eb;color:#fff;border-color:#2563eb;}.debt-new-modal-body{padding:16px 18px;overflow:auto;}.debt-new-modal-footer{position:sticky;bottom:0;background:#fff;border-top:1px solid #dbe7f5;padding:10px 18px;display:flex;justify-content:flex-end;gap:10px;}.debt-new-detail-kpis{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:10px;margin-bottom:12px;}.debt-new-detail-kpi{border:1px solid #dbe7f5;border-radius:12px;padding:10px;background:#f8fafc;}.debt-new-detail-kpi span{display:block;color:#64748b;font-size:12px;font-weight:800;}.debt-new-detail-kpi b{display:block;margin-top:4px;font-size:18px;color:#0f172a;}.debt-new-order-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;}.debt-new-order-toolbar-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}.debt-new-modal-table-wrap{overflow:auto;border:1px solid #dbe7f5;border-radius:12px;}.debt-new-modal-table{min-width:860px;}.debt-new-modal-note{margin:0 0 12px;border:1px solid #bae6fd;background:#eff6ff;border-radius:12px;padding:10px 12px;color:#075985;font-weight:800;}.debt-new-movement-empty{border:1px dashed #cbd5e1;border-radius:12px;padding:16px;text-align:center;color:#64748b;font-weight:800;background:#f8fafc;}.debt-new-form-actions{position:sticky;bottom:0;background:#fff;padding-top:10px;}@media (max-width:1100px){.debt-new-filter-grid{grid-template-columns:minmax(280px,1.6fr) minmax(160px,1fr) minmax(160px,1fr) minmax(140px,.8fr);}.debt-new-load-btn,.debt-new-reset-btn{width:100%;}}@media (max-width:900px){.debt-new-filter-grid{grid-template-columns:1fr 1fr;}.debt-new-field-wide{grid-column:1 / -1;}.debt-new-filter-header{align-items:flex-start;}}@media (max-width:640px){.debt-new-filter-grid{grid-template-columns:1fr;}.debt-new-filter-header{flex-direction:column;}.debt-new-source-badge{align-self:flex-start;}}';
    document.head.appendChild(style);
  }


  function resetSelectedFilters(scope) {
    if (!scope || scope === 'search') {
      state.selectedFilters.customerCode = '';
      state.selectedFilters.orderCode = '';
    }
    if (!scope || scope === 'salesman') state.selectedFilters.salesStaffCode = '';
    if (!scope || scope === 'delivery') state.selectedFilters.deliveryStaffCode = '';
  }

  function suggestConfig(scope) {
    if (scope === 'search') return { inputId: 'debtNewSearch', boxId: 'debtNewSearchSuggestions', type: 'customerOrder' };
    if (scope === 'salesman') return { inputId: 'debtNewSalesman', boxId: 'debtNewSalesmanSuggestions', type: 'salesman' };
    return { inputId: 'debtNewDelivery', boxId: 'debtNewDeliverySuggestions', type: 'delivery' };
  }

  function closeSuggestion(scope) {
    var cfg = suggestConfig(scope);
    var box = byId(cfg.boxId);
    if (!box) return;
    box.hidden = true;
    box.innerHTML = '';
    state.suggest.active[scope] = -1;
  }

  function closeAllSuggestions() {
    ['search', 'salesman', 'delivery'].forEach(closeSuggestion);
  }

  function renderSuggestionBox(scope) {
    var cfg = suggestConfig(scope);
    var box = byId(cfg.boxId);
    if (!box) return;
    var items = state.suggest.items[scope] || [];
    if (state.suggest.loading[scope]) {
      box.hidden = false;
      box.innerHTML = '<div class="debt-new-suggest-loading">Đang tìm gợi ý...</div>';
      return;
    }
    box.hidden = false;
    if (!items.length) {
      box.innerHTML = '<div class="debt-new-suggest-empty">Không tìm thấy gợi ý phù hợp</div>';
      return;
    }
    box.innerHTML = items.map(function (item, index) {
      return '<button type="button" class="debt-new-suggest-item' + (index === state.suggest.active[scope] ? ' active' : '') + '" data-scope="' + esc(scope) + '" data-index="' + index + '"><b>' + esc(item.label || item.code || item.name || item.orderCode || '') + '</b><span>' + esc(item.subLabel || '') + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.debt-new-suggest-item'), function (button) {
      button.addEventListener('mousedown', function (event) { event.preventDefault(); });
      button.addEventListener('click', function () { chooseSuggestion(scope, Number(button.dataset.index)); });
    });
  }

  async function fetchSuggestions(scope, rawValue) {
    var value = String(rawValue || '').trim();
    var cfg = suggestConfig(scope);
    state.suggest.requestSeq[scope] += 1;
    var seq = state.suggest.requestSeq[scope];
    if (value.length < 2) {
      state.suggest.items[scope] = [];
      state.suggest.loading[scope] = false;
      closeSuggestion(scope);
      return;
    }
    state.suggest.loading[scope] = true;
    state.suggest.items[scope] = [];
    renderSuggestionBox(scope);
    try {
      var params = new URLSearchParams({ type: cfg.type, q: value, limit: '10' });
      var res = await fetch('/api/new/debt/suggestions?' + params.toString());
      var json = await res.json();
      if (seq !== state.suggest.requestSeq[scope]) return;
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được gợi ý');
      state.suggest.items[scope] = json.items || [];
      state.suggest.active[scope] = state.suggest.items[scope].length ? 0 : -1;
    } catch (err) {
      if (seq !== state.suggest.requestSeq[scope]) return;
      state.suggest.items[scope] = [];
    } finally {
      if (seq === state.suggest.requestSeq[scope]) {
        state.suggest.loading[scope] = false;
        renderSuggestionBox(scope);
      }
    }
  }

  function queueSuggestions(scope, value) {
    clearTimeout(state.suggest.timers[scope]);
    state.suggest.timers[scope] = setTimeout(function () { fetchSuggestions(scope, value); }, 320);
  }

  function chooseSuggestion(scope, index) {
    var item = (state.suggest.items[scope] || [])[index];
    var cfg = suggestConfig(scope);
    var input = byId(cfg.inputId);
    if (!item || !input) return;
    if (scope === 'search') {
      resetSelectedFilters('search');
      input.value = item.label || item.code || item.orderCode || '';
      if (item.type === 'order') state.selectedFilters.orderCode = item.orderCode || item.code || '';
      else state.selectedFilters.customerCode = item.customerCode || item.code || '';
    } else if (scope === 'salesman') {
      state.selectedFilters.salesStaffCode = item.code || '';
      input.value = item.label || [item.code, item.name].filter(Boolean).join(' - ');
    } else {
      state.selectedFilters.deliveryStaffCode = item.code || '';
      input.value = item.label || [item.code, item.name].filter(Boolean).join(' - ');
    }
    state.userTouchedFilters = true;
    closeSuggestion(scope);
  }

  function moveSuggestionActive(scope, delta) {
    var items = state.suggest.items[scope] || [];
    if (!items.length) return;
    var next = state.suggest.active[scope] + delta;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    state.suggest.active[scope] = next;
    renderSuggestionBox(scope);
  }

  function attachAutocomplete(scope) {
    var cfg = suggestConfig(scope);
    var input = byId(cfg.inputId);
    if (!input) return;
    input.addEventListener('input', function () {
      state.userTouchedFilters = true;
      resetSelectedFilters(scope);
      queueSuggestions(scope, input.value);
    });
    input.addEventListener('focus', function () {
      if (String(input.value || '').trim().length >= 2) queueSuggestions(scope, input.value);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); moveSuggestionActive(scope, 1); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); moveSuggestionActive(scope, -1); return; }
      if (event.key === 'Escape') { closeSuggestion(scope); return; }
      if (event.key === 'Enter') {
        var box = byId(cfg.boxId);
        if (box && !box.hidden && state.suggest.active[scope] >= 0) {
          event.preventDefault();
          chooseSuggestion(scope, state.suggest.active[scope]);
          return;
        }
        load();
      }
    });
  }

  function attachFilterInputs() {
    attachAutocomplete('search');
    attachAutocomplete('salesman');
    attachAutocomplete('delivery');
  }

  function filters() {
    var searchText = byId('debtNewSearch') ? byId('debtNewSearch').value.trim() : '';
    var salesmanText = byId('debtNewSalesman') ? byId('debtNewSalesman').value.trim() : '';
    var deliveryText = byId('debtNewDelivery') ? byId('debtNewDelivery').value.trim() : '';
    var result = {
      q: state.selectedFilters.customerCode || state.selectedFilters.orderCode ? '' : searchText,
      customerCode: state.selectedFilters.customerCode || '',
      orderCode: state.selectedFilters.orderCode || '',
      salesman: state.selectedFilters.salesStaffCode || salesmanText,
      salesStaffCode: state.selectedFilters.salesStaffCode || '',
      delivery: state.selectedFilters.deliveryStaffCode || deliveryText,
      deliveryStaffCode: state.selectedFilters.deliveryStaffCode || '',
      status: byId('debtNewStatus') ? byId('debtNewStatus').value : 'open'
    };
    return result;
  }

  function hasValidSearchCriteria() {
    var f = filters();
    return Boolean(f.q || f.customerCode || f.orderCode || f.salesman || f.salesStaffCode || f.delivery || f.deliveryStaffCode);
  }

  function setMessage(text, isError) {
    var message = byId('debtNewMessage');
    if (!message) return;
    message.textContent = text || '';
    message.className = 'message' + (isError ? ' error-text' : '');
  }

  function setElementVisible(selector, visible) {
    var el = selector.charAt(0) === '#' ? byId(selector.slice(1)) : document.querySelector(selector);
    if (!el) return;
    if (visible) el.classList.remove('debt-new-results-hidden');
    else el.classList.add('debt-new-results-hidden');
  }

  function setResultSectionsVisible(visible) {
    setElementVisible('#debtNewEmptyState', !visible);
    Array.prototype.forEach.call(document.querySelectorAll('.debt-new-results,.debt-new-kpis'), function (el) {
      if (visible) el.classList.remove('debt-new-results-hidden');
      else el.classList.add('debt-new-results-hidden');
    });
  }

  function renderEmptyState(message) {
    var empty = byId('debtNewEmptyState');
    if (!empty) return;
    empty.innerHTML = '<b>Chưa có dữ liệu hiển thị.</b><span>' + esc(message || 'Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải.') + '</span>';
  }

  function resetResultsState(message) {
    state.customers = [];
    state.collections = [];
    state.selectedIndex = -1;
    state.loaded = false;
    state.hasSearched = false;
    state.selectedOrderKeys = {};
    applySummary({});
    renderEmptyState(message);
    setResultSectionsVisible(false);
    renderCustomers();
    renderCollections();
  }

  function resetFiltersToEmptyState() {
    ['debtNewSearch', 'debtNewSalesman', 'debtNewDelivery'].forEach(function (id) { var el = byId(id); if (el) el.value = ''; });
    var status = byId('debtNewStatus'); if (status) status.value = 'open';
    resetSelectedFilters();
    closeAllSuggestions();
    state.userTouchedFilters = false;
    resetResultsState('Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải.');
    setMessage('');
  }

  function applySummary(summary) {
    summary = summary || {};
    var pairs = {
      debtNewTotalDebt: money(summary.totalDebt),
      debtNewCustomerCount: summary.customerCount || state.customers.length || 0,
      debtNewOrderCount: summary.debtOrderCount || summary.orderCount || 0,
      debtNewCreditBalance: money(summary.creditBalanceAmount),
      debtNewDebit: money(summary.totalDebit),
      debtNewCredit: money(summary.totalCredit)
    };
    Object.keys(pairs).forEach(function (id) { var el = byId(id); if (el) el.textContent = pairs[id]; });
  }

  function selectedCustomer() {
    return state.selectedIndex >= 0 ? state.customers[state.selectedIndex] : null;
  }

  function renderCustomers() {
    var tbody = byId('debtNewCustomerTable');
    if (!tbody) return;
    if (!state.hasSearched) {
      tbody.innerHTML = '<tr><td colspan="8">Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải.</td></tr>';
      renderDebtCustomerModal();
      return;
    }
    if (!state.customers.length) {
      tbody.innerHTML = '<tr><td colspan="8">Không tìm thấy dữ liệu phù hợp với điều kiện tìm kiếm.</td></tr>';
      renderDebtCustomerModal();
      return;
    }
    tbody.innerHTML = state.customers.map(function (row, index) {
      var status = String(row.status || 'open').toLowerCase();
      return '<tr data-index="' + index + '" class="' + (index === state.selectedIndex ? 'active' : '') + '">' +
        '<td><b>' + esc(row.customerCode || '') + '</b></td>' +
        '<td><b>' + esc(row.customerName || '') + '</b>' + (row.phone ? '<br><small>SĐT: ' + esc(row.phone) + '</small>' : '') + '</td>' +
        '<td><small>' + esc([row.salesStaffCode || row.salesmanCode, row.salesStaffName || row.salesmanName].filter(Boolean).join(' - ') || '-') + '</small></td>' +
        '<td><small>' + esc([row.deliveryStaffCode, row.deliveryStaffName].filter(Boolean).join(' - ') || '-') + '</small></td>' +
        '<td class="new-money">' + esc(row.orderCount || 0) + '</td>' +
        '<td class="new-money ' + (num(row.debt) > 0 ? 'new-debt-positive' : 'new-credit') + '">' + money(row.debt) + '</td>' +
        '<td><span class="debt-new-status ' + esc(status) + '">' + esc(statusLabel(status)) + '</span></td>' +
        '<td><button type="button" class="primary-action debt-new-detail-btn" data-index="' + index + '">Chi tiết</button></td>' +
      '</tr>';
    }).join('');
    Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-index]'), function (tr) {
      tr.addEventListener('click', function (event) {
        if (event.target && event.target.closest && event.target.closest('button')) return;
        openDebtCustomerModal(Number(tr.dataset.index));
      });
    });
    Array.prototype.forEach.call(tbody.querySelectorAll('.debt-new-detail-btn'), function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        openDebtCustomerModal(Number(button.dataset.index));
      });
    });
    renderDebtCustomerModal();
  }

  function openDebtCustomerModal(index) {
    if (index < 0 || index >= state.customers.length) return;
    state.selectedIndex = index;
    state.selectedOrderKeys = {};
    state.modalOpen = true;
    state.modalTab = 'overview';
    renderCustomers();
    renderDebtCustomerModal();
    loadCollections();
  }

  function closeDebtCustomerModal() {
    state.modalOpen = false;
    state.modalTab = 'overview';
    renderDebtCustomerModal();
  }

  function setDebtCustomerModalTab(tab) {
    state.modalTab = tab || 'overview';
    renderDebtCustomerModal();
  }

  function customerSummaryValue(customer, key, fallback) {
    return num(customer && (customer[key] ?? fallback ?? 0));
  }

  function selectedDebtOrderTotal(customer) {
    return selectedDebtOrders(customer).reduce(function (sum, order) { return sum + openDebt(order); }, 0);
  }

  function renderDebtCustomerModal() {
    var modal = byId('debtNewCustomerModal');
    if (!modal) return;
    if (!state.modalOpen) {
      modal.hidden = true;
      modal.innerHTML = '';
      return;
    }
    var customer = selectedCustomer();
    if (!customer) {
      modal.hidden = true;
      modal.innerHTML = '';
      return;
    }
    modal.hidden = false;
    var tabs = [
      ['overview', 'Tổng quan'],
      ['orders', 'Đơn nợ'],
      ['collection', 'Lập phiếu thu'],
      ['history', 'Lịch sử công nợ'],
      ['pending', 'Phiếu thu chờ xác nhận']
    ];
    modal.innerHTML = '<div class="debt-new-modal-card" role="dialog" aria-modal="true" aria-label="Chi tiết công nợ khách hàng">' +
      '<div class="debt-new-modal-header">' +
        '<div class="debt-new-modal-titlebar"><div><h3>Công nợ khách hàng - ' + esc((customer.customerCode || '') + ' / ' + (customer.customerName || '')) + '</h3>' +
          '<div class="debt-new-modal-meta"><span>NVBH: ' + esc([customer.salesStaffCode || customer.salesmanCode, customer.salesStaffName || customer.salesmanName].filter(Boolean).join(' - ') || '-') + '</span><span>NVGH: ' + esc([customer.deliveryStaffCode, customer.deliveryStaffName].filter(Boolean).join(' - ') || '-') + '</span><span>Tổng nợ: ' + money(customer.debt) + '</span><span>Số đơn nợ: ' + esc(customer.orderCount || 0) + '</span></div></div>' +
          '<button type="button" class="debt-new-modal-close" aria-label="Đóng popup công nợ khách hàng">Đóng</button></div>' +
        '<div class="debt-new-modal-tabs">' + tabs.map(function (tab) { return '<button type="button" class="debt-new-modal-tab' + (state.modalTab === tab[0] ? ' active' : '') + '" data-tab="' + esc(tab[0]) + '">' + esc(tab[1]) + '</button>'; }).join('') + '</div>' +
      '</div>' +
      '<div class="debt-new-modal-body">' + renderDebtCustomerModalBody(customer) + '</div>' +
      '<div class="debt-new-modal-footer"><button type="button" class="secondary debt-new-modal-close-bottom">Đóng</button></div>' +
    '</div>';
    modal.addEventListener('click', function (event) { if (event.target === modal) closeDebtCustomerModal(); }, { once: true });
    var card = modal.querySelector('.debt-new-modal-card');
    if (card) card.addEventListener('click', function (event) { event.stopPropagation(); });
    Array.prototype.forEach.call(modal.querySelectorAll('.debt-new-modal-close,.debt-new-modal-close-bottom'), function (button) {
      button.addEventListener('click', closeDebtCustomerModal);
    });
    Array.prototype.forEach.call(modal.querySelectorAll('.debt-new-modal-tab'), function (button) {
      button.addEventListener('click', function () { setDebtCustomerModalTab(button.dataset.tab); });
    });
    bindDebtCustomerModalBody(customer);
  }

  function renderDebtCustomerModalBody(customer) {
    if (state.modalTab === 'orders') return renderDebtOrdersTab(customer);
    if (state.modalTab === 'collection') return renderDebtCollectionTab(customer);
    if (state.modalTab === 'history') return renderDebtHistoryTab(customer);
    if (state.modalTab === 'pending') return renderDebtPendingCollectionsTab(customer);
    return renderDebtOverviewTab(customer);
  }

  function renderDebtOverviewTab(customer) {
    return '<div class="debt-new-modal-note">Nguồn đọc: AR-DEBT-* read model. Phiếu thu <b>submitted</b> chưa làm giảm nợ; kế toán confirm mới sinh <b>AR-DEBT-PAYMENT</b> và fund ledger.</div>' +
      '<div class="debt-new-detail-kpis">' +
        '<article class="debt-new-detail-kpi"><span>Tổng nợ</span><b>' + money(customer.debt) + '</b></article>' +
        '<article class="debt-new-detail-kpi"><span>Số đơn nợ</span><b>' + esc(customer.orderCount || 0) + '</b></article>' +
        '<article class="debt-new-detail-kpi"><span>Debit</span><b>' + money(customerSummaryValue(customer, 'debit')) + '</b></article>' +
        '<article class="debt-new-detail-kpi"><span>Credit</span><b>' + money(customerSummaryValue(customer, 'credit')) + '</b></article>' +
        '<article class="debt-new-detail-kpi"><span>Dư có</span><b>' + money(customer.debt < 0 ? Math.abs(num(customer.debt)) : 0) + '</b></article>' +
        '<article class="debt-new-detail-kpi"><span>Trạng thái</span><b>' + esc(statusLabel(customer.status)) + '</b></article>' +
      '</div>' + renderDebtOrdersTab(customer, true);
  }

  function renderDebtOrdersTab(customer, readonly) {
    var orders = Array.isArray(customer && customer.orders) ? customer.orders : [];
    var selected = selectedDebtOrders(customer);
    var selectedTotal = selected.reduce(function (sum, order) { return sum + openDebt(order); }, 0);
    var rows = orders.map(function (order, index) {
      var key = orderKey(order) || String(index);
      var checked = state.selectedOrderKeys[key] ? ' checked' : '';
      return '<tr>' +
        '<td><input class="debt-new-order-check" type="checkbox" data-order-index="' + index + '"' + checked + (readonly ? '' : '') + '></td>' +
        '<td><b>' + esc(order.orderCode || order.orderId) + '</b></td>' +
        '<td>' + esc(order.orderDate || order.lastDebtDate || '') + '</td>' +
        '<td class="new-money">' + money(order.debit) + '</td>' +
        '<td class="new-money new-credit">' + money(order.credit) + '</td>' +
        '<td class="new-money ' + (openDebt(order) > 0 ? 'new-debt-positive' : 'new-credit') + '">' + money(order.debt) + '</td>' +
        '<td><span class="debt-new-status ' + esc(order.status || 'open') + '">' + esc(statusLabel(order.status)) + '</span></td>' +
      '</tr>';
    }).join('');
    return '<div class="debt-new-order-toolbar"><div><b>Đơn nợ</b><div class="muted">Đã chọn ' + selected.length + ' đơn · Tổng nợ chọn: <b>' + money(selectedTotal) + '</b></div></div>' +
      '<div class="debt-new-order-toolbar-actions"><button id="debtNewSelectAllDebtOrders" type="button" class="secondary">Chọn tất cả đơn nợ</button><button id="debtNewClearDebtOrders" type="button" class="secondary">Bỏ chọn</button><button type="button" class="primary-action debt-new-go-collection">Lập phiếu thu</button></div></div>' +
      '<div class="debt-new-modal-table-wrap"><table class="new-table debt-new-modal-table"><thead><tr><th>Chọn thu</th><th>Mã đơn</th><th>Ngày đơn</th><th>Phải thu / Debit</th><th>Đã thu / Credit</th><th>Còn nợ</th><th>Trạng thái</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7">Khách này không có đơn trong read model New.</td></tr>') +
      '</tbody></table></div>';
  }

  function renderDebtCollectionTab(customer) {
    return '<div class="debt-new-modal-note">Chỉ lập phiếu thu cho các đơn được tick ở tab <b>Đơn nợ</b>. Phiếu thu tạo ra trạng thái <b>submitted</b> và chưa làm giảm công nợ.</div><div id="debtNewCollectionBox" class="debt-new-allocation-box"></div>';
  }

  function renderDebtHistoryTab(customer) {
    var orders = Array.isArray(customer && customer.orders) ? customer.orders : [];
    var rows = [];
    orders.forEach(function (order) {
      var categories = order.categories || {};
      Object.keys(categories).forEach(function (category) {
        rows.push({ date: order.lastDebtDate || order.orderDate || '', category: category, orderCode: order.orderCode || order.orderId || '', debit: category.indexOf('PAYMENT') >= 0 ? 0 : categories[category], credit: category.indexOf('PAYMENT') >= 0 ? Math.abs(categories[category]) : 0, note: 'Từ AR-DEBT read model' });
      });
    });
    if (!rows.length) return '<div class="debt-new-movement-empty">Chưa có lịch sử công nợ chi tiết trong dữ liệu trả về.</div>';
    return '<div class="debt-new-modal-table-wrap"><table class="new-table debt-new-modal-table"><thead><tr><th>Ngày</th><th>Loại ledger</th><th>Mã đơn</th><th>Debit</th><th>Credit</th><th>Ghi chú / source</th></tr></thead><tbody>' + rows.map(function (row) {
      return '<tr><td>' + esc(row.date) + '</td><td>' + esc(row.category) + '</td><td>' + esc(row.orderCode) + '</td><td class="new-money">' + money(row.debit) + '</td><td class="new-money new-credit">' + money(row.credit) + '</td><td>' + esc(row.note) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function renderDebtPendingCollectionsTab(customer) {
    return '<div class="debt-new-modal-note">Phiếu thu liên quan khách hiện tại. Confirm mới sinh AR-DEBT-PAYMENT và fund ledger.</div>' + collectionCardsHtml(state.collections || [], true);
  }

  function bindDebtCustomerModalBody(customer) {
    var modal = byId('debtNewCustomerModal');
    if (!modal || !state.modalOpen) return;
    Array.prototype.forEach.call(modal.querySelectorAll('.debt-new-order-check'), function (input) {
      input.addEventListener('change', function () {
        var orders = Array.isArray(customer && customer.orders) ? customer.orders : [];
        var order = orders[Number(input.dataset.orderIndex)];
        if (!order) return;
        state.selectedOrderKeys[orderKey(order)] = input.checked;
        renderDebtCustomerModal();
      });
    });
    var selectAll = byId('debtNewSelectAllDebtOrders');
    if (selectAll) selectAll.addEventListener('click', function () {
      (customer.orders || []).forEach(function (order) { if (openDebt(order) > 0) state.selectedOrderKeys[orderKey(order)] = true; });
      renderDebtCustomerModal();
    });
    var clear = byId('debtNewClearDebtOrders');
    if (clear) clear.addEventListener('click', function () { state.selectedOrderKeys = {}; renderDebtCustomerModal(); });
    Array.prototype.forEach.call(modal.querySelectorAll('.debt-new-go-collection'), function (button) {
      button.addEventListener('click', function () { setDebtCustomerModalTab('collection'); });
    });
    if (state.modalTab === 'collection') renderCollectionForm(customer);
    Array.prototype.forEach.call(modal.querySelectorAll('.debtNewConfirmCollection'), function (btn) {
      btn.addEventListener('click', function () { confirmCollection(btn.dataset.id, btn.dataset.amount); });
    });
    Array.prototype.forEach.call(modal.querySelectorAll('.debtNewRejectCollection'), function (btn) {
      btn.addEventListener('click', function () { rejectCollection(btn.dataset.id); });
    });
  }

  function selectedDebtOrders(customer) {
    var orders = Array.isArray(customer && customer.orders) ? customer.orders : [];
    return orders.filter(function (order) { return state.selectedOrderKeys[orderKey(order)] && openDebt(order) > 0; });
  }

  function allocateAmount(amount, orders) {
    var remaining = Math.max(0, num(amount));
    return (orders || []).map(function (order) {
      var debt = openDebt(order);
      var allocated = Math.min(debt, remaining);
      remaining -= allocated;
      return { order: order, allocatedAmount: allocated, beforeDebt: debt };
    }).filter(function (row) { return row.allocatedAmount > 0; });
  }

  function renderAllocationPreview(customer) {
    var box = byId('debtNewAllocationPreview');
    if (!box) return;
    var amountEl = byId('debtNewCollectionAmount');
    var amount = num(amountEl ? amountEl.value : 0);
    var selected = selectedDebtOrders(customer);
    var maxAmount = selected.reduce(function (sum, order) { return sum + openDebt(order); }, 0);
    var allocations = allocateAmount(amount, selected);
    var allocatedTotal = allocations.reduce(function (sum, row) { return sum + num(row.allocatedAmount); }, 0);
    var rows = allocations.map(function (row) {
      return '<tr><td>' + esc(row.order.orderCode || row.order.orderId) + '</td><td class="new-money">' + money(row.beforeDebt) + '</td><td class="new-money">' + money(row.allocatedAmount) + '</td></tr>';
    }).join('');
    var warning = amount > maxAmount ? '<div class="debt-new-allocation-warning">Số tiền thu vượt tổng nợ đơn đã chọn.</div>' : '';
    box.innerHTML = warning + '<table class="new-table"><thead><tr><th>Đơn</th><th>Còn nợ</th><th>Phân bổ</th></tr></thead><tbody>' + (rows || '<tr><td colspan="3">Chưa có phân bổ.</td></tr>') + '</tbody></table>' +
      '<div class="new-safe-note">Tổng chọn: <b>' + money(maxAmount) + '</b> · Tổng phân bổ: <b>' + money(allocatedTotal) + '</b></div>';
  }

  function renderCollectionForm(customer) {
    var box = byId('debtNewCollectionBox');
    if (!box || !customer) return;
    var selected = selectedDebtOrders(customer);
    if (!selected.length) {
      box.innerHTML = '<b>Lập phiếu thu công nợ</b><div class="empty-state">Tick các đơn còn nợ để lập phiếu thu chờ xác nhận.</div>';
      return;
    }
    var maxAmount = selected.reduce(function (sum, order) { return sum + openDebt(order); }, 0);
    var currentAmount = byId('debtNewCollectionAmount') ? byId('debtNewCollectionAmount').value : maxAmount;
    box.innerHTML = '<b>Lập phiếu thu công nợ</b>' +
      '<div class="debt-new-form-grid">' +
        '<label>Số tiền thu<input id="debtNewCollectionAmount" inputmode="numeric" value="' + esc(currentAmount || maxAmount) + '"></label>' +
        '<label>Phương thức<select id="debtNewCollectionMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>' +
        '<label class="wide">Ghi chú<input id="debtNewCollectionNote" placeholder="Ghi chú phiếu thu"></label>' +
      '</div>' +
      '<div id="debtNewAllocationPreview"></div>' +
      '<div class="debt-new-collection-actions"><button id="debtNewSubmitCollection" type="button" class="primary-action">Tạo phiếu thu chờ xác nhận</button></div>';
    var amountEl = byId('debtNewCollectionAmount');
    if (amountEl) amountEl.addEventListener('input', function () { renderAllocationPreview(customer); });
    var submit = byId('debtNewSubmitCollection');
    if (submit) submit.addEventListener('click', function () { submitCollection(customer); });
    renderAllocationPreview(customer);
  }

  function buildCollectionPayload(customer) {
    var amount = num(byId('debtNewCollectionAmount') ? byId('debtNewCollectionAmount').value : 0);
    var method = byId('debtNewCollectionMethod') ? byId('debtNewCollectionMethod').value : 'cash';
    var note = byId('debtNewCollectionNote') ? byId('debtNewCollectionNote').value.trim() : '';
    var selected = selectedDebtOrders(customer);
    var maxAmount = selected.reduce(function (sum, order) { return sum + openDebt(order); }, 0);
    if (amount <= 0) throw new Error('Số tiền thu phải lớn hơn 0.');
    if (!selected.length) throw new Error('Cần chọn ít nhất một đơn nợ.');
    if (amount > maxAmount) throw new Error('Số tiền thu vượt tổng nợ đơn đã chọn.');
    var allocations = allocateAmount(amount, selected).map(function (row) {
      return {
        salesOrderId: row.order.orderId || row.order.salesOrderId || '',
        salesOrderCode: row.order.orderCode || row.order.salesOrderCode || '',
        orderType: row.order.orderType || 'sales_order',
        allocatedAmount: row.allocatedAmount
      };
    });
    return {
      customerCode: customer.customerCode,
      customerName: customer.customerName,
      amount: amount,
      paymentMethod: method,
      note: note,
      idempotencyKey: 'DEBT-NEW-WEB:' + (customer.customerCode || customer.customerName || 'KH') + ':' + Date.now(),
      allocations: allocations
    };
  }

  async function submitCollection(customer) {
    try {
      var payload = buildCollectionPayload(customer);
      setMessage('Đang tạo phiếu thu chờ xác nhận...');
      var res = await fetch('/api/new/debt/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tạo được phiếu thu');
      state.selectedOrderKeys = {};
      setMessage(json.message || 'Đã tạo phiếu thu nợ, chờ kế toán xác nhận.');
      await loadCollections();
    } catch (err) {
      setMessage(err.message || 'Không tạo được phiếu thu công nợ', true);
    }
  }

  function collectionCardsHtml(collections, fullActions) {
    var rows = Array.isArray(collections) ? collections : [];
    if (!rows.length) return '<div class="empty-state">Chưa có phiếu thu chờ xác nhận theo phạm vi hiện tại.</div>';
    return rows.map(function (row) {
      var id = row.id || row.code || '';
      var status = String(row.status || '').toLowerCase();
      return '<div class="debt-new-collection-card">' +
        '<h4>' + esc(row.code || row.id) + ' · <span class="debt-new-status ' + esc(status) + '">' + esc(statusLabel(status)) + '</span></h4>' +
        '<small>Khách: ' + esc((row.customerCode || '') + ' - ' + (row.customerName || '')) + '</small>' +
        '<small>Số tiền: <b>' + money(row.amount) + '</b> · ' + esc(row.paymentMethod || '') + ' · Người thu: ' + esc([row.collectorCode, row.collectorName].filter(Boolean).join(' - ')) + '</small>' +
        '<small>Phân bổ: ' + esc((row.allocations || []).map(function (a) { return (a.salesOrderCode || a.orderCode || '') + ':' + money(a.allocatedAmount || a.amount); }).join(' · ')) + '</small>' +
        (fullActions && status === 'submitted' ? '<div class="debt-new-collection-actions"><button type="button" class="primary-action debtNewConfirmCollection" data-id="' + esc(id) + '" data-amount="' + esc(row.amount || 0) + '">Xác nhận</button><button type="button" class="secondary debtNewRejectCollection" data-id="' + esc(id) + '">Từ chối</button></div>' : '') +
      '</div>';
    }).join('');
  }

  function renderCollections() {
    var box = byId('debtNewCollectionsList');
    if (!box) return;
    if (!state.hasSearched) { box.innerHTML = '<div class="empty-state">Vui lòng tìm khách trước khi xem phiếu thu liên quan.</div>'; return; }
    if (!state.collections.length) { box.innerHTML = '<div class="empty-state">Chưa có phiếu thu chờ xác nhận theo phạm vi hiện tại.</div>'; return; }
    box.innerHTML = '<div class="debt-new-collections-summary"><div><b>' + state.collections.length + ' phiếu thu chờ xác nhận</b><br><span class="muted">Mở popup từng khách để xem phân bổ, xác nhận hoặc từ chối.</span></div><button type="button" class="secondary" id="debtNewOpenFirstPendingCustomer">Xem danh sách</button></div>';
    var openFirst = byId('debtNewOpenFirstPendingCustomer');
    if (openFirst) openFirst.addEventListener('click', function () {
      if (state.selectedIndex < 0 && state.customers.length) state.selectedIndex = 0;
      if (state.selectedIndex >= 0) {
        state.modalOpen = true;
        state.modalTab = 'pending';
        renderCustomers();
        renderDebtCustomerModal();
      }
    });
    if (state.modalOpen) renderDebtCustomerModal();
  }

  async function loadCollections() {
    if (!state.hasSearched) { renderCollections(); return; }
    try {
      var customer = selectedCustomer();
      var params = new URLSearchParams({ status: 'submitted', limit: '50' });
      if (customer && customer.customerCode) params.set('customerCode', customer.customerCode);
      var res = await fetch('/api/new/debt/collections?' + params.toString());
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được phiếu thu');
      state.collections = json.collections || json.items || [];
      renderCollections();
    } catch (err) {
      state.collections = [];
      renderCollections();
      setMessage(err.message || 'Không tải được phiếu thu công nợ', true);
    }
  }

  async function confirmCollection(id, amount) {
    var actual = window.prompt('Nhập số tiền thực nhận để xác nhận phiếu thu:', String(num(amount || 0)));
    if (actual == null) return;
    try {
      var res = await fetch('/api/new/debt/collections/' + encodeURIComponent(id) + '/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualReceivedAmount: num(actual) })
      });
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không xác nhận được phiếu thu');
      setMessage(json.message || 'Đã xác nhận phiếu thu.');
      await loadCollections();
    } catch (err) {
      setMessage(err.message || 'Không xác nhận được phiếu thu', true);
    }
  }

  async function rejectCollection(id) {
    var reason = window.prompt('Nhập lý do từ chối phiếu thu:');
    if (reason == null) return;
    if (!String(reason).trim()) { setMessage('Vui lòng nhập lý do từ chối.', true); return; }
    try {
      var res = await fetch('/api/new/debt/collections/' + encodeURIComponent(id) + '/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason })
      });
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không từ chối được phiếu thu');
      setMessage(json.message || 'Đã từ chối phiếu thu. Công nợ không đổi.');
      await loadCollections();
    } catch (err) {
      setMessage(err.message || 'Không từ chối được phiếu thu', true);
    }
  }

  async function load() {
    ensureRoot();
    if (!hasValidSearchCriteria()) {
      resetResultsState('Vui lòng nhập ít nhất một điều kiện tìm kiếm.');
      setMessage('Vui lòng nhập ít nhất một điều kiện tìm kiếm.', true);
      return;
    }
    setMessage('Đang tải Công nợ (New)...');
    try {
      var params = new URLSearchParams(filters());
      var res = await fetch('/api/new/debt/customers?' + params.toString());
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được dữ liệu');
      var data = json.data || json;
      state.customers = data.customers || json.customers || [];
      state.selectedIndex = -1;
      state.selectedOrderKeys = {};
      state.modalOpen = false;
      state.loaded = true;
      state.hasSearched = true;
      setResultSectionsVisible(true);
      applySummary(data.summary || json.summary || {});
      renderCustomers();
      renderEmptyState(state.customers.length ? '' : 'Không tìm thấy dữ liệu phù hợp với điều kiện tìm kiếm.');
      await loadCollections();
      setMessage('Đã tải ' + state.customers.length + ' khách từ read model New.');
    } catch (err) {
      state.customers = [];
      state.collections = [];
      state.hasSearched = true;
      setResultSectionsVisible(true);
      applySummary({});
      renderCustomers();
      renderCollections();
      setMessage(err.message || 'Không tải được Công nợ (New)', true);
    }
  }

  function initWhenTabActive(tabId) {
    if (tabId !== 'debtNewTab') return;
    ensureRoot();
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureRoot();
    Array.prototype.forEach.call(document.querySelectorAll('.tab-button[data-tab="debtNewTab"]'), function (button) {
      button.addEventListener('click', function () { initWhenTabActive('debtNewTab'); });
    });
  });

  window.loadDebtNew = load;
}());
