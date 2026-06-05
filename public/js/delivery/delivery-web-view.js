(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function num(value) { return window.DeliveryCore ? window.DeliveryCore.toNumber(value) : Number(value || 0); }
  function money(value) { return window.DeliveryCore ? window.DeliveryCore.money(value) : String(Math.round(Number(value || 0))); }
  function amount(order, key) { return num(order && order.amounts && order.amounts[key]); }
  function orderKey(order) { return window.DeliveryCore.orderKey(order); }
  function today() { return new Date().toISOString().slice(0, 10); }

  var state = { selectedKey: '', activeTab: 'products' };

  function ensureRoot() {
    var root = byId('deliveryTodayRoot');
    if (root) return root;
    var tab = byId('deliveryTodayTab');
    if (!tab) return null;
    tab.innerHTML = '<section id="deliveryTodayRoot" class="delivery-v46-shell"></section>';
    return byId('deliveryTodayRoot');
  }

  function renderShell() {
    var root = ensureRoot();
    if (!root) return;
    root.innerHTML = '' +
      '<section class="delivery-v46-header card">' +
        '<div>' +
          '<h2>Đơn giao hôm nay</h2>' +
          '<p class="muted">Luồng chuẩn: <b>Giao hàng → Thu tiền → Hoàn tất</b>. Web và app dùng chung <b>DeliveryCore</b>, hàng trả một nguồn <b>returnOrders</b>.</p>' +
        '</div>' +
        '<div class="delivery-v46-filters">' +
          '<label>Ngày giao<input id="deliveryCoreDate" type="date"></label>' +
          '<label>NVGH<input id="deliveryCoreDeliveryStaff" placeholder="Mã/tên NVGH"></label>' +
          '<label>NVBH<input id="deliveryCoreSalesStaff" placeholder="Mã/tên NVBH"></label>' +
          '<label>Trạng thái<select id="deliveryCoreStatus"><option value="">Tất cả</option><option value="pending">Chờ giao</option><option value="assigned">Đã gán</option><option value="delivered">Đã giao</option></select></label>' +
          '<label>Tìm kiếm<input id="deliveryCoreSearch" placeholder="Mã đơn / khách hàng"></label>' +
          '<button id="deliveryCoreReload" type="button">Tải đơn</button>' +
          '<button id="deliveryCoreReconcile" type="button" class="secondary">Đối soát</button>' +
        '</div>' +
      '</section>' +
      '<section class="delivery-v46-kpis">' +
        '<div class="delivery-v46-kpi kpi-pt"><span>Phải thu</span><b id="deliveryKpiReceivable">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-tm"><span>Tiền mặt</span><b id="deliveryKpiCash">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-ck"><span>Chuyển khoản</span><b id="deliveryKpiBank">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-th"><span>Trả thưởng</span><b id="deliveryKpiReward">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-ht"><span>Hàng trả</span><b id="deliveryKpiReturn">0</b></div>' +
        '<div class="delivery-v46-kpi kpi-cn"><span>Còn nợ</span><b id="deliveryKpiDebt">0</b></div>' +
      '</section>' +
      '<main class="delivery-v46-layout">' +
        '<section class="card delivery-v46-list-panel">' +
          '<div class="delivery-v46-panel-title"><h3>Danh sách đơn</h3><span id="deliveryCoreCount">0 đơn</span></div>' +
          '<div class="delivery-v46-list-head delivery-v46-list-head-payment"><span>Đơn / Khách hàng</span><span>Nhân sự</span><span>Thanh toán</span></div>' +
          '<div id="deliveryCoreList" class="delivery-v46-list"><div class="empty-state">Chưa tải đơn.</div></div>' +
        '</section>' +
        '<aside class="card delivery-v46-detail-panel">' +
          '<div id="deliveryCoreDetail" class="delivery-v46-detail-empty">Chọn đơn bên trái để xem chi tiết.</div>' +
        '</aside>' +
      '</main>' +
      '<p id="deliveryCoreMessage" class="message"></p>';

    byId('deliveryCoreDate').value = today();
    byId('deliveryCoreReload').addEventListener('click', load);
    if (byId('deliveryCoreReconcile')) byId('deliveryCoreReconcile').addEventListener('click', reconcile);
    ['deliveryCoreDate', 'deliveryCoreDeliveryStaff', 'deliveryCoreSalesStaff', 'deliveryCoreStatus', 'deliveryCoreSearch'].forEach(function (id) {
      var input = byId(id);
      if (!input) return;
      input.addEventListener(id === 'deliveryCoreSearch' ? 'input' : 'change', debounce(load, 250));
    });
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      clearTimeout(timer);
      var args = arguments;
      timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  function filters() {
    return {
      date: byId('deliveryCoreDate') && byId('deliveryCoreDate').value,
      deliveryStaffCode: byId('deliveryCoreDeliveryStaff') && byId('deliveryCoreDeliveryStaff').value,
      salesStaffCode: byId('deliveryCoreSalesStaff') && byId('deliveryCoreSalesStaff').value,
      status: byId('deliveryCoreStatus') && byId('deliveryCoreStatus').value,
      q: byId('deliveryCoreSearch') && byId('deliveryCoreSearch').value
    };
  }

  function message(text, isError) {
    var node = byId('deliveryCoreMessage');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'message ' + (isError ? 'danger-text' : '');
  }

  function renderKpis() {
    var rows = window.DeliveryCore.state.orders || [];
    var sum = rows.reduce(function (acc, order) {
      acc.receivable += amount(order, 'receivable');
      acc.cash += amount(order, 'cash');
      acc.bank += amount(order, 'bank');
      acc.reward += amount(order, 'reward');
      acc.returnAmount += amount(order, 'returnAmount');
      acc.debt += amount(order, 'debt');
      return acc;
    }, { receivable: 0, cash: 0, bank: 0, reward: 0, returnAmount: 0, debt: 0 });
    if (byId('deliveryKpiReceivable')) byId('deliveryKpiReceivable').textContent = money(sum.receivable);
    if (byId('deliveryKpiCash')) byId('deliveryKpiCash').textContent = money(sum.cash);
    if (byId('deliveryKpiBank')) byId('deliveryKpiBank').textContent = money(sum.bank);
    if (byId('deliveryKpiReward')) byId('deliveryKpiReward').textContent = money(sum.reward);
    if (byId('deliveryKpiReturn')) byId('deliveryKpiReturn').textContent = money(sum.returnAmount);
    if (byId('deliveryKpiDebt')) byId('deliveryKpiDebt').textContent = money(sum.debt);
    if (byId('deliveryCoreCount')) byId('deliveryCoreCount').textContent = rows.length + ' đơn';
  }

  function statusText(order) {
    var st = (order.status && order.status.deliveryStatus) || order.deliveryStatus || order.status || 'pending';
    if (st === 'delivered') return 'Đã giao';
    if (st === 'assigned') return 'Đã gán';
    return 'Chờ giao';
  }


  function paymentChip(label, value, className, emptyText) {
    var n = num(value);
    var active = n > 0;
    var display = active ? money(n) : (emptyText || '0');
    return '<span class="delivery-v46-pay-chip ' + esc(className || '') + (active ? ' is-active' : ' is-zero') + '">' +
      '<em>' + esc(label) + '</em><b>' + esc(display) + '</b>' +
    '</span>';
  }

  function paymentChipsHtml(order) {
    var debt = amount(order, 'debt');
    return '' +
      '<div class="delivery-v46-payment-chips">' +
        paymentChip('PT', amount(order, 'receivable'), 'chip-pt') +
        paymentChip('TM', amount(order, 'cash'), 'chip-tm') +
        paymentChip('CK', amount(order, 'bank'), 'chip-ck') +
        paymentChip('TH', amount(order, 'reward'), 'chip-th') +
        paymentChip('HT', amount(order, 'returnAmount'), 'chip-ht') +
        paymentChip('CN', debt, 'chip-cn', 'Đủ') +
      '</div>';
  }

  function renderList() {
    renderKpis();
    var list = byId('deliveryCoreList');
    if (!list) return;
    var rows = window.DeliveryCore.state.orders || [];
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">Không có đơn giao theo bộ lọc.</div>';
      return;
    }
    list.innerHTML = rows.map(function (order) {
      var key = orderKey(order);
      var selected = key === state.selectedKey ? ' selected' : '';
      var debtValue = amount(order, 'debt');
      var debtClass = debtValue > 0 ? ' debt-open' : ' debt-done';
      var orderCode = order.orderCode || order.salesOrderCode || order.code || order.id || '';
      var customerLabel = (order.customerName || '') + (order.customerCode ? ' · ' + order.customerCode : '');
      var salesStaff = order.salesStaffName || order.salesStaffCode || '';
      var deliveryStaff = order.deliveryStaffName || order.deliveryStaffCode || '';
      return '' +
        '<button type="button" class="delivery-v46-row delivery-v46-order-card' + selected + '" data-key="' + esc(key) + '">' +
          '<div class="delivery-v46-check">' + (selected ? '✓' : '') + '</div>' +
          '<div class="delivery-v46-order-main">' +
            '<strong>' + esc(orderCode) + '</strong>' +
            '<span>' + esc(customerLabel || 'Chưa có khách hàng') + '</span>' +
            '<em>' + esc(statusText(order)) + '</em>' +
          '</div>' +
          '<div class="delivery-v46-staff-cell">' +
            '<span>NVBH: <b>' + esc(salesStaff || '-') + '</b></span>' +
            '<span>NVGH: <b>' + esc(deliveryStaff || '-') + '</b></span>' +
          '</div>' +
          '<div class="delivery-v46-payment-cell">' + paymentChipsHtml(order) + '</div>' +
        '</button>';
    }).join('');
    list.querySelectorAll('[data-key]').forEach(function (button) {
      button.addEventListener('click', function () { select(button.getAttribute('data-key')); });
    });
  }

  function renderDetail(order) {
    var detail = byId('deliveryCoreDetail');
    if (!detail) return;
    if (!order) {
      detail.innerHTML = '<div class="delivery-v46-detail-empty">Chọn đơn bên trái để xem chi tiết.</div>';
      return;
    }
    var items = Array.isArray(order.items) ? order.items : [];
    detail.innerHTML = '' +
      '<div class="delivery-v46-detail-head">' +
        '<div><h3>' + esc(order.orderCode) + '</h3><p>' + esc(order.customerName) + ' · ' + esc(order.customerCode) + '</p></div>' +
        '<button id="deliveryConfirmButton" type="button" class="success">Xác nhận giao</button>' +
      '</div>' +
      '<div class="delivery-v46-tabs">' +
        '<button type="button" data-delivery-detail-tab="products" class="' + (state.activeTab === 'products' ? 'active' : '') + '">Sản phẩm giao</button>' +
        '<button type="button" data-delivery-detail-tab="payment" class="' + (state.activeTab === 'payment' ? 'active' : '') + '">Thu tiền</button>' +
        '<button type="button" data-delivery-detail-tab="summary" class="' + (state.activeTab === 'summary' ? 'active' : '') + '">Tổng kết</button>' +
      '</div>' +
      '<div class="delivery-v46-tab-body">' +
        (state.activeTab === 'payment' ? paymentHtml(order) : (state.activeTab === 'summary' ? summaryHtml(order) : productsHtml(items))) +
      '</div>';
    detail.querySelectorAll('[data-delivery-detail-tab]').forEach(function (button) {
      button.addEventListener('click', function () { state.activeTab = button.getAttribute('data-delivery-detail-tab'); renderDetail(order); });
    });
    if (byId('deliveryReturnForm')) byId('deliveryReturnForm').addEventListener('submit', saveReturn);
    if (byId('deliveryPaymentForm')) byId('deliveryPaymentForm').addEventListener('submit', savePayment);
    if (byId('deliveryClearReturnButton')) byId('deliveryClearReturnButton').addEventListener('click', function () { saveReturn({ preventDefault: function () {}, forceZero: true }); });
    if (byId('deliveryConfirmButton')) byId('deliveryConfirmButton').addEventListener('click', confirmDelivery);
  }

  function productsHtml(items) {
    return '' +
      '<form id="deliveryReturnForm">' +
        '<div class="delivery-v46-return-scroll">' +
          '<div class="delivery-v46-product-head"><span>Sản phẩm</span><span>SL giao</span><span>Giá</span><span>SL trả</span></div>' +
          items.map(function (item, idx) {
            var code = item.productCode || item.code || item.productId || '';
            var name = item.productName || item.name || '';
            var qty = num(item.quantity || item.deliveredQty || item.qty || item.orderQty || item.soldQty);
            var price = num(item.price || item.salePrice || item.unitPrice || item.finalPrice);
            var returnQty = num(item.returnQty || item.qtyReturn || item.returnQuantity || item.returnedQty);
            return '' +
              '<div class="delivery-v46-product-row">' +
                '<div><b>' + esc(code) + '</b><small>' + esc(name) + '</small>' +
                  hidden(idx, 'productCode', code) + hidden(idx, 'productName', name) + hidden(idx, 'price', price) +
                '</div>' +
                '<span>' + money(qty) + '</span>' +
                '<span>' + money(price) + '</span>' +
                '<input data-return-field="returnQty" data-idx="' + idx + '" type="number" min="0" step="1" value="' + esc(returnQty) + '">' +
              '</div>';
          }).join('') +
        '</div>' +
        '<div class="delivery-v46-actions"><button type="submit">Lưu nháp hàng trả</button><button type="button" id="deliveryClearReturnButton" class="secondary">Xóa hàng trả</button></div>' +
      '</form>';
  }

  function hidden(idx, field, value) {
    return '<input type="hidden" data-return-field="' + esc(field) + '" data-idx="' + idx + '" value="' + esc(value) + '">';
  }

  function paymentHtml(order) {
    return '' +
      '<form id="deliveryPaymentForm" class="delivery-v46-payment-form">' +
        '<label>Tiền mặt<input name="cash" type="number" min="0" value="' + esc(amount(order, 'cash')) + '"></label>' +
        '<label>Chuyển khoản<input name="bank" type="number" min="0" value="' + esc(amount(order, 'bank')) + '"></label>' +
        '<label>Trả thưởng<input name="reward" type="number" min="0" value="' + esc(amount(order, 'reward')) + '"></label>' +
        '<button type="submit">Lưu thu tiền</button>' +
      '</form>';
  }

  function summaryHtml(order) {
    var r = (order && order.reconciliation) || {};
    var cls = r.balanced === false ? ' danger-text' : ' success-text';
    var msg = r.message || (amount(order, 'debt') > 0 ? 'Còn công nợ' : 'Đối soát OK');
    return '' +
      '<div class="delivery-v46-reconcile' + cls + '"><b>' + esc(msg) + '</b></div>' +
      '<div class="delivery-v46-summary-grid">' +
        '<div><span>Phải thu</span><b>' + money(amount(order, 'receivable')) + '</b></div>' +
        '<div><span>Tiền mặt</span><b>' + money(amount(order, 'cash')) + '</b></div>' +
        '<div><span>Chuyển khoản</span><b>' + money(amount(order, 'bank')) + '</b></div>' +
        '<div><span>Trả thưởng</span><b>' + money(amount(order, 'reward')) + '</b></div>' +
        '<div><span>Hàng trả</span><b>' + money(amount(order, 'returnAmount')) + '</b></div>' +
        '<div><span>Còn nợ</span><b>' + money(amount(order, 'debt')) + '</b></div>' +
      '</div>';
  }

  function collectReturnItems(forceZero) {
    var byIdx = {};
    document.querySelectorAll('[data-return-field]').forEach(function (input) {
      var idx = input.getAttribute('data-idx');
      var field = input.getAttribute('data-return-field');
      byIdx[idx] = byIdx[idx] || {};
      byIdx[idx][field] = field === 'returnQty' && forceZero ? 0 : input.value;
    });
    return Object.keys(byIdx).map(function (idx) { return byIdx[idx]; });
  }

  async function saveReturn(event) {
    if (event && event.preventDefault) event.preventDefault();
    var forceZero = (event && event.forceZero) || (event && event.submitter && event.submitter.id === 'deliveryClearReturnButton');
    try {
      message('Đang lưu hàng trả...');
      var json = await window.DeliveryCore.saveReturn(window.DeliveryCore.state.selectedOrder, collectReturnItems(forceZero));
      message(json.message || 'Đã lưu hàng trả');
      state.selectedKey = orderKey(window.DeliveryCore.state.selectedOrder);
      renderList();
      renderDetail(window.DeliveryCore.state.selectedOrder);
    } catch (err) { message(err.message, true); }
  }

  async function savePayment(event) {
    if (event && event.preventDefault) event.preventDefault();
    var form = new FormData(event.target);
    try {
      message('Đang lưu thu tiền...');
      var json = await window.DeliveryCore.savePayment(window.DeliveryCore.state.selectedOrder, {
        cash: form.get('cash'), bank: form.get('bank'), reward: form.get('reward')
      });
      message(json.message || 'Đã lưu thu tiền');
      state.selectedKey = orderKey(window.DeliveryCore.state.selectedOrder);
      renderList();
      renderDetail(window.DeliveryCore.state.selectedOrder);
    } catch (err) { message(err.message, true); }
  }

  async function confirmDelivery() {
    try {
      message('Đang xác nhận giao...');
      var json = await window.DeliveryCore.confirmDelivery(window.DeliveryCore.state.selectedOrder, { deliveryStatus: 'delivered' });
      message(json.message || 'Đã xác nhận giao');
      state.selectedKey = orderKey(window.DeliveryCore.state.selectedOrder);
      renderList();
      renderDetail(window.DeliveryCore.state.selectedOrder);
    } catch (err) { message(err.message, true); }
  }


  async function reconcile() {
    try {
      message('Đang đối soát cuối ngày...');
      var r = await window.DeliveryCore.loadReconciliation(filters());
      var msg = r && r.message ? r.message : 'Đã đối soát';
      message(msg, r && r.balanced === false);
      renderKpis();
      if (window.DeliveryCore.state.selectedOrder) renderDetail(window.DeliveryCore.state.selectedOrder);
    } catch (err) { message(err.message, true); }
  }

  function select(key) {
    state.selectedKey = key;
    var order = window.DeliveryCore.selectOrder(key);
    renderList();
    renderDetail(order);
  }

  async function load() {
    if (!window.DeliveryCore) return;
    if (!byId('deliveryCoreList')) renderShell();
    var list = byId('deliveryCoreList');
    if (list) list.innerHTML = '<div class="empty-state">Đang tải...</div>';
    try {
      await window.DeliveryCore.loadOrders(filters());
      if (!state.selectedKey && window.DeliveryCore.state.orders[0]) state.selectedKey = orderKey(window.DeliveryCore.state.orders[0]);
      if (state.selectedKey) window.DeliveryCore.selectOrder(state.selectedKey);
      renderList();
      renderDetail(window.DeliveryCore.state.selectedOrder);
      message('');
    } catch (err) {
      if (list) list.innerHTML = '<div class="empty-state danger-text">' + esc(err.message) + '</div>';
      message(err.message, true);
    }
  }

  window.DeliveryWebView = { load: load, select: select, renderShell: renderShell };
  window.loadDeliveryTodayOrders = function () { return load(); };
  window.loadDeliveryToday = function () { return load(); };
  window.submitDeliveryEdit = function (event) { return saveReturn(event); };
  window.clearDeliveryEditPanel = function () { renderDetail(null); };
  window.recalcDeliveryEditDebt = function () {};
  window.renderDeliveryEditPanel = function () { renderDetail(window.DeliveryCore && window.DeliveryCore.state.selectedOrder); };
  window.selectDeliveryOrder = function (key) { return select(key); };

  document.addEventListener('DOMContentLoaded', function () {
    renderShell();
    if (byId('deliveryTodayTab') && byId('deliveryTodayTab').classList.contains('active')) load();
  });
}());
