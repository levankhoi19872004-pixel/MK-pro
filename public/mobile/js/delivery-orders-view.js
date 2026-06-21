(function () {
  'use strict';

  var ui = window.DeliveryMobileUiUtils || {};
  var esc = ui.esc;
  var money = ui.money;
  var amount = ui.amount;
  var keyOf = ui.keyOf;

  function buildOrderKpi(order) {
    return {
      pt: amount(order, 'receivable'),
      tm: amount(order, 'cash'),
      ck: amount(order, 'bank'),
      // TH = tiền hàng trả, HT = trả thưởng. Không đảo nhãn giữa return/reward.
      th: amount(order, 'returnAmount'),
      ht: amount(order, 'reward'),
      cn: amount(order, 'debt')
    };
  }

  function buildRouteKpi(rows) {
    return (rows || []).reduce(function (a, o) {
      a.pt += amount(o, 'receivable');
      a.tm += amount(o, 'cash');
      a.ck += amount(o, 'bank');
      // TH = tiền hàng trả, HT = trả thưởng.
      a.th += amount(o, 'returnAmount');
      a.ht += amount(o, 'reward');
      a.cn += amount(o, 'debt');
      return a;
    }, { pt: 0, tm: 0, ck: 0, th: 0, ht: 0, cn: 0 });
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
    var debtText = amount(order, 'debt') > 0 ? money(amount(order, 'debt')) : 'Đủ';

    return '<article class="m-order-card' + selected + '">' +
      '<button type="button" class="m-order-main" data-order-key="' + esc(key) + '">' +
        '<div class="m-order-card-header">' +
          '<div class="m-order-title"><b>' + esc(order.customerName || order.customerCode || 'Khách hàng') + '</b><span>Mã đơn: ' + esc(order.orderCode || key) + '</span></div>' +
          '<span class="m-order-status-pill ' + dotClass + '"><i class="delivery-status-dot ' + dotClass + '" aria-hidden="true"></i>' + esc(ui.statusLabel(order)) + '</span>' +
        '</div>' +
        (address ? '<p class="m-order-line m-order-address">Địa chỉ: ' + esc(address) + '</p>' : '') +
        (phone ? '<p class="m-order-line">SĐT: ' + esc(phone) + '</p>' : '') +
        (salesStaff ? '<p class="m-order-line">NVBH: ' + esc(salesStaff) + '</p>' : '') +
        (note ? '<p class="m-order-note">Ghi chú: ' + esc(note) + '</p>' : '') +
        '<div class="m-order-metrics">' +
          '<span><em>Phải thu</em><b>' + money(amount(order, 'receivable')) + '</b></span>' +
          '<span><em>Tiền mặt</em><b>' + money(amount(order, 'cash')) + '</b></span>' +
          '<span><em>Chuyển khoản</em><b>' + money(amount(order, 'bank')) + '</b></span>' +
          '<span><em>Trả hàng</em><b>' + money(amount(order, 'returnAmount')) + '</b></span>' +
          '<span><em>Trả thưởng</em><b>' + money(amount(order, 'reward')) + '</b></span>' +
          '<span><em>Công nợ</em><b>' + debtText + '</b></span>' +
        '</div>' +
      '</button>' +
      ui.orderQuickActions(order) +
    '</article>';
  }

  window.DeliveryMobileOrdersView = {
    buildOrderKpi: buildOrderKpi,
    buildRouteKpi: buildRouteKpi,
    renderOrderCard: renderOrderCard
  };
})();
