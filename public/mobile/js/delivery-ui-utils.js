(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function num(v) { return window.DeliveryCore ? window.DeliveryCore.toNumber(v) : Number(v || 0); }
  function money(v) { return window.DeliveryCore ? window.DeliveryCore.money(v) : String(Math.round(Number(v || 0))); }
  function amount(o, k) { return num(o && o.amounts && o.amounts[k]); }
  function keyOf(o) { return window.DeliveryCore ? window.DeliveryCore.orderKey(o) : String(o && (o.orderId || o.id || o.orderCode || '')).trim(); }

  function today() {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    var values = Object.fromEntries(parts.map(function (part) { return [part.type, part.value]; }));
    return values.year + '-' + values.month + '-' + values.day;
  }

  function readUser() {
    try { return JSON.parse(localStorage.getItem('v43_mobile_user') || localStorage.getItem('mk_web_user') || '{}'); }
    catch (err) { return {}; }
  }

  function userDisplayName(user) { return String((user && (user.fullName || user.name || user.username || user.staffCode || user.code)) || '').trim(); }
  function userStaffCode(user) { return String((user && (user.staffCode || user.code)) || '').trim(); }
  function userRoleLabel(user) {
    var role = String((user && user.role) || '').toLowerCase();
    if (user && user.roleLabel) return String(user.roleLabel);
    if (role === 'delivery') return 'Nhân viên giao hàng';
    if (role === 'admin') return 'Admin';
    return role || 'Tài khoản';
  }

  function firstOrderText(order, keys) {
    order = order || {};
    for (var i = 0; i < keys.length; i += 1) {
      var value = order[keys[i]];
      if (value && typeof value === 'object') value = value.text || value.value || value.name;
      value = String(value == null ? '' : value).trim();
      if (value) return value;
    }
    var customer = order.customer && typeof order.customer === 'object' ? order.customer : {};
    for (var j = 0; j < keys.length; j += 1) {
      var customerValue = customer[keys[j]];
      customerValue = String(customerValue == null ? '' : customerValue).trim();
      if (customerValue) return customerValue;
    }
    return '';
  }

  function orderAddress(order) { return firstOrderText(order, ['deliveryAddress', 'shippingAddress', 'customerAddress', 'address', 'addressLine', 'fullAddress']); }
  function orderPhone(order) { return firstOrderText(order, ['customerPhone', 'phone', 'phoneNumber', 'mobilePhone', 'tel']); }
  function orderNote(order) { return firstOrderText(order, ['deliveryNote', 'note', 'notes', 'orderNote', 'customerNote', 'remark']); }
  function orderSalesStaff(order) {
    var code = firstOrderText(order, ['salesStaffCode', 'salesmanCode', 'nvbhCode']);
    var name = firstOrderText(order, ['salesStaffName', 'salesmanName', 'nvbhName']);
    return [code, name].filter(Boolean).join(' - ');
  }

  function phoneHref(phone) {
    var cleaned = String(phone || '').replace(/[^0-9+]/g, '');
    return cleaned ? 'tel:' + cleaned : '';
  }

  function mapHref(address) { return address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address) : ''; }

  function deliveryStatusOf(order) {
    var st = order && order.status && typeof order.status === 'object' ? order.status.deliveryStatus : '';
    return String(st || (order && (order.deliveryStatus || order.status)) || 'pending').toLowerCase();
  }

  function isDelivered(order) { return ['delivered', 'success', 'done', 'completed'].indexOf(deliveryStatusOf(order)) >= 0; }

  function statusLabel(order) {
    if (isDelivered(order)) return 'Đã giao';
    var status = deliveryStatusOf(order);
    if (status === 'assigned') return 'Đã phân giao';
    if (status === 'return') return 'Có trả hàng';
    if (status === 'debt') return 'Còn công nợ';
    return 'Chưa giao';
  }

  function selectedOrderSummary(order) {
    order = order || {};
    var address = orderAddress(order);
    var name = order.customerName || order.customerCode || order.orderCode || 'Khách đang giao';
    var customerCode = order.customerCode || order.customerId || '';
    var due = amount(order, 'receivable');
    return '<div class="m-selected-order compact phase24" aria-label="Khách đang xử lý">' +
      '<b>' + esc(name) + (customerCode ? ' · ' + esc(customerCode) : '') + '</b>' +
      '<span>' + (address ? esc(address) + ' · ' : '') + 'Phải thu ' + money(due) + '</span>' +
    '</div>';
  }

  function orderQuickActions(order) {
    var address = orderAddress(order);
    var phone = orderPhone(order);
    var actions = [];
    if (phoneHref(phone)) actions.push('<a class="m-order-quick-btn" href="' + esc(phoneHref(phone)) + '" aria-label="Gọi khách hàng">Gọi</a>');
    if (address) actions.push('<button type="button" class="m-order-quick-btn" data-copy-address="' + esc(address) + '">Copy địa chỉ</button>');
    if (mapHref(address)) actions.push('<a class="m-order-quick-btn" target="_blank" rel="noopener" href="' + esc(mapHref(address)) + '">Bản đồ</a>');
    return actions.length ? '<div class="m-order-quick-actions">' + actions.join('') + '</div>' : '';
  }

  function copyText(value) {
    value = String(value || '').trim();
    if (!value) return Promise.reject(new Error('Không có nội dung để copy'));
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(value);
    var input = document.createElement('textarea');
    input.value = value;
    input.setAttribute('readonly', 'readonly');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(input);
    return ok ? Promise.resolve() : Promise.reject(new Error('Không copy được địa chỉ'));
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () { clearTimeout(timer); timer = setTimeout(fn, wait); };
  }

  function msg(text, danger) {
    var node = el('mMsg');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'm-delivery-msg ' + (danger ? 'danger' : '');
  }

  window.DeliveryMobileUiUtils = {
    el: el,
    esc: esc,
    num: num,
    money: money,
    amount: amount,
    keyOf: keyOf,
    today: today,
    readUser: readUser,
    userDisplayName: userDisplayName,
    userStaffCode: userStaffCode,
    userRoleLabel: userRoleLabel,
    firstOrderText: firstOrderText,
    orderAddress: orderAddress,
    orderPhone: orderPhone,
    orderNote: orderNote,
    orderSalesStaff: orderSalesStaff,
    phoneHref: phoneHref,
    mapHref: mapHref,
    deliveryStatusOf: deliveryStatusOf,
    isDelivered: isDelivered,
    statusLabel: statusLabel,
    selectedOrderSummary: selectedOrderSummary,
    orderQuickActions: orderQuickActions,
    copyText: copyText,
    debounce: debounce,
    msg: msg
  };
})();
