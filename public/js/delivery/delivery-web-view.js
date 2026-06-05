(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
    });
  }
  function money(value) { return window.DeliveryCore ? window.DeliveryCore.money(value) : String(value || 0); }
  function amount(order, key) { return Number((order && order.amounts && order.amounts[key]) || 0); }

  var state = { selectedKey: '' };

  function ensureRoot() {
    var root = $('canonicalDeliveryWebRoot') || $('deliveryTodayTab') || $('deliveryTodaySection');
    if (!root) {
      root = document.createElement('section');
      root.id = 'canonicalDeliveryWebRoot';
      root.className = 'card';
      var container = document.querySelector('.container') || document.body;
      container.appendChild(root);
    }
    return root;
  }

  function filtersFromDom() {
    return {
      date: ($('deliveryDateFilter') && $('deliveryDateFilter').value) || new Date().toISOString().slice(0, 10),
      deliveryStaffCode: ($('deliveryStaffFilter') && $('deliveryStaffFilter').value) || '',
      salesStaffCode: ($('deliverySalesmanFilter') && $('deliverySalesmanFilter').value) || '',
      status: ($('deliveryStatusFilter') && $('deliveryStatusFilter').value) || ''
    };
  }

  function renderShell() {
    var root = ensureRoot();
    root.innerHTML = '<h2>Đơn đi giao hôm nay</h2>' +
      '<div class="delivery-core-filters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
      '<input id="deliveryCoreDate" type="date" />' +
      '<input id="deliveryCoreStaff" placeholder="Mã NVGH" />' +
      '<input id="deliveryCoreSales" placeholder="Mã NVBH" />' +
      '<select id="deliveryCoreStatus"><option value="">Tất cả trạng thái</option><option value="delivered">Đã giao</option><option value="pending">Chưa giao</option></select>' +
      '<button id="deliveryCoreReload" type="button">Tải đơn</button>' +
      '</div>' +
      '<div class="delivery-core-layout" style="display:grid;grid-template-columns:minmax(360px,42%) 1fr;gap:12px;align-items:start">' +
      '<div><div id="deliveryCoreKpi" class="muted"></div><div id="deliveryCoreList" class="delivery-core-list"></div></div>' +
      '<div id="deliveryCoreDetail" class="delivery-core-detail empty-state">Chọn đơn để xem chi tiết</div>' +
      '</div>';
    var f = filtersFromDom();
    $('deliveryCoreDate').value = f.date;
    $('deliveryCoreStaff').value = f.deliveryStaffCode;
    $('deliveryCoreSales').value = f.salesStaffCode;
    $('deliveryCoreStatus').value = f.status;
    $('deliveryCoreReload').addEventListener('click', load);
  }

  function readFilters() {
    return {
      date: ($('deliveryCoreDate') && $('deliveryCoreDate').value) || (filtersFromDom().date),
      deliveryStaffCode: ($('deliveryCoreStaff') && $('deliveryCoreStaff').value.trim()) || '',
      salesStaffCode: ($('deliveryCoreSales') && $('deliveryCoreSales').value.trim()) || '',
      status: ($('deliveryCoreStatus') && $('deliveryCoreStatus').value) || ''
    };
  }

  function renderList() {
    var list = $('deliveryCoreList');
    var kpi = $('deliveryCoreKpi');
    if (!list) return;
    var rows = window.DeliveryCore.state.orders || [];
    if (kpi) {
      var total = rows.reduce(function (s, o) { return s + amount(o, 'receivable'); }, 0);
      var ret = rows.reduce(function (s, o) { return s + amount(o, 'returnAmount'); }, 0);
      var debt = rows.reduce(function (s, o) { return s + amount(o, 'debt'); }, 0);
      kpi.innerHTML = 'Tổng đơn: <b>' + rows.length + '</b> · Phải thu: <b>' + money(total) + '</b> · Hàng trả: <b>' + money(ret) + '</b> · Còn nợ: <b>' + money(debt) + '</b>';
    }
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">Không có đơn giao.</div>';
      return;
    }
    list.innerHTML = rows.map(function (o) {
      var key = window.DeliveryCore.orderKey(o);
      var selected = key === state.selectedKey ? ' selected' : '';
      return '<button type="button" class="delivery-core-order' + selected + '" data-key="' + esc(key) + '" style="display:block;width:100%;text-align:left;margin:0 0 6px;padding:8px;border:1px solid #e5e7eb;border-radius:10px;background:#fff">' +
        '<div><b>' + esc(o.orderCode) + '</b> | ' + esc(o.customerName || o.customerCode) + '</div>' +
        '<div style="font-size:12px;display:flex;gap:6px;flex-wrap:wrap">' +
        '<span>PT <b>' + money(amount(o, 'receivable')) + '</b></span>' +
        '<span>TM <b>' + money(amount(o, 'cash')) + '</b></span>' +
        '<span>CK <b>' + money(amount(o, 'bank')) + '</b></span>' +
        '<span>TH <b>' + money(amount(o, 'reward')) + '</b></span>' +
        '<span>HT <b>' + money(amount(o, 'returnAmount')) + '</b></span>' +
        '<span>CN <b>' + money(amount(o, 'debt')) + '</b></span>' +
        '</div>' +
        '</button>';
    }).join('');
    list.querySelectorAll('[data-key]').forEach(function (btn) {
      btn.addEventListener('click', function () { select(btn.getAttribute('data-key')); });
    });
  }

  function renderDetail(order) {
    var detail = $('deliveryCoreDetail');
    if (!detail) return;
    if (!order) {
      detail.innerHTML = '<div class="empty-state">Chọn đơn để xem chi tiết</div>';
      return;
    }
    var items = Array.isArray(order.items) ? order.items : [];
    detail.innerHTML = '<h3>' + esc(order.orderCode) + ' - ' + esc(order.customerName) + '</h3>' +
      '<form id="deliveryCoreReturnForm">' +
      '<div style="max-height:340px;overflow:auto;border:1px solid #e5e7eb;border-radius:10px">' +
      '<table style="width:100%"><thead><tr><th>Mã</th><th>Sản phẩm</th><th>SL giao</th><th>SL trả</th><th>Giá</th></tr></thead><tbody>' +
      items.map(function (it, idx) {
        return '<tr>' +
          '<td>' + esc(it.productCode || it.code) + '<input type="hidden" data-return-field="productCode" data-idx="' + idx + '" value="' + esc(it.productCode || it.code) + '"></td>' +
          '<td>' + esc(it.productName || it.name) + '<input type="hidden" data-return-field="productName" data-idx="' + idx + '" value="' + esc(it.productName || it.name) + '"></td>' +
          '<td>' + esc(it.deliveredQty || it.quantity || it.qty || 0) + '</td>' +
          '<td><input type="number" min="0" step="1" data-return-field="returnQty" data-idx="' + idx + '" value="' + esc(it.returnQty || it.qtyReturn || 0) + '" style="width:80px"></td>' +
          '<td>' + money(it.price || it.salePrice) + '<input type="hidden" data-return-field="price" data-idx="' + idx + '" value="' + esc(it.price || it.salePrice || 0) + '"></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div style="display:flex;gap:8px;margin-top:10px"><button type="submit">Lưu hàng trả</button><button id="deliveryCoreConfirm" type="button">Xác nhận giao</button></div>' +
      '</form>' +
      '<form id="deliveryCorePaymentForm" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      '<input name="cash" type="number" placeholder="Tiền mặt" value="' + esc(amount(order, 'cash')) + '">' +
      '<input name="bank" type="number" placeholder="Chuyển khoản" value="' + esc(amount(order, 'bank')) + '">' +
      '<input name="reward" type="number" placeholder="Trả thưởng" value="' + esc(amount(order, 'reward')) + '">' +
      '<button type="submit">Lưu thu tiền</button>' +
      '</form>' +
      '<p id="deliveryCoreMessage" class="message"></p>';

    $('deliveryCoreReturnForm').addEventListener('submit', saveReturn);
    $('deliveryCorePaymentForm').addEventListener('submit', savePayment);
    $('deliveryCoreConfirm').addEventListener('click', confirmDelivery);
  }

  function collectReturnItems() {
    var byIdx = {};
    document.querySelectorAll('[data-return-field]').forEach(function (el) {
      var idx = el.getAttribute('data-idx');
      var field = el.getAttribute('data-return-field');
      byIdx[idx] = byIdx[idx] || {};
      byIdx[idx][field] = el.value;
    });
    return Object.keys(byIdx).map(function (idx) { return byIdx[idx]; });
  }

  function msg(text, bad) {
    var el = $('deliveryCoreMessage');
    if (el) { el.textContent = text || ''; el.className = bad ? 'message error' : 'message'; }
  }

  async function saveReturn(event) {
    event.preventDefault();
    try {
      msg('Đang lưu hàng trả...');
      var json = await window.DeliveryCore.saveReturn(window.DeliveryCore.state.selectedOrder, collectReturnItems());
      msg(json.message || 'Đã lưu hàng trả');
      state.selectedKey = window.DeliveryCore.orderKey(window.DeliveryCore.state.selectedOrder);
      renderList();
      renderDetail(window.DeliveryCore.state.selectedOrder);
    } catch (err) { msg(err.message, true); }
  }

  async function savePayment(event) {
    event.preventDefault();
    var form = new FormData(event.target);
    try {
      msg('Đang lưu thu tiền...');
      var json = await window.DeliveryCore.savePayment(window.DeliveryCore.state.selectedOrder, { cash: form.get('cash'), bank: form.get('bank'), reward: form.get('reward') });
      msg(json.message || 'Đã lưu thu tiền');
      state.selectedKey = window.DeliveryCore.orderKey(window.DeliveryCore.state.selectedOrder);
      renderList();
      renderDetail(window.DeliveryCore.state.selectedOrder);
    } catch (err) { msg(err.message, true); }
  }

  async function confirmDelivery() {
    try {
      msg('Đang xác nhận giao...');
      var json = await window.DeliveryCore.confirmDelivery(window.DeliveryCore.state.selectedOrder, { deliveryStatus: 'delivered' });
      msg(json.message || 'Đã xác nhận giao');
      state.selectedKey = window.DeliveryCore.orderKey(window.DeliveryCore.state.selectedOrder);
      renderList();
      renderDetail(window.DeliveryCore.state.selectedOrder);
    } catch (err) { msg(err.message, true); }
  }

  function select(key) {
    state.selectedKey = key;
    var order = window.DeliveryCore.selectOrder(key);
    renderList();
    renderDetail(order);
  }

  async function load() {
    if (!window.DeliveryCore) return;
    if (!$('deliveryCoreList')) renderShell();
    var list = $('deliveryCoreList');
    if (list) list.innerHTML = '<div class="empty-state">Đang tải...</div>';
    try {
      await window.DeliveryCore.loadOrders(readFilters());
      if (!state.selectedKey && window.DeliveryCore.state.orders[0]) state.selectedKey = window.DeliveryCore.orderKey(window.DeliveryCore.state.orders[0]);
      if (state.selectedKey) window.DeliveryCore.selectOrder(state.selectedKey);
      renderList();
      renderDetail(window.DeliveryCore.state.selectedOrder);
    } catch (err) {
      if (list) list.innerHTML = '<div class="empty-state danger-text">' + esc(err.message) + '</div>';
    }
  }

  window.DeliveryWebView = { load: load, select: select, renderShell: renderShell };
  window.loadDeliveryTodayOrders = function () { return load(); };
  window.loadDeliveryToday = function () { return load(); };
  window.submitDeliveryEdit = function (event) { if (event && event.preventDefault) event.preventDefault(); return saveReturn(event || { preventDefault: function () {} }); };
  window.clearDeliveryEditPanel = window.clearDeliveryEditPanel || function () { renderDetail(null); };
  window.recalcDeliveryEditDebt = window.recalcDeliveryEditDebt || function () {};
  window.renderDeliveryEditPanel = window.renderDeliveryEditPanel || function () { renderDetail(window.DeliveryCore && window.DeliveryCore.state.selectedOrder); };
  window.selectDeliveryOrder = function (key) { return select(key); };

  document.addEventListener('DOMContentLoaded', function () {
    if (document.body && (document.getElementById('deliveryTodayTab') || document.getElementById('canonicalDeliveryWebRoot'))) load();
  });
}());
