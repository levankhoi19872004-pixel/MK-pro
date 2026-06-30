(function () {
  'use strict';

  var rootId = 'debtNewRoot';
  var state = { customers: [], selectedIndex: -1, loaded: false };

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function num(value) { var n = Number(String(value || 0).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; }
  function money(value) { return num(value).toLocaleString('vi-VN'); }

  function ensureRoot() {
    var root = byId(rootId);
    if (!root) return null;
    if (root.dataset.phase91Ready === '1') return root;
    root.dataset.phase91Ready = '1';
    root.innerHTML = '' +
      '<section class="card">' +
        '<div class="ui-page-header">' +
          '<div><h2>Công nợ (New)</h2><p class="muted">Read model mới chỉ tính từ <b>AR-DEBT-OPEN</b>, <b>AR-DEBT-PAYMENT</b>, <b>AR-DEBT-ADJUSTMENT</b>, <b>AR-DEBT-VOID</b>. Không đọc AR-SALE/AR-RETURN/AR-RECEIPT legacy.</p></div>' +
          '<div class="ui-page-actions"><span class="new-badge">AR-DEBT-* only</span></div>' +
        '</div>' +
        '<div class="new-module-toolbar" role="search" aria-label="Bộ lọc Công nợ New">' +
          '<label class="wide">Tìm khách / đơn<input id="debtNewSearch" placeholder="Mã KH, tên KH, mã đơn"></label>' +
          '<label>NVBH<input id="debtNewSalesman" placeholder="Mã/tên NVBH"></label>' +
          '<label>NVGH<input id="debtNewDelivery" placeholder="Mã/tên NVGH"></label>' +
          '<label>Trạng thái<select id="debtNewStatus"><option value="open">Còn nợ</option><option value="all">Tất cả</option><option value="paid">Hết nợ</option><option value="overpaid">Dư có</option></select></label>' +
          '<div class="actions"><button id="debtNewLoad" type="button" class="primary-action">Tải New</button><button id="debtNewReset" type="button" class="secondary">Xóa lọc</button></div>' +
        '</div>' +
        '<p id="debtNewMessage" class="message"></p>' +
      '</section>' +
      '<section class="new-kpi-grid" aria-label="KPI Công nợ New">' +
        '<article class="new-kpi-card"><span>Tổng nợ</span><b id="debtNewTotalDebt">0</b></article>' +
        '<article class="new-kpi-card"><span>Khách</span><b id="debtNewCustomerCount">0</b></article>' +
        '<article class="new-kpi-card"><span>Đơn</span><b id="debtNewOrderCount">0</b></article>' +
        '<article class="new-kpi-card"><span>Debit</span><b id="debtNewDebit">0</b></article>' +
        '<article class="new-kpi-card"><span>Credit</span><b id="debtNewCredit">0</b></article>' +
      '</section>' +
      '<section class="new-two-pane">' +
        '<section class="card"><h3>Khách công nợ New</h3><div class="new-table-wrap"><table class="new-table"><thead><tr><th>Khách hàng</th><th>Số đơn</th><th>Debit</th><th>Credit</th><th>Còn nợ</th></tr></thead><tbody id="debtNewCustomerTable"><tr><td colspan="5">Chưa tải dữ liệu.</td></tr></tbody></table></div></section>' +
        '<section class="card"><h3>Đơn của khách</h3><div id="debtNewDetail" class="new-detail-list"><div class="empty-state">Chọn một khách để xem đơn nợ.</div></div></section>' +
      '</section>';

    var loadButton = byId('debtNewLoad');
    var resetButton = byId('debtNewReset');
    if (loadButton) loadButton.addEventListener('click', load);
    if (resetButton) resetButton.addEventListener('click', function () {
      ['debtNewSearch', 'debtNewSalesman', 'debtNewDelivery'].forEach(function (id) { var el = byId(id); if (el) el.value = ''; });
      var status = byId('debtNewStatus'); if (status) status.value = 'open';
      load();
    });
    ['debtNewSearch', 'debtNewSalesman', 'debtNewDelivery'].forEach(function (id) {
      var el = byId(id);
      if (el) el.addEventListener('keydown', function (event) { if (event.key === 'Enter') load(); });
    });
    var status = byId('debtNewStatus');
    if (status) status.addEventListener('change', load);
    return root;
  }

  function filters() {
    return {
      q: byId('debtNewSearch') ? byId('debtNewSearch').value.trim() : '',
      salesman: byId('debtNewSalesman') ? byId('debtNewSalesman').value.trim() : '',
      delivery: byId('debtNewDelivery') ? byId('debtNewDelivery').value.trim() : '',
      status: byId('debtNewStatus') ? byId('debtNewStatus').value : 'open'
    };
  }

  function setMessage(text, isError) {
    var message = byId('debtNewMessage');
    if (!message) return;
    message.textContent = text || '';
    message.className = 'message' + (isError ? ' error-text' : '');
  }

  function applySummary(summary) {
    summary = summary || {};
    var pairs = {
      debtNewTotalDebt: money(summary.totalDebt),
      debtNewCustomerCount: summary.customerCount || state.customers.length,
      debtNewOrderCount: summary.orderCount || 0,
      debtNewDebit: money(summary.totalDebit),
      debtNewCredit: money(summary.totalCredit)
    };
    Object.keys(pairs).forEach(function (id) { var el = byId(id); if (el) el.textContent = pairs[id]; });
  }

  function renderCustomers() {
    var tbody = byId('debtNewCustomerTable');
    if (!tbody) return;
    if (!state.customers.length) {
      tbody.innerHTML = '<tr><td colspan="5">Không có khách công nợ theo bộ lọc.</td></tr>';
      renderDetail(null);
      return;
    }
    tbody.innerHTML = state.customers.map(function (row, index) {
      return '<tr data-index="' + index + '" class="' + (index === state.selectedIndex ? 'active' : '') + '">' +
        '<td><b>' + esc(row.customerCode || '') + '</b><br><small>' + esc(row.customerName || '') + '</small></td>' +
        '<td class="new-money">' + esc(row.orderCount || 0) + '</td>' +
        '<td class="new-money">' + money(row.debit) + '</td>' +
        '<td class="new-money new-credit">' + money(row.credit) + '</td>' +
        '<td class="new-money ' + (num(row.debt) > 0 ? 'new-debt-positive' : 'new-credit') + '">' + money(row.debt) + '</td>' +
      '</tr>';
    }).join('');
    Array.prototype.forEach.call(tbody.querySelectorAll('tr[data-index]'), function (tr) {
      tr.addEventListener('click', function () {
        state.selectedIndex = Number(tr.dataset.index);
        renderCustomers();
        renderDetail(state.customers[state.selectedIndex]);
      });
    });
    if (state.selectedIndex < 0) {
      state.selectedIndex = 0;
      renderCustomers();
      return;
    }
    renderDetail(state.customers[state.selectedIndex]);
  }

  function renderDetail(customer) {
    var box = byId('debtNewDetail');
    if (!box) return;
    if (!customer) { box.innerHTML = '<div class="empty-state">Chọn một khách để xem đơn nợ.</div>'; return; }
    var orders = customer.orders || [];
    box.innerHTML = '<div class="new-safe-note">Nguồn đọc: AR-DEBT-* only. Thu tiền mới nên đi qua AR-DEBT-PAYMENT, không dùng AR-RECEIPT legacy.</div>' +
      '<div class="new-detail-row"><span>Khách hàng</span><b>' + esc((customer.customerCode || '') + ' - ' + (customer.customerName || '')) + '</b></div>' +
      '<div class="new-detail-row"><span>Tổng nợ</span><b class="' + (num(customer.debt) > 0 ? 'new-debt-positive' : 'new-credit') + '">' + money(customer.debt) + '</b></div>' +
      '<div class="new-table-wrap"><table class="new-table"><thead><tr><th>Đơn</th><th>Debit</th><th>Credit</th><th>Còn nợ</th></tr></thead><tbody>' +
      (orders.length ? orders.map(function (order) {
        return '<tr><td><b>' + esc(order.orderCode || order.orderId) + '</b><br><small>' + esc(order.lastDebtDate || '') + '</small></td><td class="new-money">' + money(order.debit) + '</td><td class="new-money new-credit">' + money(order.credit) + '</td><td class="new-money ' + (num(order.debt) > 0 ? 'new-debt-positive' : 'new-credit') + '">' + money(order.debt) + '</td></tr>';
      }).join('') : '<tr><td colspan="4">Khách này không có đơn trong read model New.</td></tr>') +
      '</tbody></table></div>';
  }

  async function load() {
    ensureRoot();
    setMessage('Đang tải Công nợ (New)...');
    try {
      var params = new URLSearchParams(filters());
      var res = await fetch('/api/new/debt/customers?' + params.toString());
      var json = await res.json();
      if (!res.ok || (!json.ok && !json.success)) throw new Error(json.message || 'Không tải được dữ liệu');
      var data = json.data || json;
      state.customers = data.customers || json.customers || [];
      state.selectedIndex = state.customers.length ? 0 : -1;
      state.loaded = true;
      applySummary(data.summary || json.summary || {});
      renderCustomers();
      setMessage('Đã tải ' + state.customers.length + ' khách từ read model New.');
    } catch (err) {
      state.customers = [];
      applySummary({});
      renderCustomers();
      setMessage(err.message || 'Không tải được Công nợ (New)', true);
    }
  }

  function initWhenTabActive(tabId) {
    if (tabId !== 'debtNewTab') return;
    ensureRoot();
    if (!state.loaded) load();
  }

  document.addEventListener('DOMContentLoaded', function () {
    ensureRoot();
    Array.prototype.forEach.call(document.querySelectorAll('.tab-button[data-tab="debtNewTab"]'), function (button) {
      button.addEventListener('click', function () { initWhenTabActive('debtNewTab'); });
    });
  });

  window.loadDebtNew = load;
}());
