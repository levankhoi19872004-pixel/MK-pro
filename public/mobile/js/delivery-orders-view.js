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
      a.totalOrders += 1;
      if (ui.isDelivered(o)) a.deliveredOrders += 1;
      else a.pendingOrders += 1;
      a.pt += amount(o, 'receivable');
      a.tm += amount(o, 'cash');
      a.ck += amount(o, 'bank');
      // TH = tiền hàng trả, HT = trả thưởng.
      a.th += amount(o, 'returnAmount');
      a.ht += amount(o, 'reward');
      a.cn += amount(o, 'debt');
      return a;
    }, { totalOrders: 0, pendingOrders: 0, deliveredOrders: 0, pt: 0, tm: 0, ck: 0, th: 0, ht: 0, cn: 0 });
  }

  function renderOrderCard(order, options) {
    options = options || {};
    var key = keyOf(order);
    var selected = key === options.selectedKey ? ' selected' : '';
    var delivered = ui.isDelivered(order);
    var dotClass = delivered ? 'delivered' : 'pending';
    var address = ui.orderAddress(order);
    var note = ui.orderNote(order);
    var salesStaff = ui.orderSalesStaff(order);

    return '<article class="m-order-card m-order-card-compact' + selected + '">' +
      '<button type="button" class="m-order-main" data-order-key="' + esc(key) + '">' +
        '<div class="m-order-card-header">' +
          '<div class="m-order-title"><b>' + esc(order.customerName || order.customerCode || 'Khách hàng') + '</b><span>Mã đơn: ' + esc(order.orderCode || key) + '</span></div>' +
          '<span class="m-order-status-pill ' + dotClass + '"><i class="delivery-status-dot ' + dotClass + '" aria-hidden="true"></i>' + esc(ui.statusLabel(order)) + '</span>' +
        '</div>' +
        (address ? '<p class="m-order-line m-order-address">ĐC: ' + esc(address) + '</p>' : '') +
        '<div class="m-order-compact-row">' +
          (salesStaff ? '<span>NVBH: ' + esc(salesStaff) + '</span>' : '<span>NVBH: -</span>') +
          '<strong>Phải thu: ' + money(amount(order, 'receivable')) + '</strong>' +
        '</div>' +
        (note ? '<p class="m-order-note">⚠ ' + esc(note) + '</p>' : '') +
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
