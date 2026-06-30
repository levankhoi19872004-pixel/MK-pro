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
    collections: []
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
      '<section class="card">' +
        '<div class="ui-page-header">' +
          '<div><h2>Công nợ (New)</h2><p class="muted">Read model mới chỉ tính từ <b>AR-DEBT-OPEN</b>, <b>AR-DEBT-PAYMENT</b>, <b>AR-DEBT-ADJUSTMENT</b>, <b>AR-DEBT-VOID</b>. Không đọc AR-SALE/AR-RETURN/AR-RECEIPT legacy.</p></div>' +
          '<div class="ui-page-actions"><span class="new-badge">AR-DEBT-* only</span></div>' +
        '</div>' +
        '<div class="new-module-toolbar" role="search" aria-label="Bộ lọc Công nợ New">' +
          '<label class="wide">Tìm khách / đơn<input id="debtNewSearch" autocomplete="off" placeholder="Mã KH, tên KH, mã đơn"></label>' +
          '<label>NVBH<input id="debtNewSalesman" autocomplete="off" placeholder="Mã/tên NVBH"></label>' +
          '<label>NVGH<input id="debtNewDelivery" autocomplete="off" placeholder="Mã/tên NVGH"></label>' +
          '<label>Trạng thái<select id="debtNewStatus"><option value="open">Còn nợ</option><option value="all">Tất cả</option><option value="paid">Hết nợ</option><option value="overpaid">Dư có</option></select></label>' +
          '<div class="actions"><button id="debtNewLoad" type="button" class="primary-action">Tải New</button><button id="debtNewReset" type="button" class="secondary">Xóa lọc</button></div>' +
        '</div>' +
        '<p id="debtNewMessage" class="message"></p>' +
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
      '<section class="new-two-pane debt-new-results">' +
        '<section class="card"><h3>Khách công nợ New</h3><div class="new-table-wrap"><table class="new-table"><thead><tr><th>Khách hàng</th><th>NVBH / NVGH</th><th>Số đơn</th><th>Còn nợ</th><th>Trạng thái</th></tr></thead><tbody id="debtNewCustomerTable"><tr><td colspan="5">Chưa tải dữ liệu.</td></tr></tbody></table></div></section>' +
        '<section class="card"><h3>Đơn của khách / Phiếu thu</h3><div id="debtNewDetail" class="new-detail-list"><div class="empty-state">Chọn một khách để xem đơn nợ.</div></div></section>' +
      '</section>' +
      '<section class="card debt-new-collections-panel debt-new-results"><div class="ui-page-header"><div><h3>Phiếu thu chờ xác nhận</h3><p class="muted">Phiếu <b>submitted</b> chưa làm giảm công nợ. Chỉ khi kế toán xác nhận mới sinh <b>AR-DEBT-PAYMENT</b> và fund ledger theo contract backend.</p></div><button id="debtNewReloadCollections" type="button" class="secondary">Tải phiếu</button></div><div id="debtNewCollectionsList" class="new-detail-list"><div class="empty-state">Chưa tải phiếu thu.</div></div></section>';

    ensureScopedStyle();
    var loadButton = byId('debtNewLoad');
    var resetButton = byId('debtNewReset');
    var reloadCollections = byId('debtNewReloadCollections');
    if (loadButton) loadButton.addEventListener('click', load);
    if (resetButton) resetButton.addEventListener('click', resetFiltersToEmptyState);
    if (reloadCollections) reloadCollections.addEventListener('click', loadCollections);
    ['debtNewSearch', 'debtNewSalesman', 'debtNewDelivery'].forEach(function (id) {
      var el = byId(id);
      if (el) {
        el.addEventListener('input', function () { state.userTouchedFilters = true; });
        el.addEventListener('change', function () { state.userTouchedFilters = true; });
        el.addEventListener('keydown', function (event) { if (event.key === 'Enter') load(); });
      }
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
      '.debt-new-empty-state{margin:12px 0;padding:20px;text-align:center;border:1px dashed #cbd5e1;background:#f8fafc;color:#334155;}.debt-new-empty-state b{display:block;font-size:16px;margin-bottom:6px;color:#0f172a;}.debt-new-empty-state span{display:block;color:#64748b;font-weight:700;}.debt-new-results-hidden{display:none!important;}.debt-new-status{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-weight:800;font-size:12px;background:#eef2ff;color:#1d0fb4;}.debt-new-status.open{background:#fee2e2;color:#b91c1c;}.debt-new-status.paid{background:#dcfce7;color:#166534;}.debt-new-status.overpaid{background:#e0f2fe;color:#075985;}.debt-new-allocation-box{border:1px solid #dbe7f5;border-radius:12px;padding:12px;margin-top:12px;background:#f8fafc;}.debt-new-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0;}.debt-new-form-grid label{display:flex;flex-direction:column;gap:4px;font-weight:800;color:#334155;}.debt-new-form-grid input,.debt-new-form-grid select{padding:8px;border:1px solid #cbd5e1;border-radius:10px;}.debt-new-order-check{width:16px;height:16px;}.debt-new-collection-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:10px;}.debt-new-collection-card{border:1px solid #dbe7f5;border-radius:12px;padding:10px;margin:8px 0;background:#fff;}.debt-new-collection-card h4{margin:0 0 6px;}.debt-new-collection-card small{display:block;color:#64748b;margin-top:2px;}.debt-new-allocation-warning{color:#b91c1c;font-weight:800;}.new-table tbody tr.active{background:#eff6ff;}';
    document.head.appendChild(style);
  }

  function filters() {
    return {
      q: byId('debtNewSearch') ? byId('debtNewSearch').value.trim() : '',
      salesman: byId('debtNewSalesman') ? byId('debtNewSalesman').value.trim() : '',
      delivery: byId('debtNewDelivery') ? byId('debtNewDelivery').value.trim() : '',
      status: byId('debtNewStatus') ? byId('debtNewStatus').value : 'open'
    };
  }

  function hasValidSearchCriteria() {
    var f = filters();
    return Boolean(f.q || f.salesman || f.delivery);
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
      tbody.innerHTML = '<tr><td colspan="5">Vui lòng chọn điều kiện tìm kiếm rồi bấm Tải.</td></tr>';
      renderDetail(null);
      return;
    }
    if (!state.customers.length) {
      tbody.innerHTML = '<tr><td colspan="5">Không tìm thấy dữ liệu phù hợp với điều kiện tìm kiếm.</td></tr>';
      renderDetail(null);
      return;
    }
    tbody.innerHTML = state.customers.map(function (row, index) {
      var status = String(row.status || 'open').toLowerCase();
      return '<tr data-index="' + index + '" class="' + (index === state.selectedIndex ? 'active' : '') + '">' +
        '<td><b>' + esc(row.customerCode || '') + '</b><br><small>' + esc(row.customerName || '') + (row.phone ? ' · ' + esc(row.phone) : '') + '</small></td>' +
        '<td><small>NVBH: ' + esc([row.salesStaffCode || row.salesmanCode, row.salesStaffName || row.salesmanName].filter(Boolean).join(' - ') || '-') + '</small><br><small>NVGH: ' + esc([row.deliveryStaffCode, row.deliveryStaffName].filter(Boolean).join(' - ') || '-') + '</small></td>' +
        '<td class="new-money">' + esc(row.orderCount || 0) + '</td>' +
        '<td class="new-money ' + (num(row.debt) > 0 ? 'new-debt-positive' : 'new-credit') + '">' + money(row.debt) + '</td>' +
        '<td><span class="debt-new-status ' + esc(status) + '">' + esc(statusLabel(status)) + '</span></td>' +
      '</tr>';
    }).join('');
    Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-index]'), function (tr) {
      tr.addEventListener('click', function () {
        state.selectedIndex = Number(tr.dataset.index);
        state.selectedOrderKeys = {};
        renderCustomers();
        renderDetail(selectedCustomer());
        loadCollections();
      });
    });
    if (state.selectedIndex < 0 && state.customers.length) state.selectedIndex = 0;
    renderDetail(selectedCustomer());
  }

  function renderDetail(customer) {
    var box = byId('debtNewDetail');
    if (!box) return;
    if (!state.hasSearched) { box.innerHTML = '<div class="empty-state">Vui lòng tìm kiếm trước khi xem đơn nợ.</div>'; return; }
    if (!customer) { box.innerHTML = '<div class="empty-state">Không có khách công nợ phù hợp.</div>'; return; }
    var orders = Array.isArray(customer.orders) ? customer.orders : [];
    var orderRows = orders.map(function (order, index) {
      var key = orderKey(order) || String(index);
      var checked = state.selectedOrderKeys[key] ? ' checked' : '';
      return '<tr>' +
        '<td><input class="debt-new-order-check" type="checkbox" data-order-index="' + index + '"' + checked + '></td>' +
        '<td><b>' + esc(order.orderCode || order.orderId) + '</b><br><small>' + esc(order.orderDate || order.lastDebtDate || '') + '</small></td>' +
        '<td class="new-money">' + money(order.debit) + '</td>' +
        '<td class="new-money new-credit">' + money(order.credit) + '</td>' +
        '<td class="new-money ' + (openDebt(order) > 0 ? 'new-debt-positive' : 'new-credit') + '">' + money(order.debt) + '</td>' +
        '<td><span class="debt-new-status ' + esc(order.status || 'open') + '">' + esc(statusLabel(order.status)) + '</span></td>' +
      '</tr>';
    }).join('');
    box.innerHTML = '<div class="new-safe-note">Nguồn đọc: AR-DEBT-* only. Phiếu thu <b>submitted</b> chưa làm giảm nợ; confirm mới post <b>AR-DEBT-PAYMENT</b> và fund ledger.</div>' +
      '<div class="new-detail-row"><span>Khách hàng</span><b>' + esc((customer.customerCode || '') + ' - ' + (customer.customerName || '')) + '</b></div>' +
      '<div class="new-detail-row"><span>Tổng nợ</span><b class="' + (num(customer.debt) > 0 ? 'new-debt-positive' : 'new-credit') + '">' + money(customer.debt) + '</b></div>' +
      '<div class="new-table-wrap"><table class="new-table"><thead><tr><th>Thu</th><th>Đơn</th><th>Debit</th><th>Credit</th><th>Còn nợ</th><th>Trạng thái</th></tr></thead><tbody>' +
      (orderRows || '<tr><td colspan="6">Khách này không có đơn trong read model New.</td></tr>') +
      '</tbody></table></div>' +
      '<div id="debtNewCollectionBox" class="debt-new-allocation-box"></div>';
    Array.prototype.forEach.call(box.querySelectorAll('.debt-new-order-check'), function (input) {
      input.addEventListener('change', function () {
        var order = orders[Number(input.dataset.orderIndex)];
        if (!order) return;
        state.selectedOrderKeys[orderKey(order)] = input.checked;
        renderCollectionForm(customer);
      });
    });
    renderCollectionForm(customer);
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
      await load();
    } catch (err) {
      setMessage(err.message || 'Không tạo được phiếu thu công nợ', true);
    }
  }

  function renderCollections() {
    var box = byId('debtNewCollectionsList');
    if (!box) return;
    if (!state.hasSearched) { box.innerHTML = '<div class="empty-state">Vui lòng tìm khách trước khi xem phiếu thu liên quan.</div>'; return; }
    if (!state.collections.length) { box.innerHTML = '<div class="empty-state">Chưa có phiếu thu chờ xác nhận theo phạm vi hiện tại.</div>'; return; }
    box.innerHTML = state.collections.map(function (row) {
      var id = row.id || row.code || '';
      var status = String(row.status || '').toLowerCase();
      return '<div class="debt-new-collection-card">' +
        '<h4>' + esc(row.code || row.id) + ' · <span class="debt-new-status ' + esc(status) + '">' + esc(statusLabel(status)) + '</span></h4>' +
        '<small>Khách: ' + esc((row.customerCode || '') + ' - ' + (row.customerName || '')) + '</small>' +
        '<small>Số tiền: <b>' + money(row.amount) + '</b> · ' + esc(row.paymentMethod || '') + ' · Người thu: ' + esc([row.collectorCode, row.collectorName].filter(Boolean).join(' - ')) + '</small>' +
        '<small>Phân bổ: ' + esc((row.allocations || []).map(function (a) { return (a.salesOrderCode || a.orderCode || '') + ':' + money(a.allocatedAmount || a.amount); }).join(' · ')) + '</small>' +
        (status === 'submitted' ? '<div class="debt-new-collection-actions"><button type="button" class="primary-action debtNewConfirmCollection" data-id="' + esc(id) + '" data-amount="' + esc(row.amount || 0) + '">Xác nhận</button><button type="button" class="secondary debtNewRejectCollection" data-id="' + esc(id) + '">Từ chối</button></div>' : '') +
      '</div>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.debtNewConfirmCollection'), function (btn) {
      btn.addEventListener('click', function () { confirmCollection(btn.dataset.id, btn.dataset.amount); });
    });
    Array.prototype.forEach.call(box.querySelectorAll('.debtNewRejectCollection'), function (btn) {
      btn.addEventListener('click', function () { rejectCollection(btn.dataset.id); });
    });
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
      await load();
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
      state.selectedIndex = state.customers.length ? 0 : -1;
      state.selectedOrderKeys = {};
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
