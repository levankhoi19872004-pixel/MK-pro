(function () {
  'use strict';

  var rootId = 'deliveryTodayNewRoot';
  var state = {
    rows: [], selectedIndex: -1, loaded: false, hasSearched: false, userTouchedFilters: false, deliveryDateTouched: false, loadRequestSeq: 0,
    selectedFilters: { orderCode: '', customerCode: '', salesStaffCode: '', deliveryStaffCode: '' },
    suggest: {
      timers: {},
      requestSeq: { search: 0, salesman: 0, delivery: 0 },
      items: { search: [], salesman: [], delivery: [] },
      active: { search: -1, salesman: -1, delivery: -1 },
      loading: { search: false, salesman: false, delivery: false }
    },
    versionCache: {}, correctionReturnItems: [], adjustmentRow: null, adjustmentViewOnly: false, activeTab: 'overview', selectedSalesmanKeys: {}, salesmanGroups: [], selectedOrderIds: new Set(), closeoutBusy: false, bulkAdjustmentBusy: false, modalNotice: { closeout: null, adjustment: null }, modalLoading: { closeout: false, adjustment: false }, deepLinkTargetKey: '', deepLinkRequestSeq: 0, deepLinkAppliedHash: '', commandLocks: {}, loadAbortController: null
  };

  function byId(id) { return document.getElementById(id); }
  function commandLockKey(key) { return String(key || 'command'); }
  async function runCommandOnce(key, fn) {
    var lockKey = commandLockKey(key);
    if (state.commandLocks && state.commandLocks[lockKey]) return null;
    state.commandLocks = state.commandLocks || {};
    state.commandLocks[lockKey] = true;
    try {
      return await fn();
    } finally {
      state.commandLocks[lockKey] = false;
    }
  }
  async function readJsonResponse(res, fallbackMessage) {
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || fallbackMessage || 'Thao tác không thành công');
    return json;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function parseVietnameseMoney(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
    var raw = String(value).trim();
    if (!raw) return 0;
    var compact = raw.replace(/\s/g, '');
    var sign = compact.charAt(0) === '-' ? '-' : '';
    var unsigned = sign ? compact.slice(1) : compact;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(unsigned)) {
      var vn = sign + unsigned.replace(/\./g, '').replace(',', '.');
      var vnNumber = Number(vn);
      return Number.isFinite(vnNumber) ? Math.round(vnNumber) : 0;
    }
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(unsigned)) {
      var en = sign + unsigned.replace(/,/g, '');
      var enNumber = Number(en);
      return Number.isFinite(enNumber) ? Math.round(enNumber) : 0;
    }
    var fallback = Number(compact.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(fallback) ? Math.round(fallback) : 0;
  }
  function formatVietnameseMoney(value) {
    return parseVietnameseMoney(value).toLocaleString('vi-VN');
  }
  function num(value) { return parseVietnameseMoney(value); }
  function money(value) { return formatVietnameseMoney(value); }
  function moneyDash(value) {
    var n = num(value);
    return n === 0 ? '-' : money(n);
  }
  function deltaMoney(value) {
    var n = parseVietnameseMoney(value);
    if (n > 0) return '+' + money(n);
    if (n < 0) return '-' + money(Math.abs(n));
    return '0';
  }

  function hasMoneyInputValue(input) {
    return input != null && String(input).trim() !== '';
  }
  function readCorrectedMoney(inputValue, fallbackValue) {
    if (!hasMoneyInputValue(inputValue)) {
      return Number(fallbackValue || 0);
    }
    return parseVietnameseMoney(inputValue);
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function isConfirmed(row) { return row && (row.accountingConfirmed || row.accountingStatus === 'confirmed' || row.deliveryCloseoutStatus === 'closed' || row.closeoutStatus === 'accounting_confirmed' || row.closeoutStatus === 'corrected_confirmed'); }
  function statusLabel(row) {
    if (row && (row.deliveryCloseoutStatus === 'closed' || row.closeoutStatus === 'accounting_confirmed' || row.accountingConfirmed || row.accountingStatus === 'confirmed')) return 'Đã chốt sổ';
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
        '<div class="delivery-new-header-top">' +
          '<div class="delivery-new-title-block"><h2>Đơn giao hôm nay (New)</h2></div>' +
          '<details class="delivery-new-flow-help"><summary aria-label="Xem luồng xử lý">?</summary><div><b>Luồng xử lý</b><span>Giao hàng → Thu tiền → Chốt kế toán. Đơn đã xác nhận chỉ điều chỉnh bằng phiên bản mới.</span></div></details>' +
        '</div>' +
        '<div class="delivery-v46-filters delivery-new-filter-bar">' +
          '<label class="delivery-new-filter-date">Ngày giao<div class="filter-input-wrap"><input id="deliveryTodayNewDate" type="date"><button id="deliveryTodayNewDateClear" type="button" class="filter-clear-btn delivery-new-filter-clear" data-delivery-clear="date" aria-label="Đưa ngày giao về mặc định" title="Đưa về hôm nay" hidden>×</button></div></label>' +
          '<label class="delivery-v46-filter-suggest delivery-new-filter-delivery searchable-select-field">NVGH<div class="filter-input-wrap"><input id="deliveryTodayNewDelivery" autocomplete="off" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-searchable-select="delivery" placeholder="Click chọn NVGH"><button id="deliveryTodayNewDeliveryClear" type="button" class="filter-clear-btn delivery-new-filter-clear" data-delivery-clear="delivery" aria-label="Xóa điều kiện NVGH" title="Xóa điều kiện" hidden>×</button></div><div id="deliveryTodayNewDeliverySuggestions" class="delivery-v46-suggest-box"></div></label>' +
          '<label class="delivery-v46-filter-suggest delivery-new-filter-salesman searchable-select-field">NVBH<div class="filter-input-wrap"><input id="deliveryTodayNewSalesman" autocomplete="off" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-searchable-select="salesman" placeholder="Click chọn NVBH"><button id="deliveryTodayNewSalesmanClear" type="button" class="filter-clear-btn delivery-new-filter-clear" data-delivery-clear="salesman" aria-label="Xóa điều kiện NVBH" title="Xóa điều kiện" hidden>×</button></div><div id="deliveryTodayNewSalesmanSuggestions" class="delivery-v46-suggest-box"></div></label>' +
          '<label class="delivery-v46-filter-suggest delivery-new-filter-search searchable-select-field">Tìm kiếm<div class="filter-input-wrap"><input id="deliveryTodayNewSearch" autocomplete="off" role="combobox" aria-haspopup="listbox" aria-expanded="false" data-searchable-select="orderCustomer" placeholder="Mã đơn / khách hàng"><button id="deliveryTodayNewSearchClear" type="button" class="filter-clear-btn delivery-new-filter-clear" data-delivery-clear="search" aria-label="Xóa điều kiện tìm kiếm" title="Xóa điều kiện" hidden>×</button></div><div id="deliveryTodayNewSearchSuggestions" class="delivery-v46-suggest-box"></div></label>' +
          '<div class="delivery-new-filter-actions"><button id="deliveryTodayNewLoad" type="button">Tải đơn</button><button id="deliveryTodayNewReset" type="button" class="secondary">Xóa lọc</button></div>' +
        '</div>' +
        '<p id="deliveryTodayNewMessage" class="message delivery-new-filter-message"></p>' +
        '<div id="deliveryTodayNewSourceNote" class="delivery-new-source-note"></div>' +
      '</section>' +
      '<section id="deliveryTodayNewEmptyState" class="card delivery-new-empty-state"><b>Chưa có dữ liệu</b><span>Chọn bộ lọc rồi bấm Tải đơn.</span></section>' +
      '<section class="delivery-v46-kpis delivery-new-kpis" aria-label="KPI Đơn giao hôm nay New">' +
        '<div class="delivery-v46-kpi kpi-pt"><span>Phải thu</span><b id="deliveryTodayNewOriginal">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-tm"><span>Tiền mặt</span><b id="deliveryTodayNewCash">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-ck"><span>Chuyển khoản</span><b id="deliveryTodayNewBank">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-th"><span>Trả thưởng</span><b id="deliveryTodayNewReward">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-ht"><span>Hàng trả</span><b id="deliveryTodayNewReturned">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-cn"><span>Còn nợ</span><b id="deliveryTodayNewDebt">0</b></div>' +
      '</section>' +
      '<section id="deliveryTodayNewSalesmanPanel" class="card delivery-new-salesman-panel">' +
        '<div class="delivery-new-salesman-empty">Tải đơn để xem NVBH thuộc NVGH đang chọn.</div>' +
      '</section>' +
      '<main class="delivery-new-main-list">' +
        '<section class="card delivery-v46-list-panel delivery-new-list-panel-full">' +
          '<div class="delivery-v46-panel-title delivery-v46-panel-title-with-actions delivery-new-orders-toolbar"><h3>Danh sách đơn</h3><div class="delivery-v46-list-actions delivery-new-closeout-toolbar"><span id="deliveryTodayNewOrderCount">0 đơn</span><span id="deliveryTodayNewSelectionCount" class="delivery-new-selection-count">0 đơn được chọn</span><button id="deliveryTodayNewSelectAllOrders" type="button" class="secondary">Chọn tất cả</button><button id="deliveryTodayNewClearOrders" type="button" class="secondary">Bỏ chọn</button><button id="deliveryTodayNewBulkAdjustmentCommit" type="button" class="secondary delivery-new-bulk-adjustment-btn" disabled>Ghi nhận điều chỉnh đã chọn</button><button id="deliveryTodayNewCloseout" type="button" class="primary-action delivery-new-closeout-btn" disabled>Chốt sổ giao hàng</button></div></div>' +
          '<div class="delivery-new-orders-table">' +
            '<div class="delivery-new-orders-header delivery-new-order-grid" role="row">' +
              '<div class="delivery-new-order-cell delivery-new-order-checkbox-cell"><input id="deliveryTodayNewHeaderSelectAllOrders" type="checkbox" aria-label="Chọn tất cả đơn để xem KPI"></div>' +
              '<div class="delivery-new-order-cell delivery-new-order-customer-cell">Đơn / Khách hàng</div>' +
              '<div class="delivery-new-order-cell delivery-new-staff-cell">NVBH</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell">Phải thu</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell">Tiền mặt</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell">Chuyển khoản</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell">Trả thưởng</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell delivery-new-return">Hàng trả</div>' +
              '<div class="delivery-new-order-cell delivery-new-money-cell delivery-new-debt">Còn nợ</div>' +
              '<div class="delivery-new-order-cell delivery-new-status-cell">Trạng thái</div>' +
              '<div class="delivery-new-order-cell delivery-new-action-cell">Thao tác</div>' +
            '</div>' +
            '<div id="deliveryTodayNewTable" class="delivery-v46-list delivery-new-orders-body"><div class="empty-state">Chưa tải đơn.</div></div>' +
          '</div>' +
        '</section>' +
      '</main>' +
      '<section id="deliveryTodayNewAdjustmentModal" class="delivery-new-modal-backdrop" hidden></section>' +
      '<section id="deliveryTodayNewCloseoutModal" class="delivery-new-modal-backdrop" hidden></section>';

    var dateInput = byId('deliveryTodayNewDate');
    if (dateInput && !dateInput.value) dateInput.value = today();
    if (dateInput) {
      dateInput.addEventListener('change', function () {
        state.deliveryDateTouched = true;
        state.userTouchedFilters = true;
        updateClearButtons();
        resetResultsState();
        setMessage('');
      });
    }
    var loadButton = byId('deliveryTodayNewLoad');
    var resetButton = byId('deliveryTodayNewReset');
    if (loadButton) loadButton.addEventListener('click', load);
    if (resetButton) resetButton.addEventListener('click', resetFiltersToEmptyState);
    var closeoutButton = byId('deliveryTodayNewCloseout');
    if (closeoutButton) closeoutButton.addEventListener('click', openCloseoutModal);
    var bulkAdjustmentButton = byId('deliveryTodayNewBulkAdjustmentCommit');
    if (bulkAdjustmentButton) bulkAdjustmentButton.addEventListener('click', submitBulkAdjustmentCommit);
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
    ensureScopedStyle();
    bindFilterAutocomplete();
    document.addEventListener('click', function (event) {
      if (!event.target || !event.target.closest || !event.target.closest('.delivery-v46-filter-suggest')) closeAllSuggestions();
    });
    resetResultsState();
    return root;
  }

  function ensureScopedStyle() {
    if (document.getElementById('deliveryTodayNewScopedStyle')) return;
    var style = document.createElement('style');
    style.id = 'deliveryTodayNewScopedStyle';
    style.textContent = '' +
      '.delivery-new-header.delivery-v46-header{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:12px;}.delivery-new-header-top{display:flex;align-items:center;justify-content:space-between;gap:12px;}.delivery-new-title-block h2{margin:0;}.delivery-new-flow-help{position:relative;margin-left:auto;}.delivery-new-flow-help summary{list-style:none;width:30px;height:30px;border-radius:999px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-weight:900;cursor:pointer;user-select:none;}.delivery-new-flow-help summary::-webkit-details-marker{display:none;}.delivery-new-flow-help div{position:absolute;right:0;top:38px;z-index:30;width:min(420px,70vw);padding:10px 12px;border:1px solid #bfdbfe;border-radius:12px;background:#fff;box-shadow:0 14px 30px rgba(15,23,42,.14);color:#334155;}.delivery-new-flow-help div b{display:block;margin-bottom:4px;color:#0f172a;}.delivery-new-flow-help div span{display:block;font-size:12px;line-height:1.4;}.delivery-new-filter-bar.delivery-v46-filters{display:grid;width:100%;grid-template-columns:minmax(140px,160px) minmax(200px,240px) minmax(200px,240px) minmax(280px,1fr) minmax(238px,auto);gap:10px;align-items:end;margin-top:0;}.delivery-new-filter-bar label{min-width:0;}.delivery-new-filter-search{min-width:280px;}.delivery-new-filter-actions{display:flex;gap:8px;align-items:end;justify-content:flex-end;min-width:238px;}.delivery-new-filter-actions button{height:38px;white-space:nowrap;}.delivery-new-filter-actions #deliveryTodayNewLoad{min-width:120px;}.delivery-new-filter-actions #deliveryTodayNewReset{min-width:108px;}.delivery-new-filter-message{margin:0;min-height:0;}.delivery-new-filter-message:empty{display:none;}@media(max-width:1280px){.delivery-new-filter-bar.delivery-v46-filters{grid-template-columns:minmax(140px,160px) minmax(200px,1fr) minmax(200px,1fr);}.delivery-new-filter-search{grid-column:1 / 3;}.delivery-new-filter-actions{grid-column:3 / 4;min-width:238px;}}@media(max-width:900px){.delivery-new-filter-bar.delivery-v46-filters{grid-template-columns:1fr 1fr;}.delivery-new-filter-date,.delivery-new-filter-delivery,.delivery-new-filter-salesman,.delivery-new-filter-search,.delivery-new-filter-actions{grid-column:auto;}.delivery-new-filter-search,.delivery-new-filter-actions{grid-column:1 / -1;}.delivery-new-filter-actions{justify-content:flex-end;}}@media(max-width:640px){.delivery-new-filter-bar.delivery-v46-filters{grid-template-columns:1fr;}.delivery-new-filter-date,.delivery-new-filter-delivery,.delivery-new-filter-salesman,.delivery-new-filter-search,.delivery-new-filter-actions{grid-column:1 / -1;}.delivery-new-filter-actions{justify-content:stretch;min-width:0;}.delivery-new-filter-actions button{flex:1;min-width:0;}}' +
      '.delivery-new-main-list{display:block;}.delivery-v46-filters .filter-input-wrap{position:relative;width:100%;}.delivery-v46-filters .filter-input-wrap input,.delivery-v46-filters .filter-input-wrap select{padding-right:34px;box-sizing:border-box;}.delivery-v46-filters .filter-clear-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:22px;height:22px;border:0;border-radius:999px;background:transparent;color:#64748b;cursor:pointer;font-size:17px;line-height:20px;font-weight:900;z-index:3;}.delivery-v46-filters .filter-clear-btn:hover{color:#ef4444;background:#fee2e2;}.delivery-v46-filters .filter-clear-btn[hidden]{display:none!important;}.delivery-new-list-panel-full{width:100%;}.delivery-new-empty-state{margin:12px 0;padding:20px;text-align:center;border:1px dashed #cbd5e1;background:#f8fafc;color:#334155;}.delivery-new-empty-state b{display:block;font-size:16px;margin-bottom:6px;color:#0f172a;}.delivery-new-empty-state span{display:block;color:#64748b;font-weight:700;}.delivery-new-results-hidden{display:none!important;}.delivery-new-salesman-panel{margin:12px 0;padding:0;overflow:hidden;}.delivery-new-salesman-empty{padding:14px;color:#64748b;text-align:center;border:1px dashed #cbd5e1;border-radius:12px;}.delivery-new-salesman-compact-header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:10px 12px;border-bottom:1px solid #dbe7f5;}.delivery-new-salesman-compact-header h3{margin:0;font-size:15px;}.delivery-new-salesman-compact-header small{display:block;color:#64748b;font-weight:800;margin-top:2px;}.delivery-new-salesman-grid-wrap{overflow-x:auto;overflow-y:visible;max-height:none;}.delivery-new-salesman-grid-wrap.is-scrollable{max-height:260px;overflow-y:auto;}.delivery-new-salesman-grid{display:grid;grid-template-columns:42px minmax(220px,1.6fr) 70px repeat(6,minmax(92px,1fr));min-width:980px;align-items:center;}.delivery-new-salesman-grid-head{position:sticky;top:0;z-index:2;background:#f8fafc;color:#334155;font-size:12px;font-weight:900;border-bottom:1px solid #dbe7f5;}.delivery-new-salesman-grid-row{display:grid;min-height:40px;border-bottom:1px solid #e2e8f0;}.delivery-new-salesman-grid-cell{padding:8px 10px;min-width:0;box-sizing:border-box;}.delivery-new-salesman-grid-row .delivery-new-salesman-grid-cell{border-bottom:0;}.delivery-new-salesman-grid-row.is-selected .delivery-new-salesman-grid-cell{background:#eff6ff;}.delivery-new-salesman-grid-row.is-unselected .delivery-new-salesman-grid-cell{background:#f8fafc;color:#94a3b8;}.delivery-new-salesman-check-cell{display:flex;justify-content:center;align-items:center;}.delivery-new-salesman-check-cell input{width:16px;height:16px;accent-color:#2563eb;}.delivery-new-salesman-name{font-weight:900;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.delivery-new-salesman-grid-row.is-unselected .delivery-new-salesman-name{color:#64748b;}.delivery-new-salesman-num,.delivery-new-salesman-money{text-align:right;font-variant-numeric:tabular-nums;font-weight:850;white-space:nowrap;}.delivery-new-money-dash{color:#94a3b8;font-weight:700;}.delivery-new-salesman-money.reward-positive{color:#c05621;}.delivery-new-salesman-money.bank-positive{color:#047857;}.delivery-new-orders-toolbar{align-items:center;gap:12px;}.delivery-new-selection-count{font-weight:800;color:#475569;white-space:nowrap;}.delivery-new-closeout-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}.delivery-new-closeout-toolbar .secondary{padding:7px 10px;border-radius:10px;}.delivery-new-closeout-btn[disabled]{opacity:.55;cursor:not-allowed;}.delivery-new-bulk-adjustment-btn[disabled]{opacity:.55;cursor:not-allowed;}.delivery-new-closeout-warning{padding:10px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-weight:800;margin:10px 0;}.delivery-new-orders-table{overflow-x:auto;border-top:1px solid #dbe7f5;}.delivery-new-order-grid{display:grid;grid-template-columns:32px minmax(240px,1.7fr) minmax(120px,.75fr) minmax(110px,.8fr) minmax(110px,.8fr) minmax(124px,.85fr) minmax(110px,.8fr) minmax(110px,.8fr) minmax(110px,.8fr) minmax(104px,.72fr) minmax(96px,.68fr);gap:9px;align-items:center;min-width:1360px;}.delivery-new-orders-header{position:sticky;top:0;z-index:2;background:#f8fafc;border-bottom:1px solid #dbe7f5;padding:8px 12px;color:#334155;font-size:12px;font-weight:900;letter-spacing:.01em;}.delivery-new-order-row{padding:8px 12px;border-bottom:1px solid #dbe7f5;background:#fff;}.delivery-new-order-row.selected{background:#eff6ff;}.delivery-new-order-cell{min-width:0;}.delivery-new-order-checkbox-cell{display:flex;justify-content:center;align-items:center;}.delivery-new-order-checkbox-cell input{width:16px;height:16px;accent-color:#2563eb;}.delivery-new-order-customer-cell{text-align:left;min-width:0;}.delivery-new-money-cell{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;font-weight:850;}.delivery-new-staff-cell{font-size:12px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.delivery-new-status-cell{text-align:center;display:flex;justify-content:center;align-items:center;}.delivery-new-action-cell{text-align:right;display:flex;justify-content:flex-end;align-items:center;}.delivery-new-row-action button{padding:5px 8px;border-radius:9px;font-size:12px;}.delivery-new-order-checkbox{display:flex;justify-content:center;align-items:center;}.delivery-new-order-checkbox input{width:16px;height:16px;accent-color:#2563eb;}' +
      '.delivery-new-row:hover{background:#eff6ff;}.delivery-new-row.is-deeplink-target{background:#fef3c7!important;box-shadow:inset 4px 0 0 #f59e0b;}.delivery-new-row.is-deeplink-target b{color:#92400e;}' +
      '.delivery-new-kpi-legend{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 12px;border:1px solid #dbe7f5;border-radius:12px;background:#f8fafc;color:#334155;font-size:12px;font-weight:800;margin-top:10px;}.delivery-new-kpi-legend b{color:#0f172a;}.delivery-new-kpi-legend span{display:inline-flex;gap:8px;flex-wrap:wrap;}.delivery-new-kpi-legend small{color:#64748b;font-weight:800;}.delivery-new-no-salesman-selected{padding:18px;text-align:center;color:#64748b;font-weight:850;background:#f8fafc;}' +
      '.delivery-new-row b{font-weight:800;}.delivery-new-row small{display:block;color:#334155;margin-top:3px;}' +
      '.delivery-new-money{text-align:right;font-variant-numeric:tabular-nums;font-weight:800;}' +
      '.delivery-new-return{color:#078b20;}.delivery-new-debt{color:#e11d24;}.delivery-new-zero{color:#0f8a35;}' +
      '.delivery-new-status{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:4px 9px;background:#eef2ff;color:#1d0fb4;font-weight:800;font-size:12px;}' +
      '.delivery-new-status.confirmed{background:#dcfce7;color:#166534;}.delivery-new-detail-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px;}' +
      '.delivery-new-detail-title h3{margin:0;}.delivery-new-detail-title small{display:block;color:#475569;margin-top:3px;}' +
      '.delivery-new-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:10px 0;}' +
      '.delivery-new-detail-cell{border:1px solid #dbe7f5;border-radius:10px;padding:9px 10px;background:#fff;}.delivery-new-detail-cell span{display:block;color:#64748b;font-size:12px;}.delivery-new-detail-cell b{display:block;text-align:right;font-size:16px;margin-top:4px;}' +
      '.delivery-new-safe-note{border:1px solid #bae6fd;background:#eff6ff;border-radius:10px;padding:10px 12px;color:#075985;font-weight:700;margin:8px 0;}.delivery-new-correction-warning{border-color:#fed7aa;background:#fff7ed;color:#9a3412;}.delivery-new-money-input{text-align:right;font-variant-numeric:tabular-nums;}' +
      '.delivery-new-detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}.delivery-new-version-list{margin-top:10px;border-top:1px dashed #cbd5e1;padding-top:8px;color:#334155;}.delivery-new-returnorders{margin:12px 0;border:1px solid #dbe7f5;border-radius:12px;background:#fff;overflow:hidden;}.delivery-new-returnorders-header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #dbe7f5;}.delivery-new-returnorders-header h4{margin:0;font-size:14px;}.delivery-new-returnorders-header small{display:block;color:#64748b;margin-top:3px;}.delivery-new-returnorder-card{padding:10px 12px;border-bottom:1px dashed #dbe7f5;}.delivery-new-returnorder-card:last-child{border-bottom:0;}.delivery-new-returnorder-meta{display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:space-between;color:#475569;font-size:12px;}.delivery-new-returnorder-meta b{color:#0f172a;}.delivery-new-return-items{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px;}.delivery-new-return-items th,.delivery-new-return-items td{border-top:1px solid #e2e8f0;padding:6px 5px;text-align:left;}.delivery-new-return-items th{color:#64748b;font-weight:800;background:#f8fafc;}.delivery-new-return-items .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:700;}.delivery-new-returnorder-note{margin-top:8px;}.delivery-new-adjust-table{width:100%;border-collapse:collapse;margin:8px 0 10px;font-size:12px;}.delivery-new-adjust-table th,.delivery-new-adjust-table td{border-top:1px solid #e2e8f0;padding:6px 5px;text-align:left;}.delivery-new-adjust-table th{background:#f8fafc;color:#64748b;font-weight:800;}.delivery-new-adjust-table .num{text-align:right;font-variant-numeric:tabular-nums;}.delivery-new-adjust-table input{width:88px;text-align:right;}.delivery-v46-filter-suggest input[role="combobox"]{cursor:pointer;}.delivery-v46-filter-suggest input[role="combobox"]:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12);}.delivery-v46-suggest-box .empty{padding:8px 10px;color:#64748b;font-size:12px;}.delivery-v46-suggest-box button strong{font-size:12px;color:#0b4dbb;}.delivery-v46-suggest-box button em{font-style:normal;font-size:11px;color:#64748b;}' +
      '.delivery-new-modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.36);padding:28px;overflow:auto;}.delivery-new-adjustment-dialog{width:min(1280px,96vw);margin:0 auto;background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.35);padding:18px;}.delivery-new-modal-header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid #dbe7f5;padding-bottom:12px;margin-bottom:12px;}.delivery-new-modal-header h3{margin:0;font-size:20px;}.delivery-new-modal-header small{display:block;color:#475569;margin-top:4px;}.delivery-new-modal-close{border:0;background:#2563eb;color:#fff;border-radius:999px;padding:8px 12px;font-weight:900;cursor:pointer;opacity:1!important;pointer-events:auto!important;box-shadow:0 8px 18px rgba(37,99,235,.24);}.delivery-new-modal-close:focus{outline:2px solid #93c5fd;outline-offset:2px;}.delivery-new-modal-message{margin:10px 0;border-radius:12px;padding:10px 12px;border:1px solid #bfdbfe;background:#eff6ff;color:#075985;font-weight:800;}.delivery-new-modal-message.success{border-color:#bbf7d0;background:#f0fdf4;color:#166534;}.delivery-new-modal-message.warning{border-color:#fed7aa;background:#fff7ed;color:#9a3412;}.delivery-new-modal-message.error{border-color:#fecaca;background:#fef2f2;color:#b91c1c;}.delivery-new-modal-message[hidden]{display:none!important;}.delivery-new-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px;}.delivery-new-tab{border:1px solid #cbd5e1;background:#f8fafc;color:#334155;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer;opacity:1;}.delivery-new-tab.active{background:#2563eb;color:#fff;border-color:#2563eb;font-weight:900;box-shadow:0 8px 18px rgba(37,99,235,.18);}.delivery-new-tab:disabled,.delivery-new-tab.is-disabled{background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;opacity:1;cursor:not-allowed;box-shadow:none;}.delivery-new-tab-panel{border:1px solid #dbe7f5;border-radius:14px;padding:12px;background:#fff;min-height:260px;}.delivery-new-modal-footer{display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;align-items:end;border-top:1px solid #dbe7f5;margin-top:12px;padding-top:12px;}.delivery-new-modal-footer label{font-weight:800;}.delivery-new-modal-footer input{width:100%;}.delivery-new-modal-footer .wide{grid-column:span 1;}.delivery-new-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;}.delivery-new-business-table{width:100%;border-collapse:collapse;font-size:12px;}.delivery-new-business-table th,.delivery-new-business-table td{border-top:1px solid #e2e8f0;padding:7px 6px;text-align:left;}.delivery-new-business-table th{background:#f8fafc;color:#64748b;font-weight:800;}.delivery-new-business-table .num{text-align:right;font-variant-numeric:tabular-nums;font-weight:800;}.delivery-new-business-table input{width:92px;text-align:right;}.delivery-new-preview-cards{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;margin-top:10px;}.delivery-new-history-block{margin:10px 0;border:1px solid #dbe7f5;border-radius:12px;overflow:hidden;}.delivery-new-history-block h4{margin:0;padding:10px 12px;background:#f8fafc;border-bottom:1px solid #dbe7f5;}' +
      '.delivery-new-form-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;}.delivery-new-form-grid label{font-weight:700;color:#0f172a;}.delivery-new-form-grid input{width:100%;}.delivery-new-form-grid .wide{grid-column:span 2;}' +
      '@media(max-width:1100px){.delivery-v46-list-panel{overflow-x:auto;}.delivery-new-order-grid{grid-template-columns:32px minmax(220px,1.6fr) 112px 108px 108px 118px 108px 108px 108px 104px 96px;min-width:1280px;}.delivery-new-summary-grid,.delivery-new-preview-cards{grid-template-columns:1fr 1fr;}.delivery-new-salesman-grid{min-width:980px;}}' +
      '@media(max-width:760px){.delivery-new-order-grid{min-width:1280px;grid-template-columns:32px minmax(220px,1.6fr) 112px 108px 108px 118px 108px 108px 108px 104px 96px;}.delivery-new-form-grid,.delivery-new-summary-grid,.delivery-new-preview-cards,.delivery-new-modal-footer{grid-template-columns:1fr;}.delivery-new-form-grid .wide{grid-column:span 1;}.delivery-new-modal-backdrop{padding:10px;}.delivery-new-adjustment-dialog{width:100%;}}';
    document.head.appendChild(style);
  }

  function normalizeForSearch(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function normalizedText(value) {
    return String(value == null ? '' : value).trim();
  }

  function isCloseoutContextId(value) {
    return /^(DCO|DTC|DCOV|DCOA|DCOC)[-_]/i.test(normalizedText(value));
  }

  function parseDeliveryHash(hashValue) {
    var raw = normalizedText(hashValue || window.location.hash);
    var result = { route: '', params: new URLSearchParams(), raw: raw };
    if (!raw) return result;
    var match = raw.match(/^#?\/?([^?]+)(?:\?(.*))?$/);
    if (!match) return result;
    result.route = normalizedText(match[1]).replace(/^\//, '');
    result.params = new URLSearchParams(match[2] || '');
    return result;
  }

  function payloadFromHash() {
    var parsed = parseDeliveryHash();
    if (parsed.route !== 'delivery-today-new') return null;
    if (normalizedText(parsed.params.get('action')).toLowerCase() !== 'open-adjustment-detail') return null;
    return {
      orderCode: firstText([parsed.params.get('orderCode'), parsed.params.get('salesOrderCode')]),
      orderId: firstText([parsed.params.get('orderId'), parsed.params.get('salesOrderId')]),
      closeoutVersionId: firstText([parsed.params.get('closeoutVersionId'), parsed.params.get('closeoutId'), parsed.params.get('versionId')]),
      deliveryDate: firstText([parsed.params.get('deliveryDate'), parsed.params.get('date')]),
      deliveryStaffCode: firstText([parsed.params.get('deliveryStaffCode'), parsed.params.get('delivery')]),
      salesStaffCode: firstText([parsed.params.get('salesStaffCode'), parsed.params.get('salesman')]),
      adjustmentId: firstText([parsed.params.get('adjustmentId'), parsed.params.get('correctionId')]),
      adjustmentCode: firstText([parsed.params.get('adjustmentCode'), parsed.params.get('correctionCode')]),
      source: 'hash',
      viewOnly: true
    };
  }

  function clearDeliveryDeepLinkHash() {
    var parsed = parseDeliveryHash();
    if (parsed.route !== 'delivery-today-new') return;
    if (normalizedText(parsed.params.get('action')).toLowerCase() !== 'open-adjustment-detail') return;
    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, document.title, window.location.pathname + window.location.search + '#/delivery-today-new');
    }
  }

  function selectedOrTyped(selectedValue, typedValue) {
    var selected = normalizedText(selectedValue);
    return selected !== '' ? selected : normalizedText(typedValue);
  }

  function firstText(values) {
    for (var i = 0; i < values.length; i += 1) {
      var value = normalizedText(values[i]);
      if (value !== '') return value;
    }
    return '';
  }

  function resetSelectedFilter(scope) {
    if (!scope || scope === 'search') {
      state.selectedFilters.orderCode = '';
      state.selectedFilters.customerCode = '';
    }
    if (!scope || scope === 'salesman') state.selectedFilters.salesStaffCode = '';
    if (!scope || scope === 'delivery') state.selectedFilters.deliveryStaffCode = '';
  }

  function suggestConfig(scope) {
    if (scope === 'delivery') return { inputId: 'deliveryTodayNewDelivery', boxId: 'deliveryTodayNewDeliverySuggestions', type: 'delivery' };
    if (scope === 'salesman') return { inputId: 'deliveryTodayNewSalesman', boxId: 'deliveryTodayNewSalesmanSuggestions', type: 'salesman' };
    return { inputId: 'deliveryTodayNewSearch', boxId: 'deliveryTodayNewSearchSuggestions', type: 'orderCustomer' };
  }

  function isStaffSuggestionScope(scope) {
    return scope === 'delivery' || scope === 'salesman';
  }

  function suggestionLimitForScope(scope) {
    return isStaffSuggestionScope(scope) ? '50' : '10';
  }

  function minSuggestionChars(scope) {
    return isStaffSuggestionScope(scope) ? 0 : 0;
  }

  function setComboboxExpanded(scope, expanded) {
    var cfg = suggestConfig(scope);
    var input = byId(cfg.inputId);
    if (input) input.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  function closeSuggestion(scope) {
    var cfg = suggestConfig(scope);
    var box = byId(cfg.boxId);
    if (!box) return;
    box.classList.remove('show');
    box.innerHTML = '';
    setComboboxExpanded(scope, false);
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
      box.innerHTML = '<div class="empty">Đang tìm gợi ý...</div>';
      box.classList.add('show');
      setComboboxExpanded(scope, true);
      return;
    }
    if (!items.length) {
      box.innerHTML = '<div class="empty">Không tìm thấy gợi ý phù hợp</div>';
      box.classList.add('show');
      setComboboxExpanded(scope, true);
      return;
    }
    box.innerHTML = items.map(function (item, index) {
      return '<button type="button" class="' + (index === state.suggest.active[scope] ? 'active' : '') + '" data-scope="' + esc(scope) + '" data-index="' + index + '"><strong>' + esc(item.label || item.code || item.orderCode || item.name || '') + '</strong><em>' + esc(item.subLabel || '') + '</em></button>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('button[data-index]'), function (btn) {
      btn.addEventListener('mousedown', function (event) { event.preventDefault(); });
      btn.addEventListener('click', function () { chooseSuggestion(scope, Number(btn.dataset.index)); });
    });
    box.classList.add('show');
    setComboboxExpanded(scope, true);
  }

  function updateClearButtons() {
    var searchInput = byId('deliveryTodayNewSearch');
    var deliveryInput = byId('deliveryTodayNewDelivery');
    var salesmanInput = byId('deliveryTodayNewSalesman');
    var dateInput = byId('deliveryTodayNewDate');
    var searchClear = byId('deliveryTodayNewSearchClear');
    var deliveryClear = byId('deliveryTodayNewDeliveryClear');
    var salesmanClear = byId('deliveryTodayNewSalesmanClear');
    var dateClear = byId('deliveryTodayNewDateClear');
    if (searchClear) searchClear.hidden = !(normalizedText(searchInput && searchInput.value) || normalizedText(state.selectedFilters.orderCode) || normalizedText(state.selectedFilters.customerCode));
    if (deliveryClear) deliveryClear.hidden = !(normalizedText(deliveryInput && deliveryInput.value) || normalizedText(state.selectedFilters.deliveryStaffCode));
    if (salesmanClear) salesmanClear.hidden = !(normalizedText(salesmanInput && salesmanInput.value) || normalizedText(state.selectedFilters.salesStaffCode));
    if (dateClear) dateClear.hidden = !dateInput || !state.deliveryDateTouched || normalizedText(dateInput.value) === today();
  }

  function suggestionParams(scope, value) {
    var cfg = suggestConfig(scope);
    var params = new URLSearchParams({ type: cfg.type, q: normalizedText(value), limit: suggestionLimitForScope(scope), allowEmpty: '1', showOnFocus: '1' });
    var dateInput = byId('deliveryTodayNewDate');
    var deliveryDate = normalizedText(dateInput && dateInput.value);
    if (deliveryDate !== '') params.set('deliveryDate', deliveryDate);
    var selectedDelivery = normalizedText(state.selectedFilters.deliveryStaffCode);
    if (scope === 'salesman' && selectedDelivery !== '') params.set('deliveryStaffCode', selectedDelivery);
    return params;
  }

  async function fetchSuggestions(scope, rawValue) {
    var value = normalizedText(rawValue);
    state.suggest.requestSeq[scope] += 1;
    var seq = state.suggest.requestSeq[scope];
    if (value.length < minSuggestionChars(scope)) {
      state.suggest.items[scope] = [];
      state.suggest.loading[scope] = false;
      closeSuggestion(scope);
      return;
    }
    state.suggest.items[scope] = [];
    state.suggest.loading[scope] = true;
    renderSuggestionBox(scope);
    try {
      var res = await fetch('/api/new/delivery-today/suggestions?' + suggestionParams(scope, value).toString());
      var json = await res.json();
      if (seq !== state.suggest.requestSeq[scope]) return;
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được gợi ý');
      state.suggest.items[scope] = Array.isArray(json.items) ? json.items : [];
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
    state.suggest.timers[scope] = setTimeout(function () { fetchSuggestions(scope, value); }, 250);
  }

  function chooseSuggestion(scope, index) {
    var item = (state.suggest.items[scope] || [])[index];
    var cfg = suggestConfig(scope);
    var input = byId(cfg.inputId);
    if (!item || !input) return;
    if (scope === 'delivery') {
      state.selectedFilters.deliveryStaffCode = firstText([item.code, item.deliveryStaffCode]);
      input.value = firstText([item.label, [item.name, item.code].filter(Boolean).join(' - ')]);
    } else if (scope === 'salesman') {
      state.selectedFilters.salesStaffCode = firstText([item.code, item.salesStaffCode]);
      input.value = firstText([item.label, [item.name, item.code].filter(Boolean).join(' - ')]);
    } else {
      resetSelectedFilter('search');
      input.value = firstText([item.label, item.orderCode, item.customerCode, item.code]);
      if (item.type === 'order') state.selectedFilters.orderCode = firstText([item.orderCode, item.code]);
      else state.selectedFilters.customerCode = firstText([item.customerCode, item.code]);
    }
    state.userTouchedFilters = true;
    updateClearButtons();
    closeSuggestion(scope);
    if (state.hasSearched) {
      resetResultsState();
    }
    setMessage('');
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

  function afterSingleFilterCleared(scope) {
    closeSuggestion(scope);
    updateClearButtons();
    if (!hasValidSearchCriteria()) {
      resetResultsState();
      setMessage('');
      return;
    }
    if (state.hasSearched) {
      resetResultsState();
    }
    setMessage('');
  }

  function clearDeliveryFilter(scope) {
    if (scope === 'delivery') {
      var deliveryInput = byId('deliveryTodayNewDelivery');
      if (deliveryInput) deliveryInput.value = '';
      resetSelectedFilter('delivery');
    } else if (scope === 'salesman') {
      var salesmanInput = byId('deliveryTodayNewSalesman');
      if (salesmanInput) salesmanInput.value = '';
      resetSelectedFilter('salesman');
    } else if (scope === 'search') {
      var searchInput = byId('deliveryTodayNewSearch');
      if (searchInput) searchInput.value = '';
      resetSelectedFilter('search');
    } else if (scope === 'date') {
      var dateInput = byId('deliveryTodayNewDate');
      if (dateInput) dateInput.value = today();
      state.deliveryDateTouched = false;
    }
    state.userTouchedFilters = true;
    afterSingleFilterCleared(scope);
  }

  function attachAutocomplete(scope) {
    var cfg = suggestConfig(scope);
    var input = byId(cfg.inputId);
    if (!input) return;
    input.addEventListener('input', function () {
      resetSelectedFilter(scope);
      state.userTouchedFilters = true;
      updateClearButtons();
      if (state.hasSearched) {
        resetResultsState();
      }
      setMessage('');
      queueSuggestions(scope, input.value);
    });
    input.addEventListener('focus', function () {
      queueSuggestions(scope, input.value);
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); moveSuggestionActive(scope, 1); return; }
      if (event.key === 'ArrowUp') { event.preventDefault(); moveSuggestionActive(scope, -1); return; }
      if (event.key === 'Escape') { closeSuggestion(scope); return; }
      if (event.key === 'Enter') {
        var box = byId(cfg.boxId);
        if (box && box.classList.contains('show') && state.suggest.active[scope] >= 0) {
          event.preventDefault();
          chooseSuggestion(scope, state.suggest.active[scope]);
          return;
        }
        load();
      }
    });
  }

  function bindFilterAutocomplete() {
    attachAutocomplete('delivery');
    attachAutocomplete('salesman');
    attachAutocomplete('search');
    Array.prototype.forEach.call(document.querySelectorAll('[data-delivery-clear]'), function (button) {
      button.addEventListener('click', function () { clearDeliveryFilter(button.dataset.deliveryClear); });
    });
    updateClearButtons();
  }

  function filters() {
    var searchText = byId('deliveryTodayNewSearch') ? byId('deliveryTodayNewSearch').value.trim() : '';
    var deliveryText = byId('deliveryTodayNewDelivery') ? byId('deliveryTodayNewDelivery').value.trim() : '';
    var salesmanText = byId('deliveryTodayNewSalesman') ? byId('deliveryTodayNewSalesman').value.trim() : '';
    var selectedSearch = firstText([state.selectedFilters.orderCode, state.selectedFilters.customerCode]);
    return {
      date: byId('deliveryTodayNewDate') ? byId('deliveryTodayNewDate').value : '',
      q: selectedSearch !== '' ? selectedSearch : searchText,
      orderCode: normalizedText(state.selectedFilters.orderCode),
      customerCode: normalizedText(state.selectedFilters.customerCode),
      delivery: selectedOrTyped(state.selectedFilters.deliveryStaffCode, deliveryText),
      deliveryStaffCode: normalizedText(state.selectedFilters.deliveryStaffCode),
      salesman: selectedOrTyped(state.selectedFilters.salesStaffCode, salesmanText),
      salesStaffCode: normalizedText(state.selectedFilters.salesStaffCode),
      deliveryDateChangedByUser: (byId('deliveryTodayNewDate') && byId('deliveryTodayNewDate').value) ? '1' : '0'
    };
  }


  function renderDeliverySourceNote(sourceNote) {
    var target = byId('deliveryTodayNewSourceNote');
    if (!target) return;
    if (window.SourceNoteUi && typeof window.SourceNoteUi.renderSourceNote === 'function') {
      target.innerHTML = window.SourceNoteUi.renderSourceNote(sourceNote, { compact: true, collapsible: true, defaultOpen: false });
    } else if (sourceNote && sourceNote.primaryCollections) {
      target.textContent = 'Nguồn số liệu: ' + sourceNote.primaryCollections.join(', ') + ' · Service: ' + (sourceNote.service || '');
    } else {
      target.textContent = '';
    }
  }

  function setMessage(text, isError) {
    var message = byId('deliveryTodayNewMessage');
    if (!message) return;
    message.textContent = text || '';
    message.className = 'message' + (isError ? ' error-text' : '');
  }

  function modalMessageId(scope) {
    return scope === 'closeout' ? 'deliveryTodayNewCloseoutModalMessage' : 'deliveryTodayNewAdjustmentModalMessage';
  }

  function setModalNotice(scope, text, type) {
    if (!state.modalNotice) state.modalNotice = {};
    state.modalNotice[scope] = text ? { message: String(text), type: type || 'info' } : null;
    renderModalNotice(scope);
  }

  function setModalError(scope, text) {
    setModalNotice(scope, text, 'error');
  }

  function clearModalNotice(scope) {
    setModalNotice(scope, '', 'info');
  }

  function modalNoticeHtml(scope) {
    var notice = state.modalNotice && state.modalNotice[scope];
    if (!notice || !notice.message) return '<div id="' + modalMessageId(scope) + '" class="delivery-new-modal-message" hidden></div>';
    return '<div id="' + modalMessageId(scope) + '" class="delivery-new-modal-message ' + esc(notice.type || 'info') + '" role="status">' + esc(notice.message) + '</div>';
  }

  function renderModalNotice(scope) {
    var el = byId(modalMessageId(scope));
    if (!el) return;
    var notice = state.modalNotice && state.modalNotice[scope];
    if (!notice || !notice.message) {
      el.hidden = true;
      el.textContent = '';
      el.className = 'delivery-new-modal-message';
      return;
    }
    el.hidden = false;
    el.textContent = notice.message;
    el.className = 'delivery-new-modal-message ' + (notice.type || 'info');
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

  function formatDisplayDate(value) {
    var raw = normalizedText(value);
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return match[3] + '/' + match[2] + '/' + match[1];
    return raw;
  }

  function emptyOrdersMessage() {
    return 'Không có đơn phù hợp với bộ lọc.';
  }

  function missingCriteriaMessage() {
    return 'Chọn NVGH, NVBH hoặc nhập từ khóa từ 2 ký tự.';
  }

  function loadValidationMessage() {
    var f = filters();
    var freeText = normalizedText(f.q);
    var hasSelectedStaff = Boolean(normalizedText(f.deliveryStaffCode) || normalizedText(f.salesStaffCode));
    var hasTypedStaff = normalizedText(f.delivery).length >= 2 || normalizedText(f.salesman).length >= 2;
    if (freeText.length > 0 && freeText.length < 2 && !hasSelectedStaff && !hasTypedStaff) {
      return 'Từ khóa tìm kiếm cần tối thiểu 2 ký tự.';
    }
    return missingCriteriaMessage();
  }

  function renderEmptyState(message, title) {
    var empty = byId('deliveryTodayNewEmptyState');
    if (!empty) return;
    var heading = title || 'Chưa có dữ liệu';
    var body = message == null ? 'Chọn bộ lọc rồi bấm Tải đơn.' : String(message || '');
    empty.innerHTML = '<b>' + esc(heading) + '</b>' + (body ? '<span>' + esc(body) + '</span>' : '');
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
    resetSelectedFilter();
    closeAllSuggestions();
    state.userTouchedFilters = false;
    resetResultsState();
    setMessage('');
    updateClearButtons();
  }

  function hasValidSearchCriteria() {
    var f = filters();
    var freeText = normalizedText(f.q);
    var staffDelivery = normalizedText(f.deliveryStaffCode) || normalizedText(f.delivery);
    var staffSalesman = normalizedText(f.salesStaffCode) || normalizedText(f.salesman);
    return Boolean(
      normalizedText(f.orderCode) ||
      normalizedText(f.customerCode) ||
      freeText.length >= 2 ||
      normalizedText(f.deliveryStaffCode) ||
      normalizedText(f.salesStaffCode) ||
      staffDelivery.length >= 2 ||
      staffSalesman.length >= 2
    );
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
          finalDebtAmount: 0,
          orders: []
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
      map[key].orders.push(row);
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

  function updateTopKpisFromSelectedSalesmen() {
    if (!state.hasSearched) { applySummary({ orderCount: 0 }); return; }
    applySummary(summarizeVisibleRows(getSelectedOrders()));
  }

  function ensureSelectedOrderSet() {
    if (state.selectedOrderIds instanceof Set) return state.selectedOrderIds;
    state.selectedOrderIds = new Set();
    return state.selectedOrderIds;
  }

  function orderSelectionKey(row) { return rowKey(row); }

  function orderCancelledOrDeleted(row) {
    if (!row) return true;
    var status = String(row.status || row.deliveryStatus || row.lifecycleStatus || '').toLowerCase();
    return row.deleted === true || row.isDeleted === true || row.cancelled === true || row.canceled === true || ['cancelled', 'canceled', 'deleted', 'void', 'voided'].indexOf(status) >= 0;
  }

  function isViewSelectableOrder(row) {
    return Boolean(row && orderSelectionKey(row) && row.viewSelectable !== false && !orderCancelledOrDeleted(row));
  }

  function isCloseoutEligibleOrder(row) {
    if (!isViewSelectableOrder(row)) return false;
    var closeoutLocked = row.closeoutLocked === true || row.deliveryCloseoutLocked === true || row.accountingLocked === true;
    var alreadyClosed = closeoutLocked || isConfirmed(row);
    if (alreadyClosed) return false;
    if (row.closeoutEligible === false || row.canCloseout === false) return false;
    if (row.closeoutEligible === true || row.canCloseout === true) return true;
    return true;
  }

  function isOrderSelectable(row) {
    return isViewSelectableOrder(row);
  }

  function isOrderSelected(row) {
    return ensureSelectedOrderSet().has(orderSelectionKey(row));
  }

  function getSelectableVisibleRows() {
    return getVisibleRowsBySelectedSalesmen().filter(isViewSelectableOrder);
  }

  function groupSelectableRows(group) {
    return ((group && group.orders) || []).filter(isViewSelectableOrder);
  }

  function groupSelectedCount(group) {
    var selected = ensureSelectedOrderSet();
    return groupSelectableRows(group).filter(function (row) { return selected.has(orderSelectionKey(row)); }).length;
  }

  function groupSelectionState(group) {
    var selectable = groupSelectableRows(group);
    var count = groupSelectedCount(group);
    var groupVisible = Boolean(state.selectedSalesmanKeys && state.selectedSalesmanKeys[group.key]);
    return {
      selectableCount: selectable.length,
      selectedCount: count,
      checked: Boolean(groupVisible && selectable.length && count === selectable.length),
      indeterminate: Boolean(groupVisible && count > 0 && count < selectable.length)
    };
  }

  function selectGroupOrders(group, checked) {
    var selected = ensureSelectedOrderSet();
    groupSelectableRows(group).forEach(function (row) {
      var key = orderSelectionKey(row);
      if (!key) return;
      if (checked) selected.add(key);
      else selected.delete(key);
    });
  }

  function selectDefaultOrdersForSelectedSalesmen() {
    state.selectedOrderIds = new Set();
    (state.salesmanGroups || []).forEach(function (group) {
      if (state.selectedSalesmanKeys && state.selectedSalesmanKeys[group.key]) selectGroupOrders(group, true);
    });
  }

  function pruneSelectedOrderIds(visibleRows) {
    var allowed = new Set((visibleRows || getVisibleRowsBySelectedSalesmen()).filter(isViewSelectableOrder).map(orderSelectionKey));
    var selected = ensureSelectedOrderSet();
    Array.from(selected).forEach(function (key) { if (!allowed.has(key)) selected.delete(key); });
  }

  function toggleOrderSelection(orderId, checked) {
    var key = String(orderId || '').trim();
    if (!key) return;
    var selected = ensureSelectedOrderSet();
    if (checked) selected.add(key);
    else selected.delete(key);
    var row = findRowByOrderKey(key);
    var groupKey = row ? salesmanKey(row) : '';
    if (groupKey && state.selectedSalesmanKeys) {
      var group = (state.salesmanGroups || []).filter(function (item) { return item.key === groupKey; })[0];
      if (group) state.selectedSalesmanKeys[groupKey] = groupSelectedCount(group) > 0;
    }
    updateTopKpisFromSelectedSalesmen();
    renderSalesmanGroupPanel();
    renderRows();
  }

  function selectAllVisibleOrders() {
    var selected = ensureSelectedOrderSet();
    getSelectableVisibleRows().forEach(function (row) { selected.add(orderSelectionKey(row)); });
    (state.salesmanGroups || []).forEach(function (group) {
      if (state.selectedSalesmanKeys && state.selectedSalesmanKeys[group.key]) state.selectedSalesmanKeys[group.key] = groupSelectedCount(group) > 0;
    });
    updateTopKpisFromSelectedSalesmen();
    renderSalesmanGroupPanel();
    renderRows();
  }

  function clearSelectedOrders() {
    ensureSelectedOrderSet().clear();
    (state.salesmanGroups || []).forEach(function (group) { if (state.selectedSalesmanKeys) state.selectedSalesmanKeys[group.key] = false; });
    updateTopKpisFromSelectedSalesmen();
    renderSalesmanGroupPanel();
    renderRows();
  }

  function getSelectedOrders() {
    var selected = ensureSelectedOrderSet();
    return getVisibleRowsBySelectedSalesmen().filter(function (row) { return isViewSelectableOrder(row) && selected.has(orderSelectionKey(row)); });
  }

  function getSelectedCloseoutSummary() {
    return closeoutSummary(getSelectedOrders());
  }

  function canCloseoutSelectedOrders() {
    return selectedCloseoutRows().length > 0 && !state.closeoutBusy;
  }

  function applySelectedSalesmanFilter() {
    pruneSelectedOrderIds(getVisibleRowsBySelectedSalesmen());
    updateTopKpisFromSelectedSalesmen();
    renderSalesmanGroupPanel();
    renderRows();
    updateCloseoutButton();
  }

  function toggleSalesmanSelection(key, checked) {
    state.selectedSalesmanKeys = state.selectedSalesmanKeys || {};
    state.selectedSalesmanKeys[key] = Boolean(checked);
    var group = (state.salesmanGroups || []).filter(function (item) { return item.key === key; })[0];
    if (group) selectGroupOrders(group, Boolean(checked));
    applySelectedSalesmanFilter();
  }

  function renderSalesmanGroupPanel() {
    var box = byId('deliveryTodayNewSalesmanPanel');
    if (!box) return;
    if (!state.hasSearched) {
      box.innerHTML = '<div class="delivery-new-salesman-empty">Tải đơn để xem NVBH thuộc NVGH đang chọn.</div>';
      return;
    }
    var groups = state.salesmanGroups || [];
    if (!groups.length) {
      box.innerHTML = '<div class="delivery-new-salesman-empty">Không có NVBH trong kết quả hiện tại.</div>';
      return;
    }
    var selected = selectedSalesmanSet();
    var selectedCount = groups.filter(function (group) { return selected[group.key]; }).length;
    var header = '<div class="delivery-new-salesman-compact-header"><div><h3>NVBH thuộc NVGH đang chọn</h3><small>Tick trực tiếp từng NVBH. KPI tổng và danh sách đơn tính theo các đơn đang chọn để xem/theo dõi.</small></div><small>Đang chọn ' + selectedCount + '/' + groups.length + ' NVBH</small></div>';
    var head = '<div class="delivery-new-salesman-grid delivery-new-salesman-grid-head" role="row">' +
      '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-check-cell">Chọn</div>' +
      '<div class="delivery-new-salesman-grid-cell">NVBH</div>' +
      '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-num">Đơn</div>' +
      '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money">PT</div>' +
      '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money">TM</div>' +
      '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money">CK</div>' +
      '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money">TT</div>' +
      '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money">HT</div>' +
      '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money">CN</div>' +
    '</div>';
    var rows = groups.map(function (group) {
      var stateInfo = groupSelectionState(group);
      var checked = stateInfo.checked ? ' checked' : '';
      var selectedClass = selected[group.key] ? ' is-selected' : ' is-unselected';
      var debtClass = num(group.finalDebtAmount) > 0 ? 'delivery-new-debt' : 'delivery-new-money-dash';
      var rewardClass = num(group.rewardAmount) + num(group.offsetAmount) > 0 ? ' reward-positive' : '';
      var bankClass = num(group.bankAmount) > 0 ? ' bank-positive' : '';
      return '<div class="delivery-new-salesman-grid delivery-new-salesman-grid-row' + selectedClass + '" data-salesman-key="' + esc(group.key) + '" role="row">' +
        '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-check-cell"><input type="checkbox" data-salesman-key="' + esc(group.key) + '" aria-label="Chọn NVBH ' + esc(salesmanGroupDisplayName(group)) + '"' + checked + '></div>' +
        '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-name" title="' + esc(salesmanGroupDisplayName(group)) + '">' + esc(salesmanGroupDisplayName(group)) + '</div>' +
        '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-num">' + esc(group.orderCount) + '</div>' +
        '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money">' + moneyDash(group.originalAmount) + '</div>' +
        '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money">' + moneyDash(group.cashAmount) + '</div>' +
        '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money' + bankClass + '">' + moneyDash(group.bankAmount) + '</div>' +
        '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money' + rewardClass + '">' + moneyDash(num(group.rewardAmount) + num(group.offsetAmount)) + '</div>' +
        '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money delivery-new-return">' + moneyDash(group.returnedAmount) + '</div>' +
        '<div class="delivery-new-salesman-grid-cell delivery-new-salesman-money ' + debtClass + '">' + moneyDash(group.finalDebtAmount) + '</div>' +
      '</div>';
    }).join('');
    var legend = '<div class="delivery-new-kpi-legend"><b>Chú giải KPI</b><span>PT = Phải thu | TM = Tiền mặt | CK = Chuyển khoản | TT = Trả thưởng | HT = Hàng trả | CN = Còn nợ</span><small>Tick tay từng NVBH để tránh thao tác nhầm.</small></div>';
    var wrapClass = 'delivery-new-salesman-grid-wrap' + (groups.length > 6 ? ' is-scrollable' : '');
    box.innerHTML = header + '<div class="' + wrapClass + '">' + head + rows + '</div>' + legend;
    Array.prototype.forEach.call(box.querySelectorAll('input[type="checkbox"][data-salesman-key]'), function (input) {
      var group = groups.filter(function (item) { return item.key === input.dataset.salesmanKey; })[0];
      var stateInfo = group ? groupSelectionState(group) : { indeterminate: false };
      input.indeterminate = stateInfo.indeterminate;
      input.addEventListener('change', function (event) {
        event.stopPropagation();
        toggleSalesmanSelection(input.dataset.salesmanKey, input.checked);
      });
    });
  }

  function findRowByOrderKey(key) {
    key = String(key || '').trim();
    if (!key) return null;
    for (var i = 0; i < (state.rows || []).length; i += 1) {
      if (orderSelectionKey(state.rows[i]) === key) return state.rows[i];
    }
    return null;
  }


  function rowIdentityValues(row) {
    return [
      row && row.orderCode,
      row && row.salesOrderCode,
      row && row.orderId,
      row && row.salesOrderId,
      row && row.closeoutVersionId,
      row && row.correctionId,
      row && row.id,
      row && row._id
    ].map(normalizedText).filter(Boolean);
  }

  function findRowByDeepLink(payload) {
    payload = payload || {};
    var wanted = [payload.orderCode, payload.orderId].map(normalizedText).filter(Boolean);
    if (!wanted.length) return null;
    for (var i = 0; i < (state.rows || []).length; i += 1) {
      var values = rowIdentityValues(state.rows[i]);
      for (var j = 0; j < wanted.length; j += 1) {
        if (values.indexOf(wanted[j]) >= 0) return state.rows[i];
      }
    }
    return null;
  }

  function scrollToDeepLinkRow(row) {
    if (!row) return;
    var key = orderSelectionKey(row);
    var el = null;
    Array.prototype.some.call(document.querySelectorAll('[data-order-key]'), function (node) {
      if (node.dataset && node.dataset.orderKey === key) { el = node; return true; }
      return false;
    });
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function salesmanGroupDisplayName(group) {
    var code = String((group && group.salesStaffCode) || '').trim();
    var name = String((group && group.salesStaffName) || '').trim();
    if (code && name) return code + ' - ' + name;
    return code || name || 'Chưa rõ NVBH';
  }

  function renderOrderRow(row) {
    var confirmed = isConfirmed(row);
    var viewSelectable = isViewSelectableOrder(row);
    var closeoutEligible = isCloseoutEligibleOrder(row);
    var key = orderSelectionKey(row);
    var checked = isOrderSelected(row) ? ' checked' : '';
    var disabled = viewSelectable ? '' : ' disabled';
    var selectedClass = checked ? ' selected' : '';
    if (state.deepLinkTargetKey && key === state.deepLinkTargetKey) selectedClass += ' is-deeplink-target';
    var debtClass = num(row.finalDebtAmount) > 0 ? 'delivery-new-debt' : 'delivery-new-zero';
    var checkboxTitle = viewSelectable
      ? (closeoutEligible ? 'Chọn đơn để xem KPI và đưa vào phạm vi có thể chốt' : 'Chọn đơn để xem KPI/theo dõi; đơn này không còn có thể chốt lại')
      : 'Đơn không đủ điều kiện chọn để xem';
    return '<div data-order-key="' + esc(key) + '" class="delivery-new-row delivery-new-order-row delivery-new-order-grid' + selectedClass + '" role="row">' +
      '<label class="delivery-new-order-cell delivery-new-order-checkbox delivery-new-order-checkbox-cell" title="' + esc(checkboxTitle) + '"><input type="checkbox" class="deliveryTodayNewOrderSelect" data-order-key="' + esc(key) + '"' + checked + disabled + '></label>' +
      '<span class="delivery-new-order-cell delivery-new-order-customer-cell"><b>' + esc(row.orderCode || row.orderId) + '</b><small>' + esc(row.customerName || '') + ' · ' + esc(row.customerCode || '') + '</small></span>' +
      '<span class="delivery-new-order-cell delivery-new-staff-cell" title="' + esc(salesmanLabel(row)) + '">' + esc(salesmanLabel(row)) + '</span>' +
      '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell">' + moneyDash(row.originalAmount) + '</span>' +
      '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell">' + moneyDash(row.cashAmount) + '</span>' +
      '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell">' + moneyDash(row.bankAmount) + '</span>' +
      '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell">' + moneyDash(num(row.rewardAmount) + num(row.offsetAmount)) + '</span>' +
      '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell delivery-new-return">' + moneyDash(row.returnedAmount) + '</span>' +
      '<span class="delivery-new-order-cell delivery-new-money delivery-new-money-cell ' + debtClass + '">' + moneyDash(row.finalDebtAmount) + '</span>' +
      '<span class="delivery-new-order-cell delivery-new-status-cell"><span class="delivery-new-status ' + (confirmed ? 'confirmed' : '') + '">' + esc(statusLabel(row)) + '</span></span>' +
      '<span class="delivery-new-order-cell delivery-new-row-action delivery-new-action-cell"><button type="button" class="primary-action deliveryTodayNewAdjustBtn" data-adjust-key="' + esc(key) + '">Điều chỉnh</button></span>' +
    '</div>';
  }

  function updateOrderSelectionToolbar(visibleRows) {
    var countEl = byId('deliveryTodayNewOrderCount');
    var selectedEl = byId('deliveryTodayNewSelectionCount');
    var selectAll = byId('deliveryTodayNewSelectAllOrders');
    var clearAll = byId('deliveryTodayNewClearOrders');
    var bulkAdjustment = byId('deliveryTodayNewBulkAdjustmentCommit');
    var visible = visibleRows || getVisibleRowsBySelectedSalesmen();
    var viewSelectable = visible.filter(isViewSelectableOrder);
    var selectedOrders = getSelectedOrders();
    var selectedCount = selectedOrders.length;
    var selectedCloseoutCount = selectedOrders.filter(isCloseoutEligibleOrder).length;
    var closedCount = visible.filter(isConfirmed).length;
    if (countEl) countEl.textContent = 'Tổng đơn: ' + visible.length;
    if (selectedEl) selectedEl.textContent = 'Đang chọn: ' + selectedCount + ' · Có thể chốt: ' + selectedCloseoutCount + ' · Đã chốt: ' + closedCount;
    if (selectAll) selectAll.disabled = !viewSelectable.length || selectedCount === viewSelectable.length;
    if (clearAll) clearAll.disabled = !selectedCount;
    if (bulkAdjustment) {
      bulkAdjustment.disabled = !selectedCount || state.bulkAdjustmentBusy;
      bulkAdjustment.textContent = state.bulkAdjustmentBusy ? 'Đang ghi nhận...' : ('Ghi nhận điều chỉnh đã chọn' + (selectedCount ? ' (' + selectedCount + ')' : ''));
      bulkAdjustment.title = selectedCount ? 'Chạy cùng logic Lưu điều chỉnh từng đơn cho các đơn đang tick.' : 'Vui lòng chọn ít nhất một đơn.';
    }
    var headerCheck = byId('deliveryTodayNewHeaderSelectAllOrders');
    if (headerCheck) {
      headerCheck.disabled = !viewSelectable.length;
      headerCheck.checked = Boolean(viewSelectable.length && selectedCount === viewSelectable.length);
      headerCheck.indeterminate = Boolean(selectedCount > 0 && selectedCount < viewSelectable.length);
    }
  }

  function renderRows() {
    var list = byId('deliveryTodayNewTable');
    if (!list) return;
    if (!state.hasSearched) {
      list.innerHTML = '<div class="empty-state">Chưa tải đơn.</div>';
      updateOrderSelectionToolbar([]);
      updateCloseoutButton();
      return;
    }
    var visibleRows = getVisibleRowsBySelectedSalesmen();
    pruneSelectedOrderIds(visibleRows);
    if (!state.rows.length) {
      list.innerHTML = '<div class="empty-state">' + esc(emptyOrdersMessage()) + '</div>';
      updateOrderSelectionToolbar([]);
      updateCloseoutButton();
      return;
    }
    if (!visibleRows.length) {
      list.innerHTML = '<div class="delivery-new-no-salesman-selected">Chưa chọn NVBH nào.</div>';
      updateOrderSelectionToolbar([]);
      updateCloseoutButton();
      return;
    }
    list.innerHTML = visibleRows.map(renderOrderRow).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.deliveryTodayNewOrderSelect'), function (input) {
      input.addEventListener('change', function (event) {
        event.stopPropagation();
        toggleOrderSelection(input.dataset.orderKey, input.checked);
      });
    });
    Array.prototype.forEach.call(list.querySelectorAll('[data-adjust-key]'), function (btn) {
      btn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openAdjustmentPopup(findRowByOrderKey(btn.dataset.adjustKey));
      });
    });
    updateOrderSelectionToolbar(visibleRows);
    updateCloseoutButton();
  }


  function summarizeBulkAdjustmentResult(json) {
    var data = (json && (json.data || json)) || {};
    var summary = data.summary || json.summary || {};
    var parts = [];
    parts.push('Đã chọn ' + (summary.selectedOrders || 0) + ' đơn');
    parts.push('xử lý ' + (summary.processedOrders || 0));
    parts.push('đã đúng/bỏ qua ' + (summary.skippedAlreadySynced || 0));
    parts.push('tạo AR điều chỉnh ' + (summary.createdDebtAdjustments || 0));
    if (summary.manualReviewRequired) parts.push('cần kiểm tra ' + summary.manualReviewRequired);
    if (summary.errors) parts.push('lỗi ' + summary.errors);
    return parts.join(' · ');
  }

  async function submitBulkAdjustmentCommit() {
    return runCommandOnce('delivery.bulkAdjustment', async function () {
    var rows = getSelectedOrders();
    if (!rows.length) { setMessage('Vui lòng chọn ít nhất một đơn để ghi nhận điều chỉnh.', true); return; }
    if (state.bulkAdjustmentBusy) return;
    var confirmed = window.confirm('Bạn sắp ghi nhận lại điều chỉnh cho ' + rows.length + ' đơn đã chọn. Hệ thống sẽ chạy cùng logic như bấm Lưu điều chỉnh từng đơn. Tiếp tục?');
    if (!confirmed) return;
    var f = filters();
    var orderPayloads = rows.map(function (row) {
      return {
        orderCode: row.orderCode || row.salesOrderCode || row.code || row.displayOrderCode || '',
        orderId: row.orderId || row.salesOrderId || row.id || rowKey(row),
        closeoutId: row.closeoutId || row.closeoutVersionId || row.originalCloseoutId || '',
        closeoutCode: row.closeoutCode || row.closeoutVersionCode || row.originalCloseoutCode || '',
        closeoutVersionId: row.closeoutVersionId || row.adjustmentId || row.correctionId || '',
        closeoutVersionCode: row.closeoutVersionCode || row.adjustmentCode || row.correctionCode || '',
        customerCode: row.customerCode || '',
        customerName: row.customerName || '',
        salesStaffCode: row.salesStaffCode || row.salesmanCode || '',
        deliveryStaffCode: row.deliveryStaffCode || row.deliveryCode || '',
        deliveryDate: row.deliveryDate || f.date || '',
        sourceVersion: row.version || row.closeoutVersion || row.sourceVersion || 0,
        receivableAmount: num(row.originalAmount),
        originalAmount: num(row.originalAmount),
        cashAmount: num(row.cashAmount),
        bankAmount: num(row.bankAmount),
        rewardAmount: num(row.rewardAmount) + num(row.offsetAmount),
        returnAmount: num(row.returnedAmount),
        returnedAmount: num(row.returnedAmount),
        finalDebtAmount: num(row.finalDebtAmount),
        debtAmount: num(row.finalDebtAmount)
      };
    }).filter(function (row) { return row.orderCode || row.orderId; });
    var orderCodes = orderPayloads.map(function (row) { return row.orderCode || row.orderId; }).filter(Boolean).filter(function (value, index, arr) { return arr.indexOf(value) === index; });
    var orderIds = orderPayloads.map(function (row) { return row.orderId || row.orderCode; }).filter(Boolean).filter(function (value, index, arr) { return arr.indexOf(value) === index; });
    state.bulkAdjustmentBusy = true;
    updateOrderSelectionToolbar(getVisibleRowsBySelectedSalesmen());
    setMessage('Đang ghi nhận điều chỉnh hàng loạt cho ' + rows.length + ' đơn...');
    try {
      var res = await fetch('/api/new/delivery-today/adjustments/bulk-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: f.date,
          deliveryDate: f.date,
          deliveryStaffCode: f.delivery,
          salesStaffCode: f.salesman,
          orders: orderPayloads,
          orderCodes: orderCodes,
          orderIds: orderIds,
          reason: 'Bulk ghi nhận lại điều chỉnh công nợ',
          note: 'Thao tác từ Đơn giao hôm nay New',
          dryRun: false
        })
      });
      var json = await readJsonResponse(res, 'Không ghi nhận được điều chỉnh hàng loạt');
      setMessage((json.message || 'Đã ghi nhận điều chỉnh hàng loạt.') + ' ' + summarizeBulkAdjustmentResult(json));
      patchBulkAdjustmentRows(rows, json);
    } catch (err) {
      setMessage(err.message || 'Không ghi nhận được điều chỉnh hàng loạt', true);
    } finally {
      state.bulkAdjustmentBusy = false;
      updateOrderSelectionToolbar(getVisibleRowsBySelectedSalesmen());
    }
    return null;
    });
  }

  function sameOrder(row, ref) {
    if (!row || !ref) return false;
    var keys = [row.orderId, row.salesOrderId, row.id, row.orderCode, row.salesOrderCode, row.code, row.displayOrderCode].map(String).filter(Boolean);
    var refs = [ref.orderId, ref.salesOrderId, ref.id, ref.orderCode, ref.salesOrderCode, ref.code, ref.displayOrderCode].map(String).filter(Boolean);
    return keys.some(function (key) { return refs.indexOf(key) >= 0; });
  }

  function refreshDeliveryTodayDerivedState() {
    state.salesmanGroups = buildSalesmanGroups(state.rows || []);
    state.salesmanGroups.forEach(function (group) {
      if (!state.selectedSalesmanKeys) state.selectedSalesmanKeys = {};
      if (state.selectedSalesmanKeys[group.key] == null) state.selectedSalesmanKeys[group.key] = true;
    });
    updateTopKpisFromSelectedSalesmen();
    renderSalesmanGroupPanel();
    renderRows();
  }

  function patchCloseoutRowsFromResult(json, submittedRows) {
    var data = (json && (json.data || json)) || {};
    var results = data.results || json.results || [];
    var refs = Array.isArray(results) && results.length ? results : submittedRows;
    if (!Array.isArray(refs) || !refs.length) return;
    state.rows = (state.rows || []).map(function (row) {
      var matched = refs.find(function (ref) { return sameOrder(row, ref); });
      if (!matched) return row;
      return Object.assign({}, row, {
        accountingConfirmed: true,
        accountingStatus: 'confirmed',
        closeoutStatus: 'accounting_confirmed',
        deliveryCloseoutStatus: 'closed',
        closeoutEligible: false,
        canCloseout: false,
        accountingConfirmedAt: matched.accountingConfirmedAt || row.accountingConfirmedAt || new Date().toISOString(),
        closeoutPatchedLocally: true
      });
    });
    refs.forEach(function (ref) {
      state.selectedOrderIds.delete(String(ref.orderId || ref.salesOrderId || ref.id || ref.orderCode || ref.salesOrderCode || ref.code || ''));
    });
    closeCloseoutModal();
    refreshDeliveryTodayDerivedState();
  }

  function patchBulkAdjustmentRows(rows, json) {
    var now = new Date().toISOString();
    state.rows = (state.rows || []).map(function (row) {
      var matched = rows.find(function (ref) { return sameOrder(row, ref); });
      return matched ? Object.assign({}, row, { bulkAdjustmentSyncedAt: now, bulkAdjustmentSyncStatus: 'synced' }) : row;
    });
    updateTopKpisFromSelectedSalesmen();
    renderRows();
  }

  function patchAdjustmentRow(row, json) {
    var data = (json && (json.data || json)) || {};
    var correction = data.correction || json.correction || {};
    state.rows = (state.rows || []).map(function (current) {
      if (!sameOrder(current, row)) return current;
      return Object.assign({}, current, {
        hasCorrection: true,
        lastCorrectionId: correction.id || correction.correctionId || current.lastCorrectionId,
        lastCorrectionCode: correction.code || correction.correctionCode || current.lastCorrectionCode,
        returnUpdated: Boolean(data.returnUpdated || current.returnUpdated),
        adjustmentPatchedLocally: true
      });
    });
    if (state.adjustmentRow && sameOrder(state.adjustmentRow, row)) {
      state.adjustmentRow = Object.assign({}, state.adjustmentRow, { hasCorrection: true, lastCorrectionId: correction.id || correction.correctionId || '' });
    }
    updateTopKpisFromSelectedSalesmen();
    renderRows();
  }

  function selectedCloseoutRows() {
    return getSelectedOrders().filter(isCloseoutEligibleOrder);
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
    var selectedRows = state.hasSearched ? getSelectedOrders() : [];
    var rows = state.hasSearched ? selectedCloseoutRows() : [];
    var summary = closeoutSummary(rows);
    btn.disabled = !canCloseoutSelectedOrders();
    btn.textContent = state.closeoutBusy ? 'Đang chốt...' : ('Chốt sổ giao hàng' + (rows.length ? ' (' + rows.length + ')' : ''));
    if (!selectedRows.length) btn.title = 'Vui lòng chọn ít nhất một đơn để chốt sổ.';
    else if (!rows.length) btn.title = 'Các đơn đang chọn đều đã chốt sổ hoặc không còn có thể chốt.';
    else btn.title = 'Chuyển CN còn lại sang AR-DEBT: ' + money(summary.totalDebt);
    updateOrderSelectionToolbar(getVisibleRowsBySelectedSalesmen());
  }

  function closeCloseoutModal() {
    var modal = byId('deliveryTodayNewCloseoutModal');
    if (modal) { modal.hidden = true; modal.innerHTML = ''; }
    clearModalNotice('closeout');
  }

  function openCloseoutModal() {
    var modal = byId('deliveryTodayNewCloseoutModal');
    if (!modal) return;
    var selectedRows = getSelectedOrders();
    var rows = selectedCloseoutRows();
    if (!selectedRows.length) { setMessage('Vui lòng chọn ít nhất một đơn để chốt sổ.', true); return; }
    if (!rows.length) { setMessage('Các đơn đang chọn đều đã chốt sổ hoặc không còn có thể chốt.', true); return; }
    clearModalNotice('closeout');
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
          detailCell('Số đơn có thể chốt', summary.orderCount) +
          detailCell('Tổng phải thu', money(summary.originalAmount)) +
          detailCell('Tổng tiền mặt', money(summary.cashAmount)) +
          detailCell('Tổng chuyển khoản', money(summary.bankAmount)) +
          detailCell('Tổng trả thưởng', money(num(summary.rewardAmount) + num(summary.offsetAmount))) +
          detailCell('Tổng hàng trả', money(summary.returnedAmount), 'delivery-new-return') +
          detailCell('Đơn còn nợ > 1.000', summary.debtOrderCount) +
          detailCell('CN chuyển sang công nợ', money(summary.totalDebt), summary.totalDebt > 0 ? 'delivery-new-debt' : 'delivery-new-zero') +
        '</div>' +
        '<div class="delivery-new-closeout-warning">Chỉ phần CN sau làm tròn ngoài khoảng ±1.000 mới sinh AR-DEBT-OPEN. Đơn có CN từ -1.000 đến 1.000 được coi là hết nợ.</div>' +
        modalNoticeHtml('closeout') +
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
    return runCommandOnce('delivery.closeout', async function () {
    var rows = selectedCloseoutRows();
    var reasonEl = byId('deliveryCloseoutReason');
    var reason = reasonEl ? reasonEl.value.trim() : '';
    if (!rows.length) { setModalError('closeout', 'Không có đơn nào còn có thể chốt trong các đơn đang chọn.'); return; }
    if (!reason) { setModalError('closeout', 'Vui lòng nhập lý do chốt sổ.'); return; }
    var f = filters();
    var salesStaffCodes = (state.salesmanGroups || [])
      .filter(function (group) { return state.selectedSalesmanKeys && state.selectedSalesmanKeys[group.key]; })
      .map(function (group) { return group.salesStaffCode || group.salesStaffName || group.key; })
      .filter(Boolean);
    var orderIds = rows.map(rowKey).filter(Boolean).filter(function (value, index, arr) { return arr.indexOf(value) === index; });
    var selectedOrderCodes = rows
      .map(function (row) { return row.orderCode || row.salesOrderCode || row.code || row.displayOrderCode || rowKey(row); })
      .filter(Boolean)
      .filter(function (value, index, arr) { return arr.indexOf(value) === index; });
    state.closeoutBusy = true;
    updateCloseoutButton();
    setModalNotice('closeout', 'Đang chốt sổ giao hàng...', 'info');
    try {
      var res = await fetch('/api/new/delivery-today/closeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryDate: f.date,
          date: f.date,
          deliveryStaffCode: f.delivery,
          salesStaffCodes: salesStaffCodes,
          selectedSalesStaffCodes: salesStaffCodes,
          orderIds: orderIds,
          selectedOrderIds: orderIds,
          selectedOrderCodes: selectedOrderCodes,
          reason: reason,
          closeoutScope: 'selected_orders'
        })
      });
      var json = await readJsonResponse(res, 'Không chốt được sổ giao hàng');
      var posted = json.totalDebtPosted != null ? json.totalDebtPosted : (json.data && json.data.totalDebtPosted);
      var data = json.data || {};
      var closed = json.closedOrders != null ? json.closedOrders : (data.confirmedOrders || 0);
      var skipped = json.skippedOrders != null ? json.skippedOrders : (data.skippedOrders || 0);
      var status = String(json.status || data.status || '').toLowerCase();
      var sync = json.readModelSync || data.readModelSync || {};
      var syncPending = String(sync.status || '').toLowerCase() === 'pending' || String(sync.mode || '').toLowerCase() === 'queued';
      var syncNote = syncPending ? ' Công nợ đang đồng bộ nền.' : '';
      var successMessage = 'Đã chốt sổ giao hàng. Đã chuyển ' + money(posted || 0) + ' sang công nợ.' + syncNote;
      if ((!closed && skipped) || status === 'idempotent') {
        successMessage = 'Đơn đã được chốt trước đó. Hệ thống đã bỏ qua và không ghi lại công nợ.';
      } else if (closed && skipped) {
        successMessage = 'Đã chốt ' + closed + ' đơn, bỏ qua ' + skipped + ' đơn đã chốt trước đó. Đã chuyển ' + money(posted || 0) + ' sang công nợ.' + syncNote;
      }
      setModalNotice('closeout', successMessage, 'success');
      patchCloseoutRowsFromResult(json, rows);
    } catch (err) {
      setModalError('closeout', err.message || 'Không chốt được sổ giao hàng');
    } finally {
      state.closeoutBusy = false;
      updateCloseoutButton();
    }
    return null;
    });
  }

  function detailCell(label, value, className) {
    return '<div class="delivery-new-detail-cell"><span>' + esc(label) + '</span><b class="' + (className || '') + '">' + esc(value) + '</b></div>';
  }

  function detailCellValueId(label, id, value, className) {
    return '<div class="delivery-new-detail-cell"><span>' + esc(label) + '</span><b id="' + esc(id) + '" class="' + (className || '') + '">' + esc(value) + '</b></div>';
  }

  function rowKey(row) { return String(row.orderId || row.orderCode || row.closeoutVersionId || row.correctionId || ''); }

  function correctionEndpoint(row) {
    return '/api/new/delivery-today/closeouts/' + encodeURIComponent(rowKey(row)) + '/corrections';
  }

  function adjustmentReturnRowsEndpoint(row) {
    var params = [];
    if (row && row.orderCode) params.push('orderCode=' + encodeURIComponent(row.orderCode));
    if (row && row.orderId) params.push('orderId=' + encodeURIComponent(row.orderId));
    return '/api/new/delivery-today/closeouts/' + encodeURIComponent(rowKey(row)) + '/adjustment-return-rows' + (params.length ? '?' + params.join('&') : '');
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
  function itemDeliveredQty(item) { return qty(item && (item.deliveredQty ?? item.deliveryQty ?? item.shipQty ?? item.soldQty ?? item.quantitySold ?? item.orderQty ?? item.saleQty ?? item.totalQty ?? item.quantity ?? item.qty ?? item.looseQty ?? item.units)); }
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

  function normalizeReturnEditRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (item) {
      var deliveredQty = qty(item.deliveredQty);
      var currentReturnQty = qty(item.currentReturnQty ?? item.oldReturnQty);
      var desiredReturnQty = qty(item.desiredReturnQty ?? item.newReturnQty ?? currentReturnQty);
      var unitPrice = num(item.unitPrice);
      return {
        productKey: item.productKey || '',
        productCode: item.productCode || '',
        productName: item.productName || '',
        unit: item.unit || '',
        deliveredQty: deliveredQty,
        unitPrice: unitPrice,
        oldReturnQty: currentReturnQty,
        currentReturnQty: currentReturnQty,
        newReturnQty: desiredReturnQty,
        desiredReturnQty: desiredReturnQty,
        oldReturnAmount: num(item.returnAmount ?? (currentReturnQty * unitPrice)),
        source: item.source || {}
      };
    });
  }

  async function loadCanonicalReturnRows(row) {
    if (!row || state.adjustmentViewOnly) return;
    try {
      var res = await fetch(adjustmentReturnRowsEndpoint(row));
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được dữ liệu hàng trả');
      var rows = json.returnRows || (json.data && json.data.returnRows) || json.rows || [];
      if (state.adjustmentRow && rowKey(state.adjustmentRow) === rowKey(row)) {
        state.correctionReturnItems = normalizeReturnEditRows(rows);
        renderAdjustmentTab(row);
      }
    } catch (err) {
      if (state.adjustmentRow && rowKey(state.adjustmentRow) === rowKey(row)) {
        setModalNotice('adjustment', (err.message || 'Không tải được dữ liệu hàng trả') + '. Tạm hiển thị dữ liệu đang có trên danh sách.', 'warning');
      }
    }
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
        productKey: item.productKey || '',
        productCode: item.productCode,
        productName: item.productName,
        oldReturnQty: qty(item.oldReturnQty),
        currentReturnQty: qty(item.oldReturnQty),
        newReturnQty: newQty,
        desiredReturnQty: newQty,
        unitPrice: num(item.unitPrice),
        deliveredQty: qty(item.deliveredQty),
        adjustmentQty: adjustmentQty,
        deltaReturnQty: adjustmentQty,
        adjustmentAmount: adjustmentAmount,
        deltaReturnAmount: adjustmentAmount
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
    var oldCash = parseVietnameseMoney(row.cashAmount);
    var oldBank = parseVietnameseMoney(row.bankAmount);
    var oldReward = parseVietnameseMoney(row.rewardAmount) + parseVietnameseMoney(row.offsetAmount);
    var newCash = readCorrectedMoney(byId('deliveryAdjustCashNew') ? byId('deliveryAdjustCashNew').value : '', oldCash);
    var newBank = readCorrectedMoney(byId('deliveryAdjustBankNew') ? byId('deliveryAdjustBankNew').value : '', oldBank);
    var newReward = readCorrectedMoney(byId('deliveryAdjustRewardNew') ? byId('deliveryAdjustRewardNew').value : '', oldReward);
    var currentCashAmount = oldCash;
    var correctedCashAmount = newCash;
    var currentBankAmount = oldBank;
    var correctedBankAmount = newBank;
    var currentRewardAmount = oldReward;
    var correctedRewardAmount = newReward;
    var cashDeltaAmount = correctedCashAmount - currentCashAmount;
    var bankDeltaAmount = correctedBankAmount - currentBankAmount;
    var rewardDeltaAmount = correctedRewardAmount - currentRewardAmount;
    var currentTotalCollected = currentCashAmount + currentBankAmount + currentRewardAmount;
    var correctedTotalCollected = correctedCashAmount + correctedBankAmount + correctedRewardAmount;
    var totalCollectedDelta = correctedTotalCollected - currentTotalCollected;
    var cashDelta = totalCollectedDelta;
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
      cashDeltaAmount: cashDeltaAmount,
      bankDeltaAmount: bankDeltaAmount,
      rewardDeltaAmount: rewardDeltaAmount,
      currentTotalCollected: currentTotalCollected,
      correctedTotalCollected: correctedTotalCollected,
      totalCollectedDelta: totalCollectedDelta,
      cashDelta: cashDelta,
      debtDelta: debtDelta,
      finalDebtAfter: num(row.finalDebtAmount) + debtDelta
    };
  }

  function tabButton(key, label) {
    var title = isConfirmed(state.adjustmentRow) ? 'Đơn đã chốt sổ. Một số tab dùng để kiểm tra; thay đổi sẽ tạo version correction, không sửa bản cũ.' : 'Xem ' + label;
    return '<button type="button" class="delivery-new-tab ' + (state.activeTab === key ? 'active' : '') + '" data-tab="' + key + '" title="' + esc(title) + '">' + esc(label) + '</button>';
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
        '<td class="num" id="deliveryDeltaQty' + index + '">' + esc(deltaQty) + '</td>' +
        '<td class="num delivery-new-return" id="deliveryReturnAmount' + index + '">' + money(returnAmount) + '</td>' +
        '<td class="num delivery-new-return" id="deliveryDeltaAmount' + index + '">' + money(deltaAmount) + '</td>' +
      '</tr>';
    }).join('');
    var totalDelivered = state.correctionReturnItems.reduce(function (sum, item) { return sum + Math.round(num(item.deliveredQty) * num(item.unitPrice)); }, 0);
    return '<table class="delivery-new-business-table"><thead><tr><th>Mã SP</th><th>Tên SP</th><th class="num">SL giao</th><th class="num">Đơn giá</th><th class="num">Thành tiền</th><th class="num">SL trả hiện tại</th><th class="num">SL trả đúng</th><th class="num">Chênh lệch SL</th><th class="num">Thành tiền trả</th><th class="num">Chênh lệch tiền</th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="delivery-new-preview-cards">' +
        detailCell('Tổng hàng giao', money(totalDelivered)) +
        detailCell('Tổng hàng trả hiện tại', money(row.returnedAmount), 'delivery-new-return') +
        detailCellValueId('Tổng hàng trả sau điều chỉnh', 'deliveryReturnAfterText', money(row.returnedAmount), 'delivery-new-return') +
        detailCellValueId('Chênh lệch hàng trả', 'deliveryReturnDeltaText', '0', 'delivery-new-return') +
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
    var currentCash = parseVietnameseMoney(row.cashAmount);
    var currentBank = parseVietnameseMoney(row.bankAmount);
    var reward = parseVietnameseMoney(row.rewardAmount) + parseVietnameseMoney(row.offsetAmount);
    var warning = (currentCash < 0 || currentBank < 0 || reward < 0)
      ? '<div class="delivery-new-safe-note delivery-new-correction-warning">Dữ liệu tiền thu hiện tại đang âm. Vui lòng kiểm tra phiên điều chỉnh trước hoặc chạy audit dữ liệu; vẫn có thể nhập giá trị đúng không âm để tạo version điều chỉnh.</div>'
      : '';
    return warning + '<div class="delivery-new-form-grid">' +
      '<label>Tiền mặt hiện tại<input disabled value="' + esc(money(currentCash)) + '"></label>' +
      '<label>Tiền mặt sau điều chỉnh<input id="deliveryAdjustCashNew" class="delivery-new-money-input" inputmode="numeric" placeholder="Nhập số tiền cuối cùng" value="' + esc(money(Math.max(0, currentCash))) + '"></label>' +
      '<label>Chuyển khoản hiện tại<input disabled value="' + esc(money(currentBank)) + '"></label>' +
      '<label>Chuyển khoản sau điều chỉnh<input id="deliveryAdjustBankNew" class="delivery-new-money-input" inputmode="numeric" placeholder="Nhập số tiền cuối cùng" value="' + esc(money(Math.max(0, currentBank))) + '"></label>' +
      '<label>Trả thưởng hiện tại<input disabled value="' + esc(money(reward)) + '"></label>' +
      '<label>Trả thưởng sau điều chỉnh<input id="deliveryAdjustRewardNew" class="delivery-new-money-input" inputmode="numeric" placeholder="Nhập số tiền cuối cùng" value="' + esc(money(Math.max(0, reward))) + '"></label>' +
      '</div>' +
      '<div class="delivery-new-safe-note delivery-new-final-amount-note">Nhập số tiền cuối cùng muốn ghi nhận. Hệ thống lưu giá trị này làm trạng thái mới; chênh lệch chỉ dùng để ghi lịch sử.</div>' +
      '<div class="delivery-new-preview-cards">' +
        detailCellValueId('Chênh lệch tiền mặt', 'deliveryCashDeltaText', '0') +
        detailCellValueId('Chênh lệch chuyển khoản', 'deliveryBankDeltaText', '0') +
        detailCellValueId('Chênh lệch trả thưởng', 'deliveryRewardDeltaText', '0') +
        detailCellValueId('Tổng chênh lệch tiền thu', 'deliveryCashTotalDeltaText', '0') +
      '</div>' +
      '<div class="delivery-new-safe-note">Giá trị sau điều chỉnh là trạng thái mới của version kế tiếp. Chênh lệch = số tiền sau điều chỉnh - số tiền hiện tại và chỉ dùng cho lịch sử/audit; không sinh AR-RECEIPT trực tiếp.</div>';
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
      return '<tr>' +
        '<td>v' + esc(v.closeoutVersion || '?') + '</td>' +
        '<td class="num">' + money(v.cashAmount ?? v.newCashAmount ?? v.cashCollectedAmount) + '</td>' +
        '<td class="num">' + money(v.bankAmount ?? v.newBankAmount) + '</td>' +
        '<td class="num">' + money(v.rewardAmount ?? v.newRewardAmount) + '</td>' +
        '<td class="num">' + money(v.debtAmount ?? v.finalDebtAmount ?? v.newDebtAmount) + '</td>' +
        '<td class="num">' + deltaMoney(v.cashDeltaAmount ?? 0) + '</td>' +
        '<td class="num">' + deltaMoney(v.bankDeltaAmount ?? 0) + '</td>' +
        '<td class="num">' + deltaMoney(v.rewardDeltaAmount ?? 0) + '</td>' +
        '<td>' + esc(v.reason || v.status || '') + '</td>' +
      '</tr>';
    }).join('');
    return '<h4>Lịch sử phiếu trả</h4>' + renderReturnOrdersBusiness(row) +
      '<h4>Lịch sử closeout version / điều chỉnh</h4>' +
      '<table class="delivery-new-business-table"><thead><tr><th>Version</th><th class="num">Tiền mặt mới</th><th class="num">Chuyển khoản mới</th><th class="num">Trả thưởng mới</th><th class="num">Công nợ mới</th><th class="num">CL tiền mặt</th><th class="num">CL chuyển khoản</th><th class="num">CL trả thưởng</th><th>Lý do / trạng thái</th></tr></thead><tbody>' + (versionRows || '<tr><td colspan="9">Chưa có version điều chỉnh.</td></tr>') + '</tbody></table>';
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
    if (state.adjustmentViewOnly) {
      updateAdjustmentPreview(row);
      Array.prototype.forEach.call(panel.querySelectorAll('input,textarea,select'), function (el) { el.disabled = true; });
      return;
    }
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
          setModalError('adjustment', 'Số lượng trả không được âm.');
          value = 0;
        }
        var item = state.correctionReturnItems[idx];
        if (item && value > qty(item.deliveredQty)) {
          input.value = item.deliveredQty;
          setModalError('adjustment', 'Số lượng trả không được vượt quá số lượng giao.');
        }
        if (item) item.newReturnQty = qty(input.value);
        updateAdjustmentPreview(row);
      });
    });
    ['deliveryAdjustCashNew', 'deliveryAdjustBankNew', 'deliveryAdjustRewardNew'].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.addEventListener('input', function () { updateAdjustmentPreview(row); });
        el.addEventListener('blur', function () {
          if (hasMoneyInputValue(el.value)) {
            el.value = formatVietnameseMoney(el.value);
          }
          updateAdjustmentPreview(row);
        });
      }
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
      setText('deliveryReturnAmount' + index, money(qty(item.newReturnQty) * num(item.unitPrice)));
      setText('deliveryDeltaAmount' + index, money(item.adjustmentAmount));
    });
    setText('deliveryReturnAfterText', money(totals.returnAfter));
    setText('deliveryReturnDeltaText', money(totals.returnDelta));
    setText('deliveryCashDeltaText', deltaMoney(totals.cashDeltaAmount));
    setText('deliveryBankDeltaText', deltaMoney(totals.bankDeltaAmount));
    setText('deliveryRewardDeltaText', deltaMoney(totals.rewardDeltaAmount));
    setText('deliveryCashTotalDeltaText', deltaMoney(totals.totalCollectedDelta));
  }

  function openAdjustmentPopup(row, options) {
    if (!row) return;
    options = options || {};
    var viewOnly = Boolean(options.viewOnly || options.fromNotification);
    state.adjustmentViewOnly = viewOnly;
    var modal = byId('deliveryTodayNewAdjustmentModal');
    if (!modal) return;
    state.adjustmentRow = row;
    state.activeTab = options.activeTab || (viewOnly ? 'history' : 'payments');
    clearModalNotice('adjustment');
    if (viewOnly) setModalNotice('adjustment', 'Đang mở chi tiết điều chỉnh từ thông báo. Màn này ở chế độ xem, không lưu sửa đổi.', 'info');
    state.correctionReturnItems = buildReturnEditItems(row);
    var footerHtml = viewOnly
      ? '<div class="delivery-new-modal-footer"><div class="delivery-new-safe-note wide">Mở từ thông báo: chỉ xem lịch sử điều chỉnh, không phát hành/ghi thêm dữ liệu.</div><button type="button" id="deliveryAdjustmentClose" class="secondary">Đóng</button></div>'
      : '<div class="delivery-new-modal-footer">' +
          '<label>Lý do điều chỉnh / tùy chọn<input id="deliveryAdjustmentReason" placeholder="Có thể để trống"></label>' +
          '<label>Ghi chú<input id="deliveryAdjustmentNote" placeholder="Ghi chú thêm nếu có"></label>' +
          '<button type="button" id="deliveryAdjustmentClose" class="secondary">Đóng</button>' +
          '<button type="button" id="deliveryAdjustmentSave" class="primary-action">Lưu điều chỉnh</button>' +
        '</div>';
    modal.hidden = false;
    modal.innerHTML = '' +
      '<div class="delivery-new-adjustment-dialog">' +
        '<div class="delivery-new-modal-header">' +
          '<div><h3>' + esc(viewOnly ? 'Chi tiết điều chỉnh đơn giao' : 'Điều chỉnh đơn giao') + ' - ' + esc(row.orderCode || row.orderId) + '</h3>' +
            '<small>' + esc(row.customerCode || '') + ' - ' + esc(row.customerName || '') + '</small>' +
            '<small>NVBH: ' + esc((row.salesStaffCode || '') + ' - ' + (row.salesStaffName || '')) + ' · NVGH: ' + esc((row.deliveryStaffCode || '') + ' - ' + (row.deliveryStaffName || '')) + ' · Ngày giao: ' + esc(row.deliveryDate || '') + ' · Trạng thái: ' + esc(statusLabel(row)) + '</small></div>' +
          '<button type="button" id="deliveryTodayNewModalCloseTop" class="delivery-new-modal-close" aria-label="Đóng modal điều chỉnh đơn giao">Đóng</button>' +
        '</div>' +
        (viewOnly ? '<div class="delivery-new-safe-note delivery-new-correction-warning">Đang xem từ thông báo. Popup mở thẳng tab Lịch sử để kiểm tra chênh lệch; không cho lưu điều chỉnh trong chế độ này.</div>' : (isConfirmed(row) ? '<div class="delivery-new-safe-note">Đơn đã chốt sổ/xác nhận kế toán. Mọi thay đổi sẽ tạo version mới, không sửa bản cũ.</div><div class="delivery-new-safe-note">Đơn đã chốt sổ. Tab Thu tiền cho phép tạo correction tiền thu; các tab khác dùng để kiểm tra dữ liệu trước khi lưu.</div>' : '<div class="delivery-new-safe-note">Đơn chưa chốt sổ. Admin/kế toán có thể cập nhật trạng thái thu tiền hiện tại trước khi chốt.</div>')) +
        '<div class="delivery-new-tabs">' +
          tabButton('overview', 'Tổng quan') +
          tabButton('delivery', 'Hàng giao') +
          tabButton('returns', 'Hàng trả') +
          tabButton('payments', 'Thu tiền') +
          tabButton('debt', 'Công nợ') +
          tabButton('history', 'Lịch sử') +
        '</div>' +
        modalNoticeHtml('adjustment') +
        '<div id="deliveryTodayNewAdjustmentContent" class="delivery-new-tab-panel"></div>' +
        footerHtml +
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
    if (save && !viewOnly) save.addEventListener('click', function () { submitAdjustmentPopup(row); });
    renderAdjustmentTab(row);
    loadCanonicalReturnRows(row);
    loadVersions(row).then(function () {
      if (state.adjustmentRow && rowKey(state.adjustmentRow) === rowKey(row) && state.activeTab === 'history') {
        renderAdjustmentTab(row);
        var versions = state.versionCache[rowKey(row)] || [];
        if (viewOnly && !versions.length) setModalNotice('adjustment', 'Đơn đã được tìm thấy nhưng chưa lấy được chi tiết điều chỉnh/version. Bạn vẫn có thể xem thông tin đơn hiện tại.', 'warning');
      }
    }).catch(function () {
      if (viewOnly) setModalNotice('adjustment', 'Đơn đã được tìm thấy nhưng chưa lấy được chi tiết điều chỉnh.', 'warning');
    });
  }

  function closeAdjustmentPopup() {
    var modal = byId('deliveryTodayNewAdjustmentModal');
    if (modal) { modal.hidden = true; modal.innerHTML = ''; }
    state.adjustmentRow = null;
    state.adjustmentViewOnly = false;
    state.correctionReturnItems = [];
    state.activeTab = 'overview';
    clearModalNotice('adjustment');
  }

  async function submitAdjustmentPopup(row) {
    return runCommandOnce('delivery.adjustment.' + rowKey(row), async function () {
    var reasonEl = byId('deliveryAdjustmentReason');
    var noteEl = byId('deliveryAdjustmentNote');
    var reason = reasonEl ? reasonEl.value.trim() : '';
    var note = noteEl ? noteEl.value.trim() : '';
    var totals = totalsFromPopup(row);
    if (totals.newCash < 0) { setModalError('adjustment', 'Tiền mặt sau điều chỉnh không được âm.'); return; }
    if (totals.newBank < 0) { setModalError('adjustment', 'Chuyển khoản sau điều chỉnh không được âm.'); return; }
    if (totals.newReward < 0) { setModalError('adjustment', 'Trả thưởng sau điều chỉnh không được âm.'); return; }
    if (totals.correctedTotalCollected < 0) { setModalError('adjustment', 'Tổng tiền thu sau điều chỉnh không được âm.'); return; }
    var fullReturnItems = totals.returnItems;
    var correctedReturnItems = totals.returnItems.filter(function (item) { return qty(item.adjustmentQty) !== 0; });
    var cashLines = [
      { paymentMethod: 'cash', oldAmount: totals.oldCash, newAmount: totals.newCash, adjustmentAmount: totals.newCash - totals.oldCash },
      { paymentMethod: 'bank', oldAmount: totals.oldBank, newAmount: totals.newBank, adjustmentAmount: totals.newBank - totals.oldBank },
      { paymentMethod: 'reward', oldAmount: totals.oldReward, newAmount: totals.newReward, adjustmentAmount: totals.newReward - totals.oldReward }
    ].filter(function (line) { return num(line.adjustmentAmount) !== 0; });

    if (correctedReturnItems.some(function (item) { return qty(item.newReturnQty) < 0; })) {
      setModalError('adjustment', 'Số lượng trả không được âm.');
      return;
    }
    if (correctedReturnItems.some(function (item) { return qty(item.newReturnQty) > qty(item.deliveredQty); })) {
      setModalError('adjustment', 'Số lượng trả không được vượt quá số lượng giao.');
      return;
    }

    try {
      var res = await fetch(correctionEndpoint(row), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correctedReturnItems: correctedReturnItems,
          returnAdjustmentItems: fullReturnItems,
          returnAdjustment: {
            source: 'delivery-adjustment-popup',
            items: fullReturnItems
          },
          returnAdjustmentAmount: totals.returnDelta,
          correctedCashLines: cashLines,
          paymentCorrection: {
            currentCashAmount: totals.oldCash,
            correctedCashAmount: totals.newCash,
            cashDeltaAmount: totals.cashDeltaAmount,
            currentBankAmount: totals.oldBank,
            correctedBankAmount: totals.newBank,
            bankDeltaAmount: totals.bankDeltaAmount,
            currentRewardAmount: totals.oldReward,
            correctedRewardAmount: totals.newReward,
            rewardDeltaAmount: totals.rewardDeltaAmount,
            currentTotalCollected: totals.currentTotalCollected,
            correctedTotalCollected: totals.correctedTotalCollected,
            totalCollectedDelta: totals.totalCollectedDelta
          },
          reason: reason,
          note: note
        })
      });
      var json = await readJsonResponse(res, 'Không tạo được điều chỉnh');
      setModalNotice('adjustment', json.message || (json.data && json.data.returnUpdated ? 'Đã cập nhật hàng trả.' : 'Đã lưu điều chỉnh.'), 'success');
      patchAdjustmentRow(row, json);
    } catch (err) {
      setModalError('adjustment', err.message || 'Không tạo được điều chỉnh');
    }
    return null;
    });
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
      if (state.adjustmentRow && rowKey(state.adjustmentRow) === rowKey(row)) setModalNotice('adjustment', 'Đã tải lịch sử version.', 'info');
    } catch (err) {
      if (state.adjustmentRow && rowKey(state.adjustmentRow) === rowKey(row)) setModalError('adjustment', err.message || 'Không tải được lịch sử version');
    }
  }


  function dateInputValue(value) {
    var raw = normalizedText(value);
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? match[1] + '-' + match[2] + '-' + match[3] : '';
  }

  function applyDeepLinkFilters(payload) {
    payload = payload || {};
    ensureRoot();
    closeAllSuggestions();
    var dateInput = byId('deliveryTodayNewDate');
    var searchInput = byId('deliveryTodayNewSearch');
    var rawOrderId = normalizedText(payload.orderId);
    var orderLookup = firstText([payload.orderCode, isCloseoutContextId(rawOrderId) ? '' : rawOrderId]);
    if (dateInput) {
      dateInput.value = payload.deliveryDate ? dateInputValue(payload.deliveryDate) : '';
      state.deliveryDateTouched = Boolean(dateInput.value);
    }
    if (searchInput) searchInput.value = orderLookup;
    var deliveryInput = byId('deliveryTodayNewDelivery');
    var salesmanInput = byId('deliveryTodayNewSalesman');
    if (deliveryInput && payload.deliveryStaffCode) deliveryInput.value = payload.deliveryStaffCode;
    if (salesmanInput && payload.salesStaffCode) salesmanInput.value = payload.salesStaffCode;
    resetSelectedFilter('search');
    resetSelectedFilter('delivery');
    resetSelectedFilter('salesman');
    if (payload.orderCode) state.selectedFilters.orderCode = normalizedText(payload.orderCode);
    else if (payload.orderId && !isCloseoutContextId(payload.orderId)) state.selectedFilters.orderCode = normalizedText(payload.orderId);
    if (payload.deliveryStaffCode) state.selectedFilters.deliveryStaffCode = normalizedText(payload.deliveryStaffCode);
    if (payload.salesStaffCode) state.selectedFilters.salesStaffCode = normalizedText(payload.salesStaffCode);
    state.userTouchedFilters = true;
    updateClearButtons();
  }

  function resolverPayloadFromResult(rawPayload, result) {
    var context = (result && result.context) || {};
    var adjustment = (result && result.adjustment) || {};
    var order = (result && result.order) || {};
    var row = (result && result.row) || null;
    return Object.assign({}, rawPayload || {}, {
      orderCode: firstText([context.orderCode, row && row.orderCode, order.orderCode, adjustment.orderCode, rawPayload && rawPayload.orderCode]),
      orderId: firstText([context.orderId, row && row.orderId, order.orderId, order.id, adjustment.orderId, rawPayload && rawPayload.orderId]),
      closeoutVersionId: firstText([context.closeoutVersionId, adjustment.closeoutVersionId, rawPayload && rawPayload.closeoutVersionId]),
      deliveryDate: firstText([context.deliveryDate, row && row.deliveryDate, order.deliveryDate, adjustment.deliveryDate, rawPayload && rawPayload.deliveryDate]),
      deliveryStaffCode: firstText([context.deliveryStaffCode, row && row.deliveryStaffCode, order.deliveryStaffCode, adjustment.deliveryStaffCode, rawPayload && rawPayload.deliveryStaffCode]),
      salesStaffCode: firstText([context.salesStaffCode, row && row.salesStaffCode, order.salesStaffCode, adjustment.salesStaffCode, rawPayload && rawPayload.salesStaffCode]),
      adjustmentId: firstText([adjustment.adjustmentId, adjustment.correctionId, rawPayload && rawPayload.adjustmentId]),
      adjustmentCode: firstText([adjustment.adjustmentCode, adjustment.correctionCode, rawPayload && rawPayload.adjustmentCode])
    });
  }

  function cacheResolverVersions(row, result) {
    if (!row || !result || !Array.isArray(result.versions)) return;
    state.versionCache[rowKey(row)] = result.versions;
  }

  async function resolveAdjustmentDeepLink(payload) {
    payload = payload || {};
    var params = new URLSearchParams();
    ['adjustmentCode', 'correctionCode', 'adjustmentId', 'correctionId', 'orderCode', 'orderId', 'salesOrderId', 'closeoutVersionId', 'deliveryDate', 'deliveryStaffCode', 'salesStaffCode'].forEach(function (key) {
      var value = normalizedText(payload[key]);
      if (value) params.set(key, value);
    });
    params.set('filtersBefore', JSON.stringify(filters()));
    var res = await fetch('/api/new/delivery-today/adjustments/resolve?' + params.toString());
    var json = await res.json().catch(function () { return {}; });
    if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không resolve được chi tiết điều chỉnh đơn giao.');
    return json.data || json;
  }

  async function openAdjustmentFromDeepLink(rawPayload) {
    var payload = rawPayload || {};
    var orderLabel = firstText([payload.orderCode, isCloseoutContextId(payload.orderId) ? '' : payload.orderId, payload.adjustmentCode, payload.adjustmentId, payload.closeoutVersionId]);
    ensureRoot();
    var requestSeq = ++state.deepLinkRequestSeq;
    if (!orderLabel) {
      setMessage('Không đủ dữ liệu để mở trực tiếp chi tiết điều chỉnh. Cần adjustmentCode/correctionCode hoặc mã đơn.', true);
      return;
    }

    var resolverResult = null;
    if (payload.adjustmentCode || payload.adjustmentId || payload.closeoutVersionId) {
      setMessage('Đang resolve chi tiết điều chỉnh theo adjustmentCode/correctionCode...');
      try {
        resolverResult = await resolveAdjustmentDeepLink(payload);
        if (requestSeq !== state.deepLinkRequestSeq) return;
        if (resolverResult && resolverResult.sourceNote) renderDeliverySourceNote(resolverResult.sourceNote);
        payload = resolverPayloadFromResult(payload, resolverResult);
        orderLabel = firstText([payload.orderCode, isCloseoutContextId(payload.orderId) ? '' : payload.orderId, payload.adjustmentCode, payload.closeoutVersionId]);
      } catch (err) {
        state.deepLinkTargetKey = '';
        renderRows();
        setMessage((err && err.message) || 'Không tìm thấy bản ghi điều chỉnh theo adjustmentCode/correctionCode.', true);
        return;
      }
    }

    applyDeepLinkFilters(payload);
    state.deepLinkTargetKey = '';
    renderRows();
    setMessage('Đang tải đúng ngữ cảnh để mở chi tiết điều chỉnh đơn ' + orderLabel + '...');

    var rowFromResolver = resolverResult && resolverResult.row ? resolverResult.row : null;
    if (rowFromResolver) cacheResolverVersions(rowFromResolver, resolverResult);

    await load({ silent: true });
    if (requestSeq !== state.deepLinkRequestSeq) return;
    var row = findRowByDeepLink(payload) || rowFromResolver;
    if (!row) {
      state.deepLinkTargetKey = '';
      renderRows();
      if (resolverResult && resolverResult.adjustmentFound && resolverResult.orderFound === false) {
        setMessage('Đã tìm thấy bản ghi điều chỉnh nhưng không tìm thấy đơn gốc trong orders. Mở chi tiết điều chỉnh ở chế độ chỉ xem.', true);
      } else if (payload.adjustmentCode || payload.adjustmentId) {
        setMessage('Tìm thấy thông tin điều chỉnh nhưng chưa dựng được dòng đơn để mở popup. Kiểm tra lại adjustmentCode/correctionCode.', true);
      } else {
        setMessage('Không tìm thấy đơn ' + orderLabel + ' trong phạm vi đang lọc. Thiếu adjustmentCode nên không thể mở bằng resolver điều chỉnh.', true);
      }
      return;
    }
    cacheResolverVersions(row, resolverResult);
    state.deepLinkTargetKey = orderSelectionKey(row);
    renderRows();
    scrollToDeepLinkRow(row);
    var warnings = resolverResult && Array.isArray(resolverResult.warnings) ? resolverResult.warnings : [];
    var warningText = warnings.length ? ' Cảnh báo: ' + warnings.join(' | ') : '';
    setMessage('Đã mở chi tiết điều chỉnh đơn ' + (row.orderCode || orderLabel) + '.' + warningText, Boolean(warnings.length));
    openAdjustmentPopup(row, { viewOnly: true, fromNotification: true, activeTab: 'history', adjustmentId: payload.adjustmentId, adjustmentCode: payload.adjustmentCode });
    clearDeliveryDeepLinkHash();
  }

  function handleDeliveryDeepLinkEvent(event) {
    openAdjustmentFromDeepLink((event && event.detail) || {}).catch(function (err) {
      setMessage((err && err.message) || 'Không mở được chi tiết điều chỉnh từ thông báo.', true);
    });
  }

  function applyInitialDeliveryDeepLink() {
    var payload = payloadFromHash();
    if (!payload) return;
    var currentHash = normalizedText(window.location.hash);
    if (state.deepLinkAppliedHash === currentHash) return;
    state.deepLinkAppliedHash = currentHash;
    var button = document.querySelector('.tab-button[data-tab="deliveryTodayNewTab"]');
    if (button && !document.getElementById('deliveryTodayNewTab')?.classList.contains('active')) button.click();
    setTimeout(function () {
      openAdjustmentFromDeepLink(payload).catch(function (err) {
        setMessage((err && err.message) || 'Không mở được chi tiết điều chỉnh từ đường dẫn.', true);
      });
    }, 120);
  }

  async function load(options) {
    options = options || {};
    var silent = Boolean(options.silent);
    ensureRoot();
    if (!hasValidSearchCriteria()) {
      var validationMessage = loadValidationMessage();
      resetResultsState('');
      if (!silent) setMessage(validationMessage, true);
      return;
    }
    var requestSeq = ++state.loadRequestSeq;
    if (state.loadAbortController && typeof state.loadAbortController.abort === 'function') state.loadAbortController.abort();
    var loadController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    state.loadAbortController = loadController;
    if (!silent) setMessage('');
    renderEmptyState('', 'Đang tải đơn...');
    setResultSectionsVisible(false);
    try {
      var params = new URLSearchParams(filters());
      var res = await fetch('/api/new/delivery-today/orders?' + params.toString(), loadController ? { signal: loadController.signal } : undefined);
      var json = await res.json();
      if (requestSeq !== state.loadRequestSeq) return;
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được dữ liệu');
      var data = json.data || json;
      if ((data && data.requireFilter) || (json.diagnostics && json.diagnostics.searchCriteriaRequired && !hasValidSearchCriteria())) {
        var guardMessage = (data && data.message) || loadValidationMessage();
        resetResultsState('');
        if (!silent) setMessage(guardMessage, true);
        return;
      }
      state.rows = data.rows || data.orders || json.rows || [];
      state.salesmanGroups = buildSalesmanGroups(state.rows);
      state.selectedSalesmanKeys = {};
      state.selectedOrderIds = new Set();
      state.salesmanGroups.forEach(function (group) { state.selectedSalesmanKeys[group.key] = true; });
      selectDefaultOrdersForSelectedSalesmen();
      state.selectedIndex = state.rows.length ? 0 : -1;
      state.loaded = true;
      state.hasSearched = true;
      setResultSectionsVisible(true);
      renderDeliverySourceNote(data.sourceNote || json.sourceNote || (data.sourceNotes && data.sourceNotes.orders) || null);
      updateTopKpisFromSelectedSalesmen();
      renderSalesmanGroupPanel();
      renderRows();
      if (!silent) setMessage('');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (requestSeq !== state.loadRequestSeq) return;
      state.rows = [];
      state.salesmanGroups = [];
      state.selectedSalesmanKeys = {};
      state.selectedOrderIds = new Set();
      state.hasSearched = true;
      setResultSectionsVisible(true);
      applySummary({});
      renderSalesmanGroupPanel();
      renderRows();
      if (!silent) setMessage(err.message || 'Không tải được Đơn giao hôm nay (New)', true);
    }
  }

  function initWhenTabActive(tabId) {
    if (tabId !== 'deliveryTodayNewTab') return;
    ensureRoot();
    applyInitialDeliveryDeepLink();
  }

  window.addEventListener('mkpro:delivery-open-adjustment', handleDeliveryDeepLinkEvent);
  window.addEventListener('hashchange', applyInitialDeliveryDeepLink);

  document.addEventListener('DOMContentLoaded', function () {
    ensureRoot();
    Array.prototype.forEach.call(document.querySelectorAll('.tab-button[data-tab="deliveryTodayNewTab"]'), function (button) {
      button.addEventListener('click', function () { initWhenTabActive('deliveryTodayNewTab'); });
    });
    setTimeout(applyInitialDeliveryDeepLink, 150);
  });

  window.loadDeliveryTodayNew = load;
  window.openDeliveryTodayAdjustmentFromNotification = openAdjustmentFromDeepLink;
}());
