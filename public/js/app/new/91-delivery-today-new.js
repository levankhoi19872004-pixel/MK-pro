(function () {
  'use strict';

  var rootId = 'deliveryTodayNewRoot';
  var state = { rows: [], selectedIndex: -1, loaded: false, hasSearched: false, userTouchedFilters: false, deliveryDateTouched: false, versionCache: {}, correctionReturnItems: [], adjustmentRow: null, activeTab: 'overview', selectedSalesmanKeys: {}, salesmanGroups: [], selectedOrderIds: new Set(), closeoutBusy: false };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function num(value) { var n = Number(String(value || 0).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; }
  function money(value) { return num(value).toLocaleString('vi-VN'); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function isConfirmed(row) { return row && (row.accountingConfirmed || row.deliveryCloseoutStatus === 'closed' || row.closeoutStatus === 'accounting_confirmed' || row.closeoutStatus === 'corrected_confirmed'); }
  function statusLabel(row) {
    if (row && (row.deliveryCloseoutStatus === 'closed' || row.closeoutStatus === 'accounting_confirmed' || row.accountingConfirmed)) return 'Đã chốt sổ';
    var status = String((row && (row.closeoutStatus || row.status)) || 'pending').toLowerCase();
    if (status === 'pending' || status === 'draft') return 'Chưa chốt';
    if (status === 'delivered') return 'Đã giao';
    return status;
  }

  function ensureRoot() {
    var root = byId(rootId);
    if (!root) return null;
    if (root.dataset.phase99UiReady === '1') return root;
    root.dataset.phase99UiReady = '1';
    root.innerHTML = '' +
      '<section class="card delivery-v46-header delivery-new-header">' +
        '<div>' +
          '<h2>Đơn giao hôm nay (New)</h2>' +
          '<p class="muted">Luồng chuẩn: <b>Giao hàng → Thu tiền → Chốt kế toán</b>. Đơn đã xác nhận chỉ điều chỉnh bằng phiên bản mới, không sửa ngược bản cũ.</p>' +
        '</div>' +
        '<div class="delivery-v46-filters">' +
          '<label>Ngày giao<input id="deliveryTodayNewDate" type="date"></label>' +
          '<label class="delivery-v46-filter-suggest">NVGH<input id="deliveryTodayNewDelivery" autocomplete="off" placeholder="Mã/tên NVGH"><div id="deliveryTodayNewDeliverySuggestions" class="delivery-v46-suggest-box"></div></label>' +
          '<label class="delivery-v46-filter-suggest">NVBH<input id="deliveryTodayNewSalesman" autocomplete="off" placeholder="Mã/tên NVBH"><div id="deliveryTodayNewSalesmanSuggestions" class="delivery-v46-suggest-box"></div></label>' +
          '<label class="delivery-v46-filter-suggest">Tìm kiếm<input id="deliveryTodayNewSearch" autocomplete="off" placeholder="Mã đơn / khách hàng"><div id="deliveryTodayNewSearchSuggestions" class="delivery-v46-suggest-box"></div></label>' +
          '<button id="deliveryTodayNewLoad" type="button">Tải đơn</button>' +
          '<button id="deliveryTodayNewReset" type="button" class="secondary">Xóa lọc</button>' +
        '</div>' +
      '</section>' +
      '<section id="deliveryTodayNewEmptyState" class="card delivery-new-empty-state"><b>Chưa có dữ liệu hiển thị.</b><span>Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải đơn.</span></section>' +
      '<section class="delivery-v46-kpis delivery-new-kpis" aria-label="KPI Đơn giao hôm nay New">' +
        '<div class="delivery-v46-kpi kpi-pt"><span>Phải thu</span><b id="deliveryTodayNewOriginal">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-tm"><span>Tiền mặt</span><b id="deliveryTodayNewCash">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-ck"><span>Chuyển khoản</span><b id="deliveryTodayNewBank">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-th"><span>Trả thưởng</span><b id="deliveryTodayNewReward">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-ht"><span>Hàng trả</span><b id="deliveryTodayNewReturned">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-cn"><span>Còn nợ</span><b id="deliveryTodayNewDebt">0</b></div>' +
      '</section>' +
      '<section id="deliveryTodayNewSalesmanPanel" class="card delivery-new-salesman-panel">' +
        '<div class="delivery-new-salesman-empty">Tải đơn để xem nhóm NVBH thuộc NVGH.</div>' +
      '</section>' +
      '<main class="delivery-new-main-list">' +
        '<section class="card delivery-v46-list-panel delivery-new-list-panel-full">' +
          '<div class="delivery-v46-panel-title delivery-v46-panel-title-with-actions delivery-new-orders-toolbar"><h3>Danh sách đơn</h3><div class="delivery-v46-list-actions delivery-new-closeout-toolbar"><span id="deliveryTodayNewOrderCount">0 đơn</span><span id="deliveryTodayNewSelectionCount" class="delivery-new-selection-count">0 đơn được chọn</span><button id="deliveryTodayNewSelectAllOrders" type="button" class="secondary">Chọn tất cả</button><button id="deliveryTodayNewClearOrders" type="button" class="secondary">Bỏ chọn</button><button id="deliveryTodayNewCloseout" type="button" class="primary-action delivery-new-closeout-btn" disabled>Chốt sổ giao hàng</button></div></div>' +
          '<div class="delivery-new-orders-table">' +
            '<div class="delivery-new-orders-header delivery-new-order-grid" role="row">' +
              '<div class="delivery-new-order-cell delivery-new-order-checkbox-cell"><input id="deliveryTodayNewHeaderSelectAllOrders" type="checkbox" aria-label="Chọn tất cả đơn có thể chốt"></div>' +
              '<div class="delivery-new-order-cell delivery-new-order-customer-cell">Đơn / Khách hàng</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell">PT</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell">TM</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell">CK</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell">TH</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell delivery-new-return">HT</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell delivery-new-debt">CN</div>' +
              '<div class="delivery-new-order-cell delivery-new-status-cell">Trạng thái</div>' +
              '<div class="delivery-new-order-cell delivery-new-action-cell">Thao tác</div>' +
            '</div>' +
            '<div id="deliveryTodayNewTable" class="delivery-v46-list delivery-new-orders-body"><div class="empty-state">Chưa tải đơn.</div></div>' +
          '</div>' +
        '</section>' +
      '</main>' +
      '<p id="deliveryTodayNewMessage" class="message"></p>' +
      '<section id="deliveryTodayNewAdjustmentModal" class="delivery-new-modal-backdrop" hidden></section>' +
      '<section id="deliveryTodayNewCloseoutModal" class="delivery-new-modal-backdrop" hidden></section>';

    var dateInput = byId('deliveryTodayNewDate');
    if (dateInput && !dateInput.value) dateInput.value = today();
    if (dateInput) {
      dateInput.addEventListener('change', function () {
        state.deliveryDateTouched = true;
        state.userTouchedFilters = true;
      });
    }
    var loadButton = byId('deliveryTodayNewLoad');
    var resetButton = byId('deliveryTodayNewReset');
    if (loadButton) loadButton.addEventListener('click', load);
    if (resetButton) resetButton.addEventListener('click', resetFiltersToEmptyState);
    var closeoutButton = byId('deliveryTodayNewCloseout');
    if (closeoutButton) closeoutButton.addEventListener('click', openCloseoutModal);
    var selectAllOrdersButton = byId('deliveryTodayNewSelectAllOrders');
    var clearOrdersButton = byId('deliveryTodayNewClearOrders');
    if (selectAllOrdersButton) selectAllOrdersButton.addEventListener('click', selectAllVisibleOrders);
    if (clearOrdersButton) clearOrdersButton.addEventListener('click', clearSelectedOrders);
    var headerSelectAllOrders = byId('deliveryTodayNewHeaderSelectAllOrders');
    if (headerSelectAllOrders) {
      headerSelectAllOrders.addEventListener('change', function () {
        if (headerSelectAllOrders.checked) selectAllVisibleOrders();
        else clearSelectedOrders();
      });
    }
    ['deliveryTodayNewSearch', 'deliveryTodayNewDelivery', 'deliveryTodayNewSalesman'].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.addEventListener('input', function () { state.userTouchedFilters = true; });
        el.addEventListener('change', function () { state.userTouchedFilters = true; });
        el.addEventListener('keydown', function (event) { if (event.key === 'Enter') load(); });
      }
    });
    ensureScopedStyle();
    bindFilterAutocomplete();
    resetResultsState('Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải đơn.');
    return root;
  }

  function ensureScopedStyle() {
    if (document.getElementById('deliveryTodayNewScopedStyle')) return;
    var style = document.createElement('style');
    style.id = 'deliveryTodayNewScopedStyle';
    style.textContent = '' +
      '.delivery-new-main-list{display:block;}.delivery-new-list-panel-full{width:100%;}.delivery-new-empty-state{margin:12px 0;padding:20px;text-align:center;border:1px dashed #cbd5e1;background:#f8fafc;color:#334155;}.delivery-new-empty-state b{display:block;font-size:16px;margin-bottom:6px;color:#0f172a;}.delivery-new-empty-state span{display:block;color:#64748b;font-weight:700;}.delivery-new-results-hidden{display:none!important;}.delivery-new-salesman-panel{margin:12px 0;padding:0;overflow:hidden;}.delivery-new-salesman-empty{padding:14px;color:#64748b;text-align:center;border:1px dashed #cbd5e1;border-radius:12px;}.delivery-new-salesman-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-bottom:1px solid #dbe7f5;}.delivery-new-salesman-header h3{margin:0;font-size:15px;}.delivery-new-salesman-header small{display:inline-block;margin-left:8px;color:#475569;}.delivery-new-salesman-actions{display:flex;gap:8px;flex-wrap:wrap;}.delivery-new-salesman-row{display:grid;grid-template-columns:minmax(240px,1.4fr) 70px repeat(6,1fr);gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid #dbe7f5;}.delivery-new-salesman-row:last-child{border-bottom:0;}.delivery-new-salesman-check{display:flex;align-items:center;gap:8px;font-weight:800;}.delivery-new-salesman-check input{width:16px;height:16px;}.delivery-new-salesman-row .muted{font-size:11px;color:#64748b;}.delivery-new-salesman-money{text-align:right;font-variant-numeric:tabular-nums;font-weight:800;}.delivery-new-salesman-compact{margin-top:6px;color:#334155;font-size:12px;font-weight:800;line-height:1.5;}.delivery-new-salesman-compact b{font-variant-numeric:tabular-nums;}.delivery-new-orders-toolbar{align-items:center;gap:12px;}.delivery-new-selection-count{font-weight:800;color:#475569;white-space:nowrap;}.delivery-new-closeout-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}.delivery-new-closeout-toolbar .secondary{padding:7px 10px;border-radius:10px;}.delivery-new-closeout-btn[disabled]{opacity:.55;cursor:not-allowed;}.delivery-new-closeout-warning{padding:10px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-weight:800;margin:10px 0;}.delivery-new-orders-table{overflow-x:auto;border-top:1px solid #dbe7f5;}.delivery-new-order-grid{display:grid;grid-template-columns:32px minmax(260px,2fr) minmax(96px,.8fr) minmax(96px,.8fr) minmax(96px,.8fr) minmax(96px,.8fr) minmax(96px,.8fr) minmax(96px,.8fr) minmax(110px,.8fr) minmax(110px,.8fr);gap:10px;align-items:center;min-width:1120px;}.delivery-new-orders-header{position:sticky;top:0;z-index:2;background:#f8fafc;border-bottom:1px solid #dbe7f5;padding:8px 12px;color:#334155;font-size:12px;font-weight:900;letter-spacing:.01em;}.delivery-new-order-row{padding:10px 12px;border-bottom:1px solid #dbe7f5;}.delivery-new-order-row.selected{background:#eff6ff;}.delivery-new-order-cell{min-width:0;}.delivery-new-order-checkbox-cell{display:flex;justify-content:center;align-items:center;}.delivery-new-order-checkbox-cell input{width:16px;height:16px;accent-color:#2563eb;}.delivery-new-order-customer-cell{text-align:left;min-width:0;}.delivery-new-money-cell{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:900;}.delivery-new-status-cell{text-align:center;display:flex;justify-content:center;align-items:center;}.delivery-new-action-cell{text-align:right;display:flex;justify-content:flex-end;align-items:center;}.delivery-new-row-action button{padding:7px 10px;border-radius:10px;}.delivery-new-order-checkbox{display:flex;justify-content:center;align-items:center;}.delivery-new-order-checkbox input{width:16px;height:16px;accent-color:#2563eb;}' +
      '.delivery-new-row:hover{background:#eff6ff;}' +
      '.delivery-new-row b{font-weight:800;}.delivery-new-row small{display:block;color:#334155;margin-top:3px;}' +
      '.delivery-new-money{text-align:right;font-variant-numeric:tabular-nums;font-weight:800;}' +
      '.delivery-new-return{color:#078b20;}.delivery-new-debt{color:#e11d24;}.delivery-new-zero{color:#0f8a35;}' +
      '.delivery-new-status{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:4px 9px;background:#eef2ff;color:#1d0fb4;font-weight:800;font-size:12px;}' +
      '.delivery-new-status.confirmed{background:#dcfce7;color:#166534;}.delivery-new-detail-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px;}' +
      '.delivery-new-detail-title h3{margin:0;}.delivery-new-detail-title small{display:block;color:#475569;margin-top:3px;}' +
      '.delivery-new-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:10px 0;}' +
      '.delivery-new-detail-cell{border:1px solid #dbe7f5;border-radius:10px;padding:9px 10px;background:#fff;}.delivery-new-detail-cell span{display:block;color:#64748b;font-size:12px;}.delivery-new-detail-cell b{display:block;text-align:right;font-size:16px;margin-top:4px;}' +
      '.delivery-new-safe-note{border:1px solid #bae6fd;background:#eff6ff;border-radius:10px;padding:10px 12px;color:#075985;font-weight:700;margin:8px 0;}' +
      '.delivery-new-detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}.delivery-new-version-list{margin-top:10px;border-top:1px dashed #cbd5e1;padding-top:8px;color:#334155;}.delivery-new-returnorders{margin:12px 0;border:1px solid #dbe7f5;border-radius:12px;background:#fff;overflow:hidden;}.delivery-new-returnorders-header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #dbe7f5;}.delivery-new-returnorders-header h4{margin:0;font-size:14px;}.delivery-new-returnorders-header small{display:block;color:#64748b;margin-top:3px;}.delivery-new-returnorder-card{padding:10px 12px;border-bottom:1px dashed #dbe7f5;}.delivery-new-returnorder-card:last-child{border-bottom:0;}.delivery-new-returnorder-meta{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:space-between;color:#475569;font-size:12px;}.delivery-new-returnorder-meta b{color:#0f172a;}.delivery-new-return-items{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;}.delivery-new-return-items th,.delivery-new-return-items td{border-top:1px solid #e2e8f0;padding:6px 5px;text-align:left;}.delivery-new-return-items th{color:#64748b;font-weight:800;background:#f8fafc;}.delivery-new-return-items .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}.delivery-new-returnorder-note{margin-top:8px;}.delivery-new-adjust-table{width:100%;border-collapse:collapse;margin:8px 0 10px;font-size:12px;}.delivery-new-adjust-table th,.delivery-new-adjust-table td{border-top:1px solid #e2e8f0;padding:6px 5px;text-align:left;}.delivery-new-adjust-table th{background:#f8fafc;color:#64748b;font-weight:800;}.delivery-new-adjust-table .num{text-align:right;font-variant-numeric:tabular-nums;}.delivery-new-adjust-table input{width:88px;text-align:right;}.delivery-v46-suggest-box .empty{padding:8px 10px;color:#64748b;font-size:12px;}.delivery-v46-suggest-box button strong{font-size:12px;color:#0b4dbb;}.delivery-v46-suggest-box button em{font-style:normal;font-size:11px;color:#64748b;}' +
      '.delivery-new-modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.36);padding:28px;overflow:auto;}.delivery-new-adjustment-dialog{width:min(1280px,96vw);margin:0 auto;background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.35);padding:18px;}.delivery-new-modal-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid #dbe7f5;padding-bottom:12px;margin-bottom:12px;}.delivery-new-modal-header h3{margin:0;font-size:20px;}.delivery-new-modal-header small{display:block;color:#475569;margin-top:4px;}.delivery-new-modal-close{border:0;background:#e5edf8;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer;}.delivery-new-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px;}.delivery-new-tab{border:1px solid #cbd5e1;background:#f8fafc;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer;}.delivery-new-tab.active{background:#2563eb;color:#fff;border-color:#2563eb;}.delivery-new-tab-panel{border:1px solid #dbe7f5;border-radius:14px;padding:12px;background:#fff;min-height:260px;}.delivery-new-modal-footer{display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;align-items:end;border-top:1px solid #dbe7f5;margin-top:12px;padding-top:12px;}.delivery-new-modal-footer label{font-weight:800;}.delivery-new-modal-footer input{width:100%;}.delivery-new-modal-footer .wide{grid-column:span 1;}.delivery-new-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;}.delivery-new-business-table{width:100%;border-collapse:collapse;font-size:12px;}.delivery-new-business-table th,.delivery-new-business-table td{border-top:1px solid #e2e8f0;padding:7px 6px;text-align:left;}.delivery-new-business-table th{background:#f8fafc;color:#64748b;font-weight:800;}.delivery-new-business-table .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:800;}.delivery-new-business-table input{width:92px;text-align:right;}.delivery-new-preview-cards{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-top:10px;}.delivery-new-history-block{margin:10px 0;border:1px solid #dbe7f5;border-radius:12px;overflow:hidden;}.delivery-new-history-block h4{margin:0;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #dbe7f5;}' +
      '.delivery-new-form-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;}.delivery-new-form-grid label{font-weight:700;color:#0f172a;}.delivery-new-form-grid input{width:100%;}.delivery-new-form-grid .wide{grid-column:span 2;}' +
      '@media(max-width:1100px){.delivery-v46-list-panel{overflow-x:auto;}.delivery-new-order-grid{grid-template-columns:32px minmax(220px,1.7fr) 92px 92px 92px 92px 92px 96px 108px 110px;min-width:1080px;}.delivery-new-summary-grid,.delivery-new-preview-cards{grid-template-columns:1fr 1fr;}.delivery-new-salesman-row{grid-template-columns:minmax(200px,1fr) 70px repeat(3,1fr);}.delivery-new-salesman-row span:nth-child(n+6){display:none;}}' +
      '@media(max-width:760px){.delivery-new-order-grid{min-width:1080px;grid-template-columns:32px minmax(220px,1.7fr) 92px 92px 92px 92px 92px 96px 108px 110px;}.delivery-new-form-grid,.delivery-new-summary-grid,.delivery-new-preview-cards,.delivery-new-modal-footer{grid-template-columns:1fr;}.delivery-new-salesman-row{grid-template-columns:1fr 1fr;}.delivery-new-salesman-row span:nth-child(n+5){display:none;}.delivery-new-form-grid .wide{grid-column:span 1;}.delivery-new-modal-backdrop{padding:10px;}.delivery-new-adjustment-dialog{width:100%;}}';
    document.head.appendChild(style);
  }

  function normalizeForSearch(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function uniqueByKey(rows, keyFn) {
    var seen = {};
    return (rows || []).filter(function (row) {
      var key = keyFn(row);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function staffCode(item, type) {
    return String(
      item.businessStaffCode ||
      item.staffCode ||
      item.code ||
      (type === 'delivery' ? item.deliveryStaffCode : item.salesStaffCode) ||
      item.salesmanCode ||
      item.nvbhCode ||
      item.nvghCode ||
      ''
    ).trim();
  }

  function staffName(item, type) {
    return String(
      item.businessStaffName ||
      item.fullName ||
      item.name ||
      (type === 'delivery' ? item.deliveryStaffName : item.salesStaffName) ||
      item.salesmanName ||
      item.nvbhName ||
      item.nvghName ||
      ''
    ).trim();
  }

  function localStaffSuggestions(type, keyword) {
    var q = normalizeForSearch(keyword);
    var rows = uniqueByKey(state.rows.map(function (row) {
      return type === 'delivery'
        ? { code: row.deliveryStaffCode, name: row.deliveryStaffName }
        : { code: row.salesStaffCode, name: row.salesStaffName };
    }), function (item) { return [item.code, item.name].join('|'); }).filter(function (item) {
      var textValue = normalizeForSearch([item.code, item.name].join(' '));
      return (item.code || item.name) && (!q || textValue.indexOf(q) >= 0);
    });
    return rows.slice(0, 20);
  }

  async function staffSuggestions(type, keyword) {
    try {
      if (window.UnifiedSearchEngine) {
        var fn = type === 'delivery' ? window.UnifiedSearchEngine.searchDeliveryStaff : window.UnifiedSearchEngine.searchSalesStaff;
        if (typeof fn === 'function') {
          var remote = await fn(keyword || '', { limit: 20, minChars: 0, allowEmpty: '1', showOnFocus: '1' });
          if (remote && remote.length) return remote;
        }
      }
    } catch (err) {
      // Fallback to rows already loaded in this module.
    }
    return localStaffSuggestions(type, keyword);
  }

  function orderSearchSuggestions(keyword) {
    var q = normalizeForSearch(keyword);
    return uniqueByKey(state.rows, function (row) { return row.orderCode || row.orderId || row.customerCode; }).filter(function (row) {
      var terms = [row.orderCode, row.orderId, row.customerCode, row.customerName, row.deliveryStaffCode, row.salesStaffCode].join(' ');
      return !q || normalizeForSearch(terms).indexOf(q) >= 0;
    }).slice(0, 20);
  }

  function hideSuggestBox(box) {
    if (!box) return;
    box.classList.remove('show');
    box.innerHTML = '';
  }

  function renderSuggestBox(box, items, render, select) {
    if (!box) return;
    if (!items || !items.length) {
      box.innerHTML = '<div class="empty">Không có dữ liệu gợi ý. Hãy tải đơn hoặc nhập từ khóa khác.</div>';
      box.classList.add('show');
      return;
    }
    box.innerHTML = items.map(function (item, index) {
      var html = render(item);
      return '<button type="button" data-index="' + index + '">' + html + '</button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('button[data-index]'), function (btn) {
      btn.addEventListener('mousedown', function (event) { event.preventDefault(); });
      btn.addEventListener('click', function () {
        var item = items[Number(btn.dataset.index)];
        select(item);
        hideSuggestBox(box);
      });
    });
    box.classList.add('show');
  }

  function wireLocalAutocomplete(inputId, boxId, getItems, render, select) {
    var input = byId(inputId);
    var box = byId(boxId);
    if (!input || !box || input.dataset.deliveryNewSuggestReady === '1') return;
    input.dataset.deliveryNewSuggestReady = '1';
    var timer = null;
    async function show() {
      clearTimeout(timer);
      timer = setTimeout(async function () {
        var items = await getItems(input.value || '');
        renderSuggestBox(box, items, render, select);
      }, 120);
    }
    input.addEventListener('input', show);
    input.addEventListener('focus', show);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') hideSuggestBox(box);
    });
    document.addEventListener('click', function (event) {
      if (!box.contains(event.target) && event.target !== input) hideSuggestBox(box);
    });
  }

  function bindFilterAutocomplete() {
    wireLocalAutocomplete(
      'deliveryTodayNewDelivery',
      'deliveryTodayNewDeliverySuggestions',
      function (keyword) { return staffSuggestions('delivery', keyword); },
      function (item) {
        var code = staffCode(item, 'delivery');
        var name = staffName(item, 'delivery');
        return '<strong>' + esc(code || name) + '</strong><em>' + esc(name && code ? name : 'Nhân viên giao hàng') + '</em>';
      },
      function (item) {
        var input = byId('deliveryTodayNewDelivery');
        if (input) input.value = staffCode(item, 'delivery') || staffName(item, 'delivery');
        state.userTouchedFilters = true;
        setMessage('Đã chọn NVGH. Bấm Tải đơn để xem danh sách tương ứng.');
      }
    );
    wireLocalAutocomplete(
      'deliveryTodayNewSalesman',
      'deliveryTodayNewSalesmanSuggestions',
      function (keyword) { return staffSuggestions('sales', keyword); },
      function (item) {
        var code = staffCode(item, 'sales');
        var name = staffName(item, 'sales');
        return '<strong>' + esc(code || name) + '</strong><em>' + esc(name && code ? name : 'Nhân viên bán hàng') + '</em>';
      },
      function (item) {
        var input = byId('deliveryTodayNewSalesman');
        if (input) input.value = staffCode(item, 'sales') || staffName(item, 'sales');
        state.userTouchedFilters = true;
        setMessage('Đã chọn NVBH. Bấm Tải đơn để xem danh sách tương ứng.');
      }
    );
    wireLocalAutocomplete(
      'deliveryTodayNewSearch',
      'deliveryTodayNewSearchSuggestions',
      function (keyword) { return Promise.resolve(orderSearchSuggestions(keyword)); },
      function (row) {
        return '<strong>' + esc(row.orderCode || row.orderId || '') + '</strong><em>' + esc([row.customerCode, row.customerName].filter(Boolean).join(' · ')) + '</em>';
      },
      function (row) {
        var input = byId('deliveryTodayNewSearch');
        if (input) input.value = row.orderCode || row.orderId || row.customerCode || '';
        state.userTouchedFilters = true;
        setMessage('Đã chọn đơn/khách hàng. Bấm Tải đơn để xem danh sách tương ứng.');
      }
    );
  }

  function filters() {
    return {
      date: byId('deliveryTodayNewDate') ? byId('deliveryTodayNewDate').value : '',
      q: byId('deliveryTodayNewSearch') ? byId('deliveryTodayNewSearch').value.trim() : '',
      delivery: byId('deliveryTodayNewDelivery') ? byId('deliveryTodayNewDelivery').value.trim() : '',
      salesman: byId('deliveryTodayNewSalesman') ? byId('deliveryTodayNewSalesman').value.trim() : '',
      deliveryDateChangedByUser: state.deliveryDateTouched ? '1' : '0'
    };
  }

  function setMessage(text, isError) {
    var message = byId('deliveryTodayNewMessage');
    if (!message) return;
    message.textContent = text || '';
    message.className = 'message' + (isError ? ' error-text' : '');
  }

  function setElementVisible(selector, visible) {
    var el = selector.charAt(0) === '#' ? byId(selector.slice(1)) : document.querySelector(selector);
    if (!el) return;
    if (visible) el.classList.remove('delivery-new-results-hidden');
    else el.classList.add('delivery-new-results-hidden');
  }

  function setResultSectionsVisible(visible) {
    setElementVisible('#deliveryTodayNewEmptyState', !visible);
    setElementVisible('.delivery-new-kpis', visible);
    setElementVisible('#deliveryTodayNewSalesmanPanel', visible);
    setElementVisible('.delivery-new-main-list', visible);
  }

  function renderEmptyState(message) {
    var empty = byId('deliveryTodayNewEmptyState');
    if (!empty) return;
    empty.innerHTML = '<b>Chưa có dữ liệu hiển thị.</b><span>' + esc(message || 'Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải đơn.') + '</span>';
  }

  function resetResultsState(message) {
    state.rows = [];
    state.salesmanGroups = [];
    state.selectedSalesmanKeys = {};
    state.selectedOrderIds = new Set();
    state.selectedIndex = -1;
    state.hasSearched = false;
    state.loaded = false;
    applySummary({});
    renderEmptyState(message);
    setResultSectionsVisible(false);
    updateCloseoutButton();
  }

  function resetFiltersToEmptyState() {
    ['deliveryTodayNewSearch', 'deliveryTodayNewDelivery', 'deliveryTodayNewSalesman'].forEach(function (id) { var el = byId(id); if (el) el.value = ''; });
    var dateInput = byId('deliveryTodayNewDate');
    if (dateInput) dateInput.value = today();
    state.deliveryDateTouched = false;
    state.userTouchedFilters = false;
    resetResultsState('Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải đơn.');
    setMessage('');
  }

  function hasValidSearchCriteria() {
    var f = filters();
    return Boolean(f.q || f.delivery || f.salesman || (state.deliveryDateTouched === true && f.date));
  }

  function applySummary(summary) {
    summary = summary || {};
    var pairs = {
      deliveryTodayNewOrderCount: (summary.orderCount || state.rows.length) + ' đơn',
      deliveryTodayNewOriginal: money(summary.originalAmount),
      deliveryTodayNewCash: money(summary.cashAmount || 0),
      deliveryTodayNewBank: money(summary.bankAmount || 0),
      deliveryTodayNewReward: money((summary.rewardAmount || 0) + (summary.offsetAmount || 0)),
      deliveryTodayNewReturned: money(summary.returnedAmount),
      deliveryTodayNewDebt: money(summary.finalDebtAmount)
    };
    Object.keys(pairs).forEach(function (id) { var el = byId(id); if (el) el.textContent = pairs[id]; });
  }

  function salesmanKey(row) {
    var code = String((row && (row.salesStaffCode || row.salesmanCode || row.nvbhCode)) || '').trim();
    var name = String((row && (row.salesStaffName || row.salesmanName || row.nvbhName)) || '').trim();
    return code || name || 'UNKNOWN_NVBH';
  }

  function salesmanLabel(row) {
    var code = String((row && (row.salesStaffCode || row.salesmanCode || row.nvbhCode)) || '').trim();
    var name = String((row && (row.salesStaffName || row.salesmanName || row.nvbhName)) || '').trim();
    if (code && name) return code + ' - ' + name;
    return code || name || 'Chưa rõ NVBH';
  }

  function buildSalesmanGroups(rows) {
    var map = {};
    (rows || []).forEach(function (row) {
      var key = salesmanKey(row);
      if (!map[key]) {
        map[key] = {
          key: key,
          salesStaffCode: row.salesStaffCode || row.salesmanCode || row.nvbhCode || '',
          salesStaffName: row.salesStaffName || row.salesmanName || row.nvbhName || '',
          deliveryStaffCode: row.deliveryStaffCode || row.deliveryCode || row.nvghCode || '',
          deliveryStaffName: row.deliveryStaffName || row.deliveryName || row.nvghName || '',
          orderCount: 0,
          originalAmount: 0,
          cashAmount: 0,
          bankAmount: 0,
          rewardAmount: 0,
          offsetAmount: 0,
          returnedAmount: 0,
          finalDebtAmount: 0
        };
      }
      map[key].orderCount += 1;
      map[key].originalAmount += num(row.originalAmount);
      map[key].cashAmount += num(row.cashAmount);
      map[key].bankAmount += num(row.bankAmount);
      map[key].rewardAmount += num(row.rewardAmount);
      map[key].offsetAmount += num(row.offsetAmount);
      map[key].returnedAmount += num(row.returnedAmount);
      map[key].finalDebtAmount += num(row.finalDebtAmount);
    });
    return Object.keys(map).map(function (key) { return map[key]; }).sort(function (a, b) {
      return String(a.salesStaffCode || a.salesStaffName).localeCompare(String(b.salesStaffCode || b.salesStaffName), 'vi');
    });
  }

  function selectedSalesmanSet() {
    return state.selectedSalesmanKeys || {};
  }

  function getVisibleRowsBySelectedSalesmen() {
    var selected = selectedSalesmanSet();
    var hasSelection = Object.keys(selected).some(function (key) { return selected[key]; });
    if (!hasSelection) return [];
    return (state.rows || []).filter(function (row) { return Boolean(selected[salesmanKey(row)]); });
  }

  function summarizeVisibleRows(rows) {
    return (rows || []).reduce(function (summary, row) {
      summary.orderCount += 1;
      summary.originalAmount += num(row.originalAmount);
      summary.cashAmount += num(row.cashAmount);
      summary.bankAmount += num(row.bankAmount);
      summary.rewardAmount += num(row.rewardAmount);
      summary.offsetAmount += num(row.offsetAmount);
      summary.returnedAmount += num(row.returnedAmount);
      summary.finalDebtAmount += num(row.finalDebtAmount);
      return summary;
    }, { orderCount: 0, originalAmount: 0, cashAmount: 0, bankAmount: 0, rewardAmount: 0, offsetAmount: 0, returnedAmount: 0, finalDebtAmount: 0 });
  }

  function ensureSelectedOrderSet() {
    if (state.selectedOrderIds instanceof Set) return state.selectedOrderIds;
    state.selectedOrderIds = new Set();
    return state.selectedOrderIds;
  }

  function orderSelectionKey(row) { return rowKey(row); }

  function isOrderSelectable(row) {
    return Boolean(row && orderSelectionKey(row) && !isConfirmed(row));
  }

  function isOrderSelected(row) {
    return ensureSelectedOrderSet().has(orderSelectionKey(row));
  }

  function getSelectableVisibleRows() {
    return getVisibleRowsBySelectedSalesmen().filter(isOrderSelectable);
  }

  function pruneSelectedOrderIds(visibleRows) {
    var allowed = new Set((visibleRows || getVisibleRowsBySelectedSalesmen()).filter(isOrderSelectable).map(orderSelectionKey));
    var selected = ensureSelectedOrderSet();
    Array.from(selected).forEach(function (key) { if (!allowed.has(key)) selected.delete(key); });
  }

  function toggleOrderSelection(orderId, checked) {
    var key = String(orderId || '').trim();
    if (!key) return;
    var selected = ensureSelectedOrderSet();
    if (checked) selected.add(key);
    else selected.delete(key);
    renderRows();
  }

  function selectAllVisibleOrders() {
    var selected = ensureSelectedOrderSet();
    getSelectableVisibleRows().forEach(function (row) { selected.add(orderSelectionKey(row)); });
    renderRows();
  }

  function clearSelectedOrders() {
    ensureSelectedOrderSet().clear();
    renderRows();
  }

  function getSelectedOrders() {
    var selected = ensureSelectedOrderSet();
    return getVisibleRowsBySelectedSalesmen().filter(function (row) { return isOrderSelectable(row) && selected.has(orderSelectionKey(row)); });
  }

  function getSelectedCloseoutSummary() {
    return closeoutSummary(getSelectedOrders());
  }

  function canCloseoutSelectedOrders() {
    return getSelectedOrders().length > 0 && !state.closeoutBusy;
  }

  function applySelectedSalesmanFilter() {
    pruneSelectedOrderIds(getVisibleRowsBySelectedSalesmen());
    renderSalesmanGroupPanel();
    renderRows();
    updateCloseoutButton();
  }

  function toggleSalesmanSelection(key, checked) {
    state.selectedSalesmanKeys = state.selectedSalesmanKeys || {};
    state.selectedSalesmanKeys[key] = Boolean(checked);
    applySelectedSalesmanFilter();
  }

  function selectAllSalesmen() {
    state.selectedSalesmanKeys = {};
    (state.salesmanGroups || []).forEach(function (group) { state.selectedSalesmanKeys[group.key] = true; });
    applySelectedSalesmanFilter();
  }

  function clearAllSalesmen() {
    state.selectedSalesmanKeys = {};
    (state.salesmanGroups || []).forEach(function (group) { state.selectedSalesmanKeys[group.key] = false; });
    applySelectedSalesmanFilter();
  }

  function renderSelectedSalesmanCompactSummary(summary, selectedCount, totalCount) {
    return '<div class="delivery-new-salesman-compact">Tổng theo NVBH đã chọn: ' +
      '<b>' + selectedCount + '/' + totalCount + ' NVBH</b> · ' +
      '<b>' + money(summary.orderCount) + ' đơn</b> · ' +
      'PT <b>' + money(summary.originalAmount) + '</b> · ' +
      'TM <b>' + money(summary.cashAmount) + '</b> · ' +
      'CK <b>' + money(summary.bankAmount) + '</b> · ' +
      'TH <b>' + money(num(summary.rewardAmount) + num(summary.offsetAmount)) + '</b> · ' +
      'HT <b class="delivery-new-return">' + money(summary.returnedAmount) + '</b> · ' +
      'CN <b class="' + (num(summary.finalDebtAmount) > 0 ? 'delivery-new-debt' : 'delivery-new-zero') + '">' + money(summary.finalDebtAmount) + '</b>' +
    '</div>';
  }


  function renderSalesmanGroupPanel() {
    var box = byId('deliveryTodayNewSalesmanPanel');
    if (!box) return;
    if (!state.hasSearched) { box.innerHTML = '<div class="delivery-new-salesman-empty">Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải đơn.</div>'; return; }
    var groups = state.salesmanGroups || [];
    if (!groups.length) {
      box.innerHTML = '<div class="delivery-new-salesman-empty">Chưa có NVBH trong danh sách đơn đang tải.</div>';
      return;
    }
    var selected = selectedSalesmanSet();
    var selectedCount = groups.filter(function (group) { return selected[group.key]; }).length;
    var deliveryFilter = (byId('deliveryTodayNewDelivery') && byId('deliveryTodayNewDelivery').value) || '';
    var title = deliveryFilter ? 'NVBH thuộc NVGH ' + deliveryFilter : 'NVBH trong danh sách đơn đang tải';
    var visibleRows = getVisibleRowsBySelectedSalesmen();
    var summary = summarizeVisibleRows(visibleRows);
    var rows = groups.map(function (group) {
      var checked = selected[group.key] ? ' checked' : '';
      return '<div class="delivery-new-salesman-row">' +
        '<label class="delivery-new-salesman-check"><input type="checkbox" data-salesman-key="' + esc(group.key) + '"' + checked + '> <span>' + esc((group.salesStaffCode || '') + (group.salesStaffCode && group.salesStaffName ? ' - ' : '') + (group.salesStaffName || 'Chưa rõ NVBH')) + '</span></label>' +
        '<span class="muted">' + esc(group.orderCount) + ' đơn</span>' +
        '<span class="delivery-new-salesman-money">PT ' + money(group.originalAmount) + '</span>' +
        '<span class="delivery-new-salesman-money">TM ' + money(group.cashAmount) + '</span>' +
        '<span class="delivery-new-salesman-money">CK ' + money(group.bankAmount) + '</span>' +
        '<span class="delivery-new-salesman-money">TH ' + money(num(group.rewardAmount) + num(group.offsetAmount)) + '</span>' +
        '<span class="delivery-new-salesman-money delivery-new-return">HT ' + money(group.returnedAmount) + '</span>' +
        '<span class="delivery-new-salesman-money ' + (num(group.finalDebtAmount) > 0 ? 'delivery-new-debt' : 'delivery-new-zero') + '">CN ' + money(group.finalDebtAmount) + '</span>' +
      '</div>';
    }).join('');
    box.innerHTML = '<div class="delivery-new-salesman-header"><div><h3>' + esc(title) + '</h3>' + renderSelectedSalesmanCompactSummary(summary, selectedCount, groups.length) + '</div><div class="delivery-new-salesman-actions"><button type="button" id="deliveryTodayNewSelectAllSalesmen" class="secondary">Chọn tất cả</button><button type="button" id="deliveryTodayNewClearAllSalesmen" class="secondary">Bỏ chọn tất cả</button></div></div>' +
      '<div class="delivery-new-salesman-rows">' + rows + '</div>';
    Array.prototype.forEach.call(box.querySelectorAll('input[type="checkbox"][data-salesman-key]'), function (input) {
      input.addEventListener('change', function () { toggleSalesmanSelection(input.dataset.salesmanKey, input.checked); });
    });
    var selectAll = byId('deliveryTodayNewSelectAllSalesmen');
    var clearAll = byId('deliveryTodayNewClearAllSalesmen');
    if (selectAll) selectAll.addEventListener('click', selectAllSalesmen);
    if (clearAll) clearAll.addEventListener('click', clearAllSalesmen);
  }

  function updateOrderSelectionToolbar(visibleRows) {
    var countEl = byId('deliveryTodayNewOrderCount');
    var selectedEl = byId('deliveryTodayNewSelectionCount');
    var selectAll = byId('deliveryTodayNewSelectAllOrders');
    var clearAll = byId('deliveryTodayNewClearOrders');
    var visible = visibleRows || getVisibleRowsBySelectedSalesmen();
    var selectable = visible.filter(isOrderSelectable);
    var selectedCount = getSelectedOrders().length;
    if (countEl) countEl.textContent = visible.length + ' đơn';
    if (selectedEl) selectedEl.textContent = selectedCount + ' đơn được chọn / ' + selectable.length + ' đơn có thể chốt';
    if (selectAll) selectAll.disabled = !selectable.length || selectedCount === selectable.length;
    if (clearAll) clearAll.disabled = !selectedCount;
    var headerCheck = byId('deliveryTodayNewHeaderSelectAllOrders');
    if (headerCheck) {
      headerCheck.disabled = !selectable.length;
      headerCheck.checked = Boolean(selectable.length && selectedCount === selectable.length);
      headerCheck.indeterminate = Boolean(selectedCount > 0 && selectedCount < selectable.length);
    }
  }

  function renderRows() {
    var list = byId('deliveryTodayNewTable');
    if (!list) return;
    if (!state.hasSearched) {
      list.innerHTML = '<div class="empty-state">Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải đơn.</div>';
      updateOrderSelectionToolbar([]);
      updateCloseoutButton();
      return;
    }
    var visibleRows = getVisibleRowsBySelectedSalesmen();
    pruneSelectedOrderIds(visibleRows);
    if (!state.rows.length) {
      list.innerHTML = '<div class="empty-state">Không có đơn theo bộ lọc.</div>';
      updateOrderSelectionToolbar([]);
      updateCloseoutButton();
      return;
    }
    if (!visibleRows.length) {
      list.innerHTML = '<div class="empty-state">Chưa chọn NVBH nào.</div>';
      updateOrderSelectionToolbar([]);
      updateCloseoutButton();
      return;
    }
    list.innerHTML = visibleRows.map(function (row, index) {
      var confirmed = isConfirmed(row);
      var selectable = isOrderSelectable(row);
      var key = orderSelectionKey(row);
      var checked = isOrderSelected(row) ? ' checked' : '';
      var disabled = selectable ? '' : ' disabled';
      var selectedClass = checked ? ' selected' : '';
      var debtClass = num(row.finalDebtAmount) > 0 ? 'delivery-new-debt' : 'delivery-new-zero';
      return '<div data-index="' + index + '" data-order-key="' + esc(key) + '" class="delivery-new-row delivery-new-order-row delivery-new-order-grid' + selectedClass + '" role="row">' +
        '<label class="delivery-new-order-cell delivery-new-order-checkbox delivery-new-order-checkbox-cell" title="' + esc(selectable ? 'Chọn đơn để chốt sổ' : 'Đơn đã chốt hoặc không đủ điều kiện chọn') + '"><input type="checkbox" class="deliveryTodayNewOrderSelect" data-order-key="' + esc(key) + '"' + checked + disabled + '></label>' +
        '<span class="delivery-new-order-cell delivery-new-order-customer-cell"><b>' + esc(row.orderCode || row.orderId) + '</b><small>' + esc(row.customerName || '') + ' · ' + esc(row.customerCode || '') + '</small></span>' +
        '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell">' + money(row.originalAmount) + '</span>' +
        '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell">' + money(row.cashAmount) + '</span>' +
        '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell">' + money(row.bankAmount) + '</span>' +
        '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell">' + money(num(row.rewardAmount) + num(row.offsetAmount)) + '</span>' +
        '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell delivery-new-return">' + money(row.returnedAmount) + '</span>' +
        '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell ' + debtClass + '">' + money(row.finalDebtAmount) + '</span>' +
        '<span class="delivery-new-order-cell delivery-new-status-cell"><span class="delivery-new-status ' + (confirmed ? 'confirmed' : '') + '">' + esc(statusLabel(row)) + '</span></span>' +
        '<span class="delivery-new-order-cell delivery-new-row-action delivery-new-action-cell"><button type="button" class="primary-action deliveryTodayNewAdjustBtn" data-adjust-index="' + index + '">Điều chỉnh</button></span>' +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.deliveryTodayNewOrderSelect'), function (input) {
      input.addEventListener('change', function (event) {
        event.stopPropagation();
        toggleOrderSelection(input.dataset.orderKey, input.checked);
      });
    });
    Array.prototype.forEach.call(list.querySelectorAll('[data-adjust-index]'), function (btn) {
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openAdjustmentPopup(getVisibleRowsBySelectedSalesmen()[Number(btn.dataset.adjustIndex)]);
      });
    });
    updateOrderSelectionToolbar(visibleRows);
    updateCloseoutButton();
  }

  function selectedCloseoutRows() {
    return getSelectedOrders();
  }

  function closeoutSummary(rows) {
    return (rows || []).reduce(function (summary, row) {
      summary.orderCount += 1;
      summary.originalAmount += num(row.originalAmount);
      summary.cashAmount += num(row.cashAmount);
      summary.bankAmount += num(row.bankAmount);
      summary.rewardAmount += num(row.rewardAmount);
      summary.offsetAmount += num(row.offsetAmount);
      summary.returnedAmount += num(row.returnedAmount);
      summary.totalDebt += Math.max(0, num(row.finalDebtAmount));
      if (num(row.finalDebtAmount) > 0) summary.debtOrderCount += 1;
      if (num(row.finalDebtAmount) === 0) summary.zeroDebtCount += 1;
      if (num(row.finalDebtAmount) < 0) summary.overpaidCount += 1;
      return summary;
    }, { orderCount: 0, originalAmount: 0, cashAmount: 0, bankAmount: 0, rewardAmount: 0, offsetAmount: 0, returnedAmount: 0, debtOrderCount: 0, zeroDebtCount: 0, overpaidCount: 0, totalDebt: 0 });
  }

  function updateCloseoutButton() {
    var btn = byId('deliveryTodayNewCloseout');
    if (!btn) return;
    var rows = state.hasSearched ? selectedCloseoutRows() : [];
    var summary = closeoutSummary(rows);
    btn.disabled = !canCloseoutSelectedOrders();
    btn.textContent = state.closeoutBusy ? 'Đang chốt...' : ('Chốt sổ giao hàng' + (rows.length ? ' (' + rows.length + ')' : ''));
    btn.title = rows.length ? ('Chuyển CN còn lại sang AR-DEBT: ' + money(summary.totalDebt)) : 'Vui lòng chọn ít nhất một đơn để chốt sổ.';
    updateOrderSelectionToolbar(getVisibleRowsBySelectedSalesmen());
  }

  function closeCloseoutModal() {
    var modal = byId('deliveryTodayNewCloseoutModal');
    if (modal) { modal.hidden = true; modal.innerHTML = ''; }
  }

  function openCloseoutModal() {
    var modal = byId('deliveryTodayNewCloseoutModal');
    if (!modal) return;
    var rows = selectedCloseoutRows();
    if (!rows.length) { setMessage('Vui lòng chọn ít nhất một đơn để chốt sổ.', true); return; }
    var summary = closeoutSummary(rows);
    var f = filters();
    var selectedGroups = (state.salesmanGroups || []).filter(function (group) { return state.selectedSalesmanKeys && state.selectedSalesmanKeys[group.key]; });
    modal.hidden = false;
    modal.innerHTML = '' +
      '<div class="delivery-new-adjustment-dialog">' +
        '<div class="delivery-new-modal-header"><div><h3>Chốt sổ giao hàng</h3><small>Khóa dữ liệu giao hàng và chuyển CN còn lại sang Công nợ (New) qua AR-DEBT-OPEN.</small></div><button type="button" id="deliveryCloseoutModalCloseTop" class="delivery-new-modal-close">Đóng</button></div>' +
        '<div class="delivery-new-summary-grid">' +
          detailCell('Ngày giao', f.date || 'Theo bộ lọc') +
          detailCell('NVGH', f.delivery || 'Theo bộ lọc') +
          detailCell('NVBH đã chọn', selectedGroups.length + '/' + (state.salesmanGroups || []).length) +
          detailCell('Số đơn đã chọn', summary.orderCount) +
          detailCell('Tổng phải thu', money(summary.originalAmount)) +
          detailCell('Tổng tiền mặt', money(summary.cashAmount)) +
          detailCell('Tổng chuyển khoản', money(summary.bankAmount)) +
          detailCell('Tổng trả thưởng', money(num(summary.rewardAmount) + num(summary.offsetAmount))) +
          detailCell('Tổng hàng trả', money(summary.returnedAmount), 'delivery-new-return') +
          detailCell('Đơn còn nợ > 1.000', summary.debtOrderCount) +
          detailCell('CN chuyển sang công nợ', money(summary.totalDebt), summary.totalDebt > 0 ? 'delivery-new-debt' : 'delivery-new-zero') +
        '</div>' +
        '<div class="delivery-new-closeout-warning">Chỉ phần CN sau làm tròn ngoài khoảng ±1.000 mới sinh AR-DEBT-OPEN. Đơn có CN từ -1.000 đến 1.000 được coi là hết nợ.</div>' +
        '<label>Lý do chốt sổ<input id="deliveryCloseoutReason" placeholder="Ví dụ: Chốt sổ giao hàng cuối ngày" value="Chốt sổ giao hàng cuối ngày"></label>' +
        '<div class="delivery-new-modal-footer">' +
          '<button type="button" id="deliveryCloseoutCancel" class="secondary">Hủy</button>' +
          '<button type="button" id="deliveryCloseoutConfirm" class="primary-action">Xác nhận chốt sổ</button>' +
        '</div>' +
      '</div>';
    var closeTop = byId('deliveryCloseoutModalCloseTop');
    var closeBottom = byId('deliveryCloseoutCancel');
    var confirm = byId('deliveryCloseoutConfirm');
    if (closeTop) closeTop.addEventListener('click', closeCloseoutModal);
    if (closeBottom) closeBottom.addEventListener('click', closeCloseoutModal);
    if (confirm) confirm.addEventListener('click', submitCloseout);
  }

  async function submitCloseout() {
    var rows = selectedCloseoutRows();
    var reasonEl = byId('deliveryCloseoutReason');
    var reason = reasonEl ? reasonEl.value.trim() : '';
    if (!rows.length) { setMessage('Không có đơn trong phạm vi chốt.', true); return; }
    if (!reason) { setMessage('Vui lòng nhập lý do chốt sổ.', true); return; }
    var f = filters();
    var salesStaffCodes = (state.salesmanGroups || [])
      .filter(function (group) { return state.selectedSalesmanKeys && state.selectedSalesmanKeys[group.key]; })
      .map(function (group) { return group.salesStaffCode || group.salesStaffName || group.key; })
      .filter(Boolean);
    var orderIds = rows.map(rowKey).filter(Boolean).filter(function (value, index, arr) { return arr.indexOf(value) === index; });
    state.closeoutBusy = true;
    updateCloseoutButton();
    setMessage('Đang chốt sổ giao hàng...');
    try {
      var res = await fetch('/api/new/delivery-today/closeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryDate: f.date,
          date: f.date,
          deliveryStaffCode: f.delivery,
          salesStaffCodes: salesStaffCodes,
          orderIds: orderIds,
          reason: reason,
          closeoutScope: 'selected_orders'
        })
      });
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không chốt được sổ giao hàng');
      closeCloseoutModal();
      var posted = json.totalDebtPosted != null ? json.totalDebtPosted : (json.data && json.data.totalDebtPosted);
      setMessage('Đã chốt sổ giao hàng. Đã chuyển ' + money(posted || 0) + ' sang công nợ.');
      await load();
    } catch (err) {
      setMessage(err.message || 'Không chốt được sổ giao hàng', true);
    } finally {
      state.closeoutBusy = false;
      updateCloseoutButton();
    }
  }

  function detailCell(label, value, className) {
    return '<div class="delivery-new-detail-cell"><span>' + esc(label) + '</span><b class="' + (className || '') + '">' + esc(value) + '</b></div>';
  }

  function rowKey(row) { return String(row.orderId || row.orderCode || row.closeoutVersionId || row.correctionId || ''); }

  function correctionEndpoint(row) {
    return '/api/new/delivery-today/closeouts/' + encodeURIComponent(rowKey(row)) + '/corrections';
  }

  function versionsEndpoint(row) {
    return '/api/new/delivery-today/closeouts/' + encodeURIComponent(rowKey(row)) + '/versions';
  }

  function qty(value) {
    var n = Number(String(value == null ? 0 : value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function itemCode(item) { return String((item && (item.productCode || item.code || item.sku || item.itemCode)) || '').trim(); }
  function itemName(item) { return String((item && (item.productName || item.name || item.description || item.itemName)) || '').trim(); }
  function itemDeliveredQty(item) { return qty(item && (item.deliveredQty ?? item.deliveryQty ?? item.shipQty ?? item.quantity ?? item.qty ?? item.totalQty ?? item.soldQty ?? item.looseQty ?? item.units)); }
  function itemUnitPrice(item) { return num(item && (item.unitPrice ?? item.salePrice ?? item.price ?? item.finalPrice ?? item.priceAfterPromotion ?? item.actualPrice)); }
  function itemAmount(item) { var q = itemDeliveredQty(item); var p = itemUnitPrice(item); return num(item && (item.amount ?? item.lineTotal ?? item.totalAmount ?? (q * p))); }

  function orderItemsFromRow(row) {
    var items = []
      .concat(Array.isArray(row && row.items) ? row.items : [])
      .concat(Array.isArray(row && row.orderItems) ? row.orderItems : [])
      .concat(Array.isArray(row && row.soldItems) ? row.soldItems : []);
    var map = {};
    items.forEach(function (item) {
      var code = itemCode(item);
      var name = itemName(item);
      var price = itemUnitPrice(item);
      var key = code + '|' + name + '|' + price;
      if (!code && !name) return;
      if (!map[key]) {
        map[key] = {
          productCode: code,
          productName: name,
          unit: item.unit || item.baseUnit || item.uom || '',
          deliveredQty: 0,
          unitPrice: price,
          amount: 0,
          conversionRate: qty(item.conversionRate || item.packing || item.boxSize || 0),
          caseQty: qty(item.caseQty || item.boxQty || 0),
          looseQty: qty(item.looseQty || 0)
        };
      }
      map[key].deliveredQty += itemDeliveredQty(item);
      map[key].amount += itemAmount(item);
    });
    return Object.keys(map).map(function (key) { return map[key]; });
  }

  function returnedQtyMap(row) {
    var map = {};
    (Array.isArray(row && row.returnOrders) ? row.returnOrders : []).forEach(function (ro) {
      (Array.isArray(ro.items) ? ro.items : []).forEach(function (item) {
        var code = itemCode(item);
        var name = itemName(item);
        var price = itemUnitPrice(item);
        var key = code + '|' + name + '|' + price;
        if (!key) return;
        if (!map[key]) map[key] = { qty: 0, amount: 0, productCode: code, productName: name, unitPrice: price };
        map[key].qty += qty(item.returnQty ?? item.returnedQty ?? item.quantity ?? item.qty ?? item.totalQty);
        map[key].amount += num(item.amount ?? item.returnAmount ?? item.totalAmount ?? (qty(item.returnQty ?? item.quantity ?? item.qty) * price));
      });
    });
    return map;
  }

  function buildReturnEditItems(row) {
    var sold = orderItemsFromRow(row);
    var returns = returnedQtyMap(row);
    var rows = sold.map(function (item) {
      var key = item.productCode + '|' + item.productName + '|' + item.unitPrice;
      var ret = returns[key] || { qty: 0, amount: 0 };
      return {
        productCode: item.productCode,
        productName: item.productName,
        unit: item.unit,
        deliveredQty: item.deliveredQty,
        unitPrice: item.unitPrice,
        oldReturnQty: ret.qty || 0,
        newReturnQty: ret.qty || 0,
        oldReturnAmount: ret.amount || Math.round((ret.qty || 0) * item.unitPrice)
      };
    });
    Object.keys(returns).forEach(function (key) {
      var exists = rows.some(function (rowItem) { return (rowItem.productCode + '|' + rowItem.productName + '|' + rowItem.unitPrice) === key; });
      if (!exists) {
        var ret = returns[key];
        rows.push({
          productCode: ret.productCode,
          productName: ret.productName,
          unit: '',
          deliveredQty: ret.qty || 0,
          unitPrice: ret.unitPrice || 0,
          oldReturnQty: ret.qty || 0,
          newReturnQty: ret.qty || 0,
          oldReturnAmount: ret.amount || 0
        });
      }
    });
    return rows;
  }

  function currentReturnEditItems() {
    return (state.correctionReturnItems || []).map(function (item, index) {
      var input = document.querySelector('.deliveryNewReturnQtyInput[data-index="' + index + '"]');
      var newQty = qty(input ? input.value : item.newReturnQty);
      var adjustmentQty = newQty - qty(item.oldReturnQty);
      var adjustmentAmount = Math.round(adjustmentQty * num(item.unitPrice));
      return {
        productCode: item.productCode,
        productName: item.productName,
        oldReturnQty: qty(item.oldReturnQty),
        newReturnQty: newQty,
        unitPrice: num(item.unitPrice),
        deliveredQty: qty(item.deliveredQty),
        adjustmentQty: adjustmentQty,
        adjustmentAmount: adjustmentAmount
      };
    });
  }

  function totalsFromPopup(row) {
    var returnItems = currentReturnEditItems();
    var oldReturn = num(row.returnedAmount);
    var returnAfter = returnItems.length
      ? returnItems.reduce(function (sum, item) { return sum + Math.round(qty(item.newReturnQty) * num(item.unitPrice)); }, 0)
      : oldReturn;
    var returnDelta = returnItems.length ? (returnAfter - oldReturn) : 0;
    var oldCash = num(row.cashAmount);
    var oldBank = num(row.bankAmount);
    var oldReward = num(row.rewardAmount) + num(row.offsetAmount);
    var newCash = num(byId('deliveryAdjustCashNew') ? byId('deliveryAdjustCashNew').value : oldCash);
    var newBank = num(byId('deliveryAdjustBankNew') ? byId('deliveryAdjustBankNew').value : oldBank);
    var newReward = num(byId('deliveryAdjustRewardNew') ? byId('deliveryAdjustRewardNew').value : oldReward);
    var cashDelta = (newCash - oldCash) + (newBank - oldBank) + (newReward - oldReward);
    var debtDelta = -returnDelta - cashDelta;
    return {
      returnItems: returnItems,
      oldReturn: oldReturn,
      returnAfter: returnAfter,
      returnDelta: returnDelta,
      oldCash: oldCash,
      oldBank: oldBank,
      oldReward: oldReward,
      newCash: newCash,
      newBank: newBank,
      newReward: newReward,
      cashDelta: cashDelta,
      debtDelta: debtDelta,
      finalDebtAfter: num(row.finalDebtAmount) + debtDelta
    };
  }

  function tabButton(key, label) {
    return '<button type="button" class="delivery-new-tab ' + (state.activeTab === key ? 'active' : '') + '" data-tab="' + key + '">' + esc(label) + '</button>';
  }

  function renderOverviewTab(row) {
    return '<div class="delivery-new-summary-grid">' +
      detailCell('Phải thu', money(row.originalAmount)) +
      detailCell('Tiền mặt', money(row.cashAmount)) +
      detailCell('Chuyển khoản', money(row.bankAmount)) +
      detailCell('Trả thưởng / đối trừ', money(num(row.rewardAmount) + num(row.offsetAmount))) +
      detailCell('Hàng trả', money(row.returnedAmount), 'delivery-new-return') +
      detailCell('Công nợ cuối', money(row.finalDebtAmount), num(row.finalDebtAmount) > 0 ? 'delivery-new-debt' : 'delivery-new-zero') +
      '</div>' +
      '<div class="delivery-new-safe-note">Công nợ cuối = Phải thu - Tiền mặt - Chuyển khoản - Trả thưởng - Hàng trả.</div>' +
      '<div class="delivery-new-safe-note">Trạng thái: ' + esc(statusLabel(row)) + ' · Version closeout: v' + esc(row.version || 0) + (row.correctionVersionApplied ? ' · Có version điều chỉnh' : '') + '</div>';
  }

  function renderDeliveryItemsTab(row) {
    if (!state.correctionReturnItems.length) {
      return '<div class="empty-state">Đơn này chưa có danh sách hàng giao đủ để nhập hàng trả.</div>';
    }
    var body = state.correctionReturnItems.map(function (item, index) {
      var newQty = qty(item.newReturnQty);
      var deltaQty = newQty - qty(item.oldReturnQty);
      var returnAmount = Math.round(newQty * num(item.unitPrice));
      var deltaAmount = Math.round(deltaQty * num(item.unitPrice));
      return '<tr>' +
        '<td>' + esc(item.productCode) + '</td>' +
        '<td>' + esc(item.productName) + '</td>' +
        '<td class="num">' + esc(item.deliveredQty) + '</td>' +
        '<td class="num">' + money(item.unitPrice) + '</td>' +
        '<td class="num">' + money(num(item.deliveredQty) * num(item.unitPrice)) + '</td>' +
        '<td class="num">' + esc(item.oldReturnQty) + '</td>' +
        '<td class="num"><input class="deliveryNewReturnQtyInput" data-index="' + index + '" inputmode="decimal" value="' + esc(item.newReturnQty) + '"></td>' +
        '<td class="num" data-delta-qty="' + index + '">' + esc(deltaQty) + '</td>' +
        '<td class="num delivery-new-return" data-return-amount="' + index + '">' + money(returnAmount) + '</td>' +
        '<td class="num delivery-new-return" data-delta-amount="' + index + '">' + money(deltaAmount) + '</td>' +
      '</tr>';
    }).join('');
    var totalDelivered = state.correctionReturnItems.reduce(function (sum, item) { return sum + Math.round(num(item.deliveredQty) * num(item.unitPrice)); }, 0);
    return '<table class="delivery-new-business-table"><thead><tr><th>Mã SP</th><th>Tên SP</th><th class="num">SL giao</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th class="num">SL trả hiện tại</th><th class="num">SL trả đúng</th><th class="num">Chênh lệch SL</th><th class="num">Thành tiền trả</th><th class="num">Chênh lệch tiền</th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="delivery-new-preview-cards">' +
        detailCell('Tổng hàng giao', money(totalDelivered)) +
        detailCell('Tổng hàng trả hiện tại', money(row.returnedAmount), 'delivery-new-return') +
        detailCell('Tổng hàng trả sau điều chỉnh', '<span id="deliveryReturnAfterText">' + money(row.returnedAmount) + '</span>', 'delivery-new-return') +
        detailCell('Chênh lệch hàng trả', '<span id="deliveryReturnDeltaText">0</span>', 'delivery-new-return') +
      '</div>';
  }

  function renderReturnOrdersBusiness(row) {
    var returns = Array.isArray(row && row.returnOrders) ? row.returnOrders : [];
    if (!returns.length) return '<div class="empty-state">Đơn này chưa có phiếu trả hàng hợp lệ.</div>';
    return returns.map(function (ro) {
      var items = Array.isArray(ro.items) ? ro.items : [];
      var rows = items.map(function (item) {
        return '<tr><td>' + esc(item.productCode || '') + '</td><td>' + esc(item.productName || '') + '</td><td class="num">' + esc(item.returnQty || item.quantity || item.qty || '') + '</td><td class="num">' + money(item.unitPrice) + '</td><td class="num delivery-new-return">' + money(item.amount) + '</td></tr>';
      }).join('');
      return '<div class="delivery-new-history-block"><h4>Phiếu ' + esc(ro.code || ro.id || '') + ' · Ngày ' + esc(ro.returnDate || '') + ' · Trạng thái ' + esc(ro.status || '') + '</h4>' +
        '<table class="delivery-new-business-table"><thead><tr><th>Mã SP</th><th>Tên SP</th><th class="num">SL trả</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">Phiếu trả chưa có chi tiết mặt hàng.</td></tr>') + '</tbody></table>' +
        (ro.note ? '<div class="delivery-new-returnorder-note">Ghi chú: ' + esc(ro.note) + '</div>' : '') +
      '</div>';
    }).join('');
  }

  function renderReturnTab(row) {
    var previewRows = currentReturnEditItems().filter(function (item) { return qty(item.adjustmentQty) !== 0 || qty(item.newReturnQty) !== qty(item.oldReturnQty); }).map(function (item) {
      return '<tr><td>' + esc(item.productCode) + '</td><td>' + esc(item.productName) + '</td><td class="num">' + esc(item.oldReturnQty) + '</td><td class="num">' + esc(item.newReturnQty) + '</td><td class="num">' + esc(item.adjustmentQty) + '</td><td class="num delivery-new-return">' + money(item.adjustmentAmount) + '</td></tr>';
    }).join('');
    return '<h4>Phiếu trả hiện tại</h4>' + renderReturnOrdersBusiness(row) +
      '<h4>Preview điều chỉnh từ Tab Hàng giao</h4>' +
      '<table class="delivery-new-business-table"><thead><tr><th>Mã SP</th><th>Tên SP</th><th class="num">SL trả hiện tại</th><th class="num">SL trả đúng</th><th class="num">Chênh lệch SL</th><th class="num">Chênh lệch tiền</th></tr></thead><tbody>' +
      (previewRows || '<tr><td colspan="6">Chưa có chênh lệch hàng trả.</td></tr>') +
      '</tbody></table>';
  }

  function renderPaymentTab(row) {
    var reward = num(row.rewardAmount) + num(row.offsetAmount);
    return '<div class="delivery-new-form-grid">' +
      '<label>Tiền mặt hiện tại<input disabled value="' + esc(money(row.cashAmount)) + '"></label>' +
      '<label>Tiền mặt đúng<input id="deliveryAdjustCashNew" inputmode="numeric" value="' + esc(row.cashAmount || 0) + '"></label>' +
      '<label>Chuyển khoản hiện tại<input disabled value="' + esc(money(row.bankAmount)) + '"></label>' +
      '<label>Chuyển khoản đúng<input id="deliveryAdjustBankNew" inputmode="numeric" value="' + esc(row.bankAmount || 0) + '"></label>' +
      '<label>Trả thưởng hiện tại<input disabled value="' + esc(money(reward)) + '"></label>' +
      '<label>Trả thưởng đúng<input id="deliveryAdjustRewardNew" inputmode="numeric" value="' + esc(reward) + '"></label>' +
      '</div>' +
      '<div class="delivery-new-preview-cards">' +
        detailCell('Chênh lệch tiền mặt', '<span id="deliveryCashDeltaText">0</span>') +
        detailCell('Chênh lệch chuyển khoản', '<span id="deliveryBankDeltaText">0</span>') +
        detailCell('Chênh lệch trả thưởng', '<span id="deliveryRewardDeltaText">0</span>') +
        detailCell('Tổng chênh lệch tiền thu', '<span id="deliveryCashTotalDeltaText">0</span>') +
      '</div>' +
      '<div class="delivery-new-safe-note">Sửa tiền thu sau xác nhận kế toán chỉ tạo version điều chỉnh, không sinh AR-RECEIPT trực tiếp.</div>';
  }

  function renderDebtTab(row) {
    var totals = totalsFromPopup(row);
    var impact = totals.debtDelta > 0 ? 'Tăng ' + money(totals.debtDelta) : totals.debtDelta < 0 ? 'Giảm ' + money(Math.abs(totals.debtDelta)) : 'Không đổi';
    return '<div class="delivery-new-preview-cards">' +
      detailCell('Công nợ hiện tại', money(row.finalDebtAmount), num(row.finalDebtAmount) > 0 ? 'delivery-new-debt' : 'delivery-new-zero') +
      detailCell('Chênh lệch hàng trả', money(totals.returnDelta), 'delivery-new-return') +
      detailCell('Chênh lệch tiền thu', money(totals.cashDelta)) +
      detailCell('Công nợ sau điều chỉnh', money(totals.finalDebtAfter), totals.finalDebtAfter > 0 ? 'delivery-new-debt' : 'delivery-new-zero') +
      '</div><div class="delivery-new-safe-note">Tác động công nợ: ' + esc(impact) + '. Công thức: công nợ điều chỉnh = - chênh lệch hàng trả - chênh lệch tiền thu.</div>';
  }

  function renderHistoryTab(row) {
    var versions = state.versionCache[rowKey(row)] || [];
    var versionRows = versions.map(function (v) {
      return '<tr><td>v' + esc(v.closeoutVersion || '?') + '</td><td>' + money(v.returnAdjustmentAmount) + '</td><td>' + money(v.cashAdjustmentAmount) + '</td><td>' + money(v.debtAdjustmentAmount) + '</td><td>' + esc(v.reason || v.status || '') + '</td></tr>';
    }).join('');
    return '<h4>Lịch sử phiếu trả</h4>' + renderReturnOrdersBusiness(row) +
      '<h4>Lịch sử closeout version / điều chỉnh</h4>' +
      '<table class="delivery-new-business-table"><thead><tr><th>Version</th><th class="num">CL hàng trả</th><th class="num">CL tiền thu</th><th class="num">CL công nợ</th><th>Lý do / trạng thái</th></tr></thead><tbody>' + (versionRows || '<tr><td colspan="5">Chưa có version điều chỉnh.</td></tr>') + '</tbody></table>';
  }

  function renderAdjustmentTab(row) {
    if (!state.adjustmentRow) return;
    var panel = byId('deliveryTodayNewAdjustmentContent');
    if (!panel) return;
    var html = '';
    if (state.activeTab === 'overview') html = renderOverviewTab(row);
    if (state.activeTab === 'delivery') html = renderDeliveryItemsTab(row);
    if (state.activeTab === 'returns') html = renderReturnTab(row);
    if (state.activeTab === 'payments') html = renderPaymentTab(row);
    if (state.activeTab === 'debt') html = renderDebtTab(row);
    if (state.activeTab === 'history') html = renderHistoryTab(row);
    panel.innerHTML = html;
    bindAdjustmentInputs(row);
    updateAdjustmentPreview(row);
  }

  function bindAdjustmentInputs(row) {
    Array.prototype.forEach.call(document.querySelectorAll('.deliveryNewReturnQtyInput'), function (input) {
      input.addEventListener('input', function () {
        var idx = Number(input.dataset.index);
        var value = qty(input.value);
        if (value < 0) {
          input.value = 0;
          setMessage('Số lượng trả không được âm.', true);
          value = 0;
        }
        var item = state.correctionReturnItems[idx];
        if (item && value > qty(item.deliveredQty)) {
          input.value = item.deliveredQty;
          setMessage('Số lượng trả không được vượt quá số lượng giao.', true);
        }
        if (item) item.newReturnQty = qty(input.value);
        renderAdjustmentTab(row);
      });
    });
    ['deliveryAdjustCashNew', 'deliveryAdjustBankNew', 'deliveryAdjustRewardNew'].forEach(function (id) {
      var el = byId(id);
      if (el) el.addEventListener('input', function () { updateAdjustmentPreview(row); });
    });
  }

  function setText(id, value) {
    var el = byId(id);
    if (el) el.textContent = value;
  }

  function updateAdjustmentPreview(row) {
    var totals = totalsFromPopup(row);
    totals.returnItems.forEach(function (item, index) {
      setText('deliveryDeltaQty' + index, item.adjustmentQty);
    });
    setText('deliveryReturnAfterText', money(totals.returnAfter));
    setText('deliveryReturnDeltaText', money(totals.returnDelta));
    setText('deliveryCashDeltaText', money(totals.newCash - totals.oldCash));
    setText('deliveryBankDeltaText', money(totals.newBank - totals.oldBank));
    setText('deliveryRewardDeltaText', money(totals.newReward - totals.oldReward));
    setText('deliveryCashTotalDeltaText', money(totals.cashDelta));
  }

  function openAdjustmentPopup(row) {
    if (!row) return;
    var modal = byId('deliveryTodayNewAdjustmentModal');
    if (!modal) return;
    state.adjustmentRow = row;
    state.activeTab = 'overview';
    state.correctionReturnItems = buildReturnEditItems(row);
    modal.hidden = false;
    modal.innerHTML = '' +
      '<div class="delivery-new-adjustment-dialog">' +
        '<div class="delivery-new-modal-header">' +
          '<div><h3>Điều chỉnh đơn giao - ' + esc(row.orderCode || row.orderId) + '</h3>' +
            '<small>' + esc(row.customerCode || '') + ' - ' + esc(row.customerName || '') + '</small>' +
            '<small>NVBH: ' + esc((row.salesStaffCode || '') + ' - ' + (row.salesStaffName || '')) + ' · NVGH: ' + esc((row.deliveryStaffCode || '') + ' - ' + (row.deliveryStaffName || '')) + ' · Ngày giao: ' + esc(row.deliveryDate || '') + ' · Trạng thái: ' + esc(statusLabel(row)) + '</small></div>' +
          '<button type="button" id="deliveryTodayNewModalCloseTop" class="delivery-new-modal-close">Đóng</button>' +
        '</div>' +
        (isConfirmed(row) ? '<div class="delivery-new-safe-note">Đơn đã xác nhận kế toán. Mọi thay đổi sẽ tạo version mới, không sửa bản cũ.</div>' : '<div class="delivery-new-safe-note">Đơn chưa xác nhận kế toán. Vui lòng xử lý hàng trả ở luồng giao hàng hiện tại.</div>') +
        '<div class="delivery-new-tabs">' +
          tabButton('overview', 'Tổng quan') +
          tabButton('delivery', 'Hàng giao') +
          tabButton('returns', 'Hàng trả') +
          tabButton('payments', 'Thu tiền') +
          tabButton('debt', 'Công nợ') +
          tabButton('history', 'Lịch sử') +
        '</div>' +
        '<div id="deliveryTodayNewAdjustmentContent" class="delivery-new-tab-panel"></div>' +
        '<div class="delivery-new-modal-footer">' +
          '<label>Lý do điều chỉnh<input id="deliveryAdjustmentReason" placeholder="Vui lòng nhập lý do điều chỉnh"></label>' +
          '<label>Ghi chú<input id="deliveryAdjustmentNote" placeholder="Ghi chú thêm nếu có"></label>' +
          '<button type="button" id="deliveryAdjustmentClose" class="secondary">Đóng</button>' +
          '<button type="button" id="deliveryAdjustmentSave" class="primary-action">Lưu điều chỉnh</button>' +
        '</div>' +
      '</div>';

    Array.prototype.forEach.call(modal.querySelectorAll('[data-tab]'), function (btn) {
      btn.addEventListener('click', function () {
        state.activeTab = btn.dataset.tab;
        modal.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === state.activeTab); });
        renderAdjustmentTab(row);
      });
    });
    var closeTop = byId('deliveryTodayNewModalCloseTop');
    var closeBottom = byId('deliveryAdjustmentClose');
    if (closeTop) closeTop.addEventListener('click', closeAdjustmentPopup);
    if (closeBottom) closeBottom.addEventListener('click', closeAdjustmentPopup);
    var save = byId('deliveryAdjustmentSave');
    if (save) save.addEventListener('click', function () { submitAdjustmentPopup(row); });
    renderAdjustmentTab(row);
    loadVersions(row).then(function () {
      if (state.adjustmentRow && rowKey(state.adjustmentRow) === rowKey(row) && state.activeTab === 'history') renderAdjustmentTab(row);
    }).catch(function () {});
  }

  function closeAdjustmentPopup() {
    var modal = byId('deliveryTodayNewAdjustmentModal');
    if (modal) { modal.hidden = true; modal.innerHTML = ''; }
    state.adjustmentRow = null;
    state.correctionReturnItems = [];
    state.activeTab = 'overview';
  }

  async function submitAdjustmentPopup(row) {
    if (!isConfirmed(row)) {
      setMessage('Đơn chưa xác nhận kế toán. Vui lòng xử lý hàng trả ở luồng giao hàng hiện tại.', true);
      return;
    }
    var reasonEl = byId('deliveryAdjustmentReason');
    var noteEl = byId('deliveryAdjustmentNote');
    var reason = reasonEl ? reasonEl.value.trim() : '';
    var note = noteEl ? noteEl.value.trim() : '';
    if (!reason) { setMessage('Vui lòng nhập lý do điều chỉnh.', true); return; }

    var totals = totalsFromPopup(row);
    var correctedReturnItems = totals.returnItems.filter(function (item) { return qty(item.adjustmentQty) !== 0; });
    var cashLines = [
      { paymentMethod: 'cash', oldAmount: totals.oldCash, newAmount: totals.newCash, adjustmentAmount: totals.newCash - totals.oldCash },
      { paymentMethod: 'bank', oldAmount: totals.oldBank, newAmount: totals.newBank, adjustmentAmount: totals.newBank - totals.oldBank },
      { paymentMethod: 'reward', oldAmount: totals.oldReward, newAmount: totals.newReward, adjustmentAmount: totals.newReward - totals.oldReward }
    ].filter(function (line) { return num(line.adjustmentAmount) !== 0; });

    if (!correctedReturnItems.length && !cashLines.length) {
      setMessage('Không có chênh lệch để điều chỉnh.', true);
      return;
    }
    if (correctedReturnItems.some(function (item) { return qty(item.newReturnQty) < 0; })) {
      setMessage('Số lượng trả không được âm.', true);
      return;
    }
    if (correctedReturnItems.some(function (item) { return qty(item.newReturnQty) > qty(item.deliveredQty); })) {
      setMessage('Số lượng trả không được vượt quá số lượng giao.', true);
      return;
    }

    try {
      var res = await fetch(correctionEndpoint(row), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correctedReturnItems: correctedReturnItems,
          correctedCashLines: cashLines,
          reason: reason,
          note: note
        })
      });
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tạo được điều chỉnh');
      closeAdjustmentPopup();
      setMessage('Đã lưu điều chỉnh và tạo version mới.');
      await load();
    } catch (err) {
      setMessage(err.message || 'Không tạo được điều chỉnh', true);
    }
  }

  function renderCachedVersions(row) {
    if (!row) return;
    if (state.adjustmentRow && rowKey(state.adjustmentRow) === rowKey(row) && state.activeTab === 'history') {
      renderAdjustmentTab(row);
    }
  }

  async function loadVersions(row) {
    try {
      var res = await fetch(versionsEndpoint(row));
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được version');
      state.versionCache[rowKey(row)] = json.versions || json.rows || [];
      renderCachedVersions(row);
      setMessage('Đã tải lịch sử version.');
    } catch (err) {
      setMessage(err.message || 'Không tải được lịch sử version', true);
    }
  }

  async function load() {
    ensureRoot();
    if (!hasValidSearchCriteria()) {
      resetResultsState('Vui lòng nhập ít nhất một điều kiện tìm kiếm.');
      setMessage('Vui lòng nhập ít nhất một điều kiện tìm kiếm.', true);
      return;
    }
    setMessage('Đang tải đơn giao hôm nay...');
    try {
      var params = new URLSearchParams(filters());
      var res = await fetch('/api/new/delivery-today/orders?' + params.toString());
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được dữ liệu');
      var data = json.data || json;
      state.rows = data.rows || data.orders || json.rows || [];
      state.salesmanGroups = buildSalesmanGroups(state.rows);
      state.selectedSalesmanKeys = {};
      state.selectedOrderIds = new Set();
      state.salesmanGroups.forEach(function (group) { state.selectedSalesmanKeys[group.key] = true; });
      state.selectedIndex = state.rows.length ? 0 : -1;
      state.loaded = true;
      state.hasSearched = true;
      setResultSectionsVisible(true);
      applySummary(data.summary || json.summary || {});
      renderSalesmanGroupPanel();
      renderRows();
      setMessage('Đã tải ' + state.rows.length + ' đơn.');
    } catch (err) {
      state.rows = [];
      state.salesmanGroups = [];
      state.selectedSalesmanKeys = {};
      state.selectedOrderIds = new Set();
      state.hasSearched = true;
      setResultSectionsVisible(true);
      applySummary({});
      renderSalesmanGroupPanel();
      renderRows();
      setMessage(err.message || 'Không tải được Đơn giao hôm nay (New)', true);
    }
  }

  function initWhenTabActive(tabId) {
    if (tabId !== 'deliveryTodayNewTab') return;
    ensureRoot();
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureRoot();
    Array.prototype.forEach.call(document.querySelectorAll('.tab-button[data-tab="deliveryTodayNewTab"]'), function (button) {
      button.addEventListener('click', function () { initWhenTabActive('deliveryTodayNewTab'); });
    });
  });

  window.loadDeliveryTodayNew = load;
}());
