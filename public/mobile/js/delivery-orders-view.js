(function () {
  'use strict';

  var ui = window.DeliveryMobileUiUtils || {};
  var esc = ui.esc;
  var money = ui.money;
  var amount = ui.amount;
  var keyOf = ui.keyOf;
  var num = ui.num;

  function orderItems(order) {
    return Array.isArray(order && order.items) ? order.items : [];
  }

  function orderItemQty(item) {
    return num(item && (item.quantity || item.deliveredQty || item.qty || item.orderQty || item.soldQty));
  }

  function orderProductSummary(order) {
    var items = orderItems(order);
    var totalQty = items.reduce(function (sum, item) { return sum + orderItemQty(item); }, 0);
    if (!items.length) return 'Chưa có dòng hàng';
    return items.length + ' dòng hàng' + (totalQty > 0 ? ' · SL ' + money(totalQty) : '');
  }

  function buildOrderKpi(order) {
    var delivered = ui.isDelivered(order);
    return {
      total: order ? 1 : 0,
      pending: order && !delivered ? 1 : 0,
      delivered: delivered ? 1 : 0,
      pt: amount(order, 'receivable'),
      th: amount(order, 'returnAmount'),
      cn: amount(order, 'debt'),
      tm: amount(order, 'cash'),
      ck: amount(order, 'bank'),
      ht: amount(order, 'reward')
    };
  }

  function buildRouteKpi(rows) {
    return (rows || []).reduce(function (a, o) {
      var delivered = ui.isDelivered(o);
      a.total += 1;
      a.pending += delivered ? 0 : 1;
      a.delivered += delivered ? 1 : 0;
      a.pt += amount(o, 'receivable');
      a.th += amount(o, 'returnAmount');
      a.cn += amount(o, 'debt');
      a.tm += amount(o, 'cash');
      a.ck += amount(o, 'bank');
      a.ht += amount(o, 'reward');
      return a;
    }, { total: 0, pending: 0, delivered: 0, pt: 0, th: 0, cn: 0, tm: 0, ck: 0, ht: 0 });
  }

  function flowButton(label, key, tab, extraClass) {
    return '<button type="button" class="m-order-flow-btn ' + esc(extraClass || '') + '" data-order-key="' + esc(key) + '" data-open-tab="' + esc(tab) + '">' + esc(label) + '</button>';
  }

  function renderOrderCard(order, options) {
    options = options || {};
    var key = keyOf(order);
    var selected = key === options.selectedKey ? ' selected' : '';
    var delivered = ui.isDelivered(order);
    var dotClass = delivered ? 'delivered' : 'pending';
    var address = ui.orderAddress(order);
    var phone = ui.orderPhone(order);
    var note = ui.orderNote(order);
    var salesStaff = ui.orderSalesStaff(order);
    var returnAmount = amount(order, 'returnAmount');
    var debtAmount = amount(order, 'debt');
    var mapUrl = ui.mapHref(address);
    var phoneUrl = ui.phoneHref(phone);
    var phoneAction = phoneUrl ? '<a class="m-order-flow-btn call" href="' + esc(phoneUrl) + '">Gọi</a>' : '';
    var mapAction = mapUrl ? '<a class="m-order-flow-btn map" target="_blank" rel="noopener" href="' + esc(mapUrl) + '">Bản đồ</a>' : '';

    return '<article class="m-order-card workflow' + selected + '">' +
      '<button type="button" class="m-order-main" data-order-key="' + esc(key) + '" data-open-tab="products">' +
        '<div class="m-order-card-header">' +
          '<div class="m-order-title"><b>' + esc(order.customerName || order.customerCode || 'Khách hàng') + '</b><span>Mã đơn: ' + esc(order.orderCode || key) + '</span></div>' +
          '<span class="m-order-status-pill ' + dotClass + '"><i class="delivery-status-dot ' + dotClass + '" aria-hidden="true"></i>' + esc(ui.statusLabel(order)) + '</span>' +
        '</div>' +
        (address ? '<p class="m-order-line m-order-address">Địa chỉ: ' + esc(address) + '</p>' : '') +
        (salesStaff ? '<p class="m-order-line">NVBH: ' + esc(salesStaff) + '</p>' : '') +
        '<div class="m-order-workflow-summary">' +
          '<span><em>Hàng giao</em><b>' + esc(orderProductSummary(order)) + '</b></span>' +
          '<span><em>Phải thu</em><b>' + money(amount(order, 'receivable')) + '</b></span>' +
          '<span><em>Trả hàng</em><b>' + (returnAmount > 0 ? money(returnAmount) : 'Chưa có') + '</b></span>' +
          '<span><em>Còn thiếu</em><b>' + (debtAmount > 0 ? money(debtAmount) : 'Đủ') + '</b></span>' +
        '</div>' +
        (note ? '<p class="m-order-note">Ghi chú: ' + esc(note) + '</p>' : '') +
      '</button>' +
      '<div class="m-order-flow-actions customer-list" aria-label="Thao tác khách cần giao">' +
        phoneAction +
        mapAction +
        flowButton('Vào giao hàng', key, 'products', 'primary') +
      '</div>' +
    '</article>';
  }

  window.DeliveryMobileOrdersView = {
    buildOrderKpi: buildOrderKpi,
    buildRouteKpi: buildRouteKpi,
    orderProductSummary: orderProductSummary,
    renderOrderCard: renderOrderCard
  };
})();
