(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function money(v) { return window.DeliveryCore ? window.DeliveryCore.money(v) : String(v || 0); }
  function amount(o, k) { return Number((o && o.amounts && o.amounts[k]) || 0); }

  var state = { selectedKey: '' };

  function root() {
    var r = el('mobileDeliveryRoot');
    if (!r) {
      r = document.createElement('main');
      r.id = 'mobileDeliveryRoot';
      r.className = 'mobile-page';
      document.body.innerHTML = '';
      document.body.appendChild(r);
    }
    return r;
  }

  function renderShell() {
    root().innerHTML = '<section class="mobile-card"><h1>App giao hàng</h1>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><input id="mDeliveryDate" type="date"><button id="mDeliveryReload" type="button">Tải đơn</button></div>' +
      '<div id="mDeliveryList"></div></section><section class="mobile-card"><div id="mDeliveryDetail">Chọn đơn</div></section>';
    el('mDeliveryDate').value = new Date().toISOString().slice(0, 10);
    el('mDeliveryReload').addEventListener('click', load);
  }

  function renderList() {
    var list = el('mDeliveryList');
    var rows = window.DeliveryCore.state.orders || [];
    if (!rows.length) { list.innerHTML = '<p>Không có đơn giao.</p>'; return; }
    list.innerHTML = rows.map(function (o) {
      var key = window.DeliveryCore.orderKey(o);
      return '<button type="button" data-key="' + esc(key) + '" class="mobile-order-card" style="width:100%;text-align:left;margin:8px 0;padding:10px;border-radius:12px;border:1px solid #ddd;background:#fff">' +
        '<b>' + esc(o.orderCode) + '</b> · ' + esc(o.customerName || o.customerCode) + '<br>' +
        '<small>PT ' + money(amount(o, 'receivable')) + ' | TM ' + money(amount(o, 'cash')) + ' | CK ' + money(amount(o, 'bank')) + ' | HT ' + money(amount(o, 'returnAmount')) + ' | CN ' + money(amount(o, 'debt')) + '</small>' +
        '</button>';
    }).join('');
    list.querySelectorAll('[data-key]').forEach(function (b) { b.addEventListener('click', function () { select(b.getAttribute('data-key')); }); });
  }

  function renderDetail(order) {
    var d = el('mDeliveryDetail');
    if (!order) { d.innerHTML = 'Chọn đơn'; return; }
    var items = Array.isArray(order.items) ? order.items : [];
    d.innerHTML = '<h2>' + esc(order.orderCode) + '</h2><p>' + esc(order.customerName) + '</p>' +
      '<form id="mReturnForm"><div style="max-height:42vh;overflow:auto;border:1px solid #ddd;border-radius:12px;padding:8px">' +
      items.map(function (it, idx) {
        return '<div style="display:grid;grid-template-columns:1fr 80px;gap:8px;margin-bottom:8px">' +
          '<div><b>' + esc(it.productCode || it.code) + '</b><br><small>' + esc(it.productName || it.name) + '</small><input type="hidden" data-m-field="productCode" data-idx="' + idx + '" value="' + esc(it.productCode || it.code) + '"><input type="hidden" data-m-field="productName" data-idx="' + idx + '" value="' + esc(it.productName || it.name) + '"><input type="hidden" data-m-field="price" data-idx="' + idx + '" value="' + esc(it.price || it.salePrice || 0) + '"></div>' +
          '<input type="number" min="0" step="1" data-m-field="returnQty" data-idx="' + idx + '" value="' + esc(it.returnQty || it.qtyReturn || 0) + '">' +
          '</div>';
      }).join('') + '</div><button type="submit">Lưu hàng trả</button></form>' +
      '<form id="mPaymentForm" style="margin-top:10px"><input name="cash" type="number" placeholder="Tiền mặt" value="' + esc(amount(order, 'cash')) + '"><input name="bank" type="number" placeholder="Chuyển khoản" value="' + esc(amount(order, 'bank')) + '"><input name="reward" type="number" placeholder="Trả thưởng" value="' + esc(amount(order, 'reward')) + '"><button type="submit">Lưu thu tiền</button></form>' +
      '<button id="mConfirm" type="button">Xác nhận giao</button><p id="mMsg"></p>';
    el('mReturnForm').addEventListener('submit', saveReturn);
    el('mPaymentForm').addEventListener('submit', savePayment);
    el('mConfirm').addEventListener('click', confirmDelivery);
  }

  function collectItems() {
    var byIdx = {};
    document.querySelectorAll('[data-m-field]').forEach(function (input) {
      var idx = input.getAttribute('data-idx'); var field = input.getAttribute('data-m-field');
      byIdx[idx] = byIdx[idx] || {}; byIdx[idx][field] = input.value;
    });
    return Object.keys(byIdx).map(function (idx) { return byIdx[idx]; });
  }
  function msg(v) { if (el('mMsg')) el('mMsg').textContent = v || ''; }

  async function saveReturn(e) {
    e.preventDefault();
    try { msg('Đang lưu...'); await window.DeliveryCore.saveReturn(window.DeliveryCore.state.selectedOrder, collectItems()); msg('Đã lưu hàng trả'); renderList(); renderDetail(window.DeliveryCore.state.selectedOrder); } catch (err) { msg(err.message); }
  }
  async function savePayment(e) {
    e.preventDefault();
    var form = new FormData(e.target);
    try { msg('Đang lưu...'); await window.DeliveryCore.savePayment(window.DeliveryCore.state.selectedOrder, { cash: form.get('cash'), bank: form.get('bank'), reward: form.get('reward') }); msg('Đã lưu thu tiền'); renderList(); renderDetail(window.DeliveryCore.state.selectedOrder); } catch (err) { msg(err.message); }
  }
  async function confirmDelivery() {
    try { msg('Đang xác nhận...'); await window.DeliveryCore.confirmDelivery(window.DeliveryCore.state.selectedOrder, { deliveryStatus: 'delivered' }); msg('Đã xác nhận giao'); renderList(); renderDetail(window.DeliveryCore.state.selectedOrder); } catch (err) { msg(err.message); }
  }
  function select(key) { state.selectedKey = key; window.DeliveryCore.selectOrder(key); renderList(); renderDetail(window.DeliveryCore.state.selectedOrder); }
  async function load() {
    if (!el('mDeliveryList')) renderShell();
    var date = (el('mDeliveryDate') && el('mDeliveryDate').value) || new Date().toISOString().slice(0, 10);
    el('mDeliveryList').innerHTML = 'Đang tải...';
    try { await window.DeliveryCore.loadOrders({ date: date }); if (!state.selectedKey && window.DeliveryCore.state.orders[0]) state.selectedKey = window.DeliveryCore.orderKey(window.DeliveryCore.state.orders[0]); if (state.selectedKey) window.DeliveryCore.selectOrder(state.selectedKey); renderList(); renderDetail(window.DeliveryCore.state.selectedOrder); } catch (err) { el('mDeliveryList').innerHTML = esc(err.message); }
  }

  window.DeliveryMobileView = { load: load, select: select };
  window.loadDeliveryOrders = function () { return load(); };
  document.addEventListener('DOMContentLoaded', load);
}());
