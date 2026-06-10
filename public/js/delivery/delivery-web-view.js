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
  function normalizeDebtAmount(value) {
    if (window.DeliveryCore && typeof window.DeliveryCore.normalizeDebtAmount === 'function') {
      return window.DeliveryCore.normalizeDebtAmount(value);
    }
    var n = Math.round(num(value));
    return Math.abs(n) <= 1000 ? 0 : n;
  }
  function baseAmount(order, key) { return num(order && order.amounts && order.amounts[key]); }
  function returnAmountFromReturnOrders(order) {
    var rows = returnsForOrder(order);
    if (rows.length) return rows.reduce(function (sum, row) { return sum + num(row.amount || row.returnAmount || (num(row.returnQty) * num(row.price))); }, 0);
    // Sau khi load returnOrders thành công, không fallback salesOrders.returnAmount nữa.
    // Nếu không có phiếu returnOrders thì hàng trả phải là 0.
    if (window.DeliveryCore && window.DeliveryCore.state && window.DeliveryCore.state.returnsLoaded) return 0;
    return baseAmount(order, 'returnAmount');
  }
  function amount(order, key) {
    if (key === 'returnAmount') return returnAmountFromReturnOrders(order);
    if (key === 'debt') {
      var receivable = baseAmount(order, 'receivable');
      var paid = baseAmount(order, 'cash') + baseAmount(order, 'bank') + baseAmount(order, 'reward') + returnAmountFromReturnOrders(order);
      return normalizeDebtAmount(Math.max(0, receivable - paid));
    }
    if (key === 'processed') return baseAmount(order, 'cash') + baseAmount(order, 'bank') + baseAmount(order, 'reward') + returnAmountFromReturnOrders(order);
    return baseAmount(order, key);
  }
  function orderKey(order) { return window.DeliveryCore.orderKey(order); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function staffLabel(item) {
    item = item || {};
    var code = item.staffCode || item.code || item.employeeCode || item.username || item.id || '';
    var name = item.fullName || item.name || item.staffName || item.username || '';
    return [code, name].filter(Boolean).join(' - ');
  }
  function staffCode(item) {
    item = item || {};
    return item.staffCode || item.code || item.employeeCode || item.username || item.id || '';
  }

  var state = { selectedKey: '', activeTab: 'products', accountingSelectedKeys: {} };

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
          '<label class="delivery-v46-filter-suggest">NVGH<input id="deliveryCoreDeliveryStaff" autocomplete="off" placeholder="Mã/tên NVGH"><div id="deliveryCoreDeliveryStaffSuggestions" class="delivery-v46-suggest-box"></div></label>' +
          '<label class="delivery-v46-filter-suggest">NVBH<input id="deliveryCoreSalesStaff" autocomplete="off" placeholder="Mã/tên NVBH"><div id="deliveryCoreSalesStaffSuggestions" class="delivery-v46-suggest-box"></div></label>' +
          '<label>Trạng thái<select id="deliveryCoreStatus"><option value="all">Tất cả</option><option value="delivered">Đã giao</option><option value="pending">Chưa giao</option><option value="return">Trả hàng</option><option value="debt">Công nợ</option></select></label>' +
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
          '<div class="delivery-v46-panel-title delivery-v46-panel-title-with-actions"><h3>Danh sách đơn</h3><div class="delivery-v46-list-actions"><button id="deliverySelectAllAccounting" type="button" class="secondary">Chọn tất cả</button><button id="deliveryBulkAccountingButton" type="button" class="primary">Xác nhận kế toán đã chọn</button><span id="deliveryCoreCount">0 đơn</span></div></div>' +
          '<div class="mk-delivery-list-head mk-delivery-list-grid">' +
            '<span class="mk-delivery-check-head"></span>' +
            '<span>Đơn / Khách hàng</span>' +
            '<span>PT</span>' +
            '<span>TM</span>' +
            '<span>CK</span>' +
            '<span>TH</span>' +
            '<span>HT</span>' +
            '<span>CN</span>' +
          '</div>' +
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
    if (byId('deliverySelectAllAccounting')) byId('deliverySelectAllAccounting').addEventListener('click', toggleSelectAllAccounting);
    if (byId('deliveryBulkAccountingButton')) byId('deliveryBulkAccountingButton').addEventListener('click', confirmSelectedAccounting);
    ['deliveryCoreDate', 'deliveryCoreDeliveryStaff', 'deliveryCoreSalesStaff', 'deliveryCoreStatus', 'deliveryCoreSearch'].forEach(function (id) {
      var input = byId(id);
      if (!input) return;
      input.addEventListener((id === 'deliveryCoreSearch' || id === 'deliveryCoreDeliveryStaff' || id === 'deliveryCoreSalesStaff') ? 'input' : 'change', debounce(load, 300));
    });
    attachStaffSuggest('deliveryCoreDeliveryStaff', 'deliveryCoreDeliveryStaffSuggestions', 'delivery');
    attachStaffSuggest('deliveryCoreSalesStaff', 'deliveryCoreSalesStaffSuggestions', 'sales');
  }


  function attachStaffSuggest(inputId, boxId, type) {
    var input = byId(inputId);
    var box = byId(boxId);
    if (!input || !box) return;
    var lastRun = 0;
    async function searchNow() {
      var q = String(input.value || '').trim();
      var stamp = Date.now();
      lastRun = stamp;
      if (!q && document.activeElement !== input) {
        box.innerHTML = '';
        box.classList.remove('show');
        return;
      }
      try {
        var rows = [];
        if (window.UnifiedSearchEngine) {
          rows = type === 'delivery'
            ? await window.UnifiedSearchEngine.searchDeliveryStaff(q, { limit: 12, minChars: 0, allowEmpty: '1' })
            : await window.UnifiedSearchEngine.searchSalesStaff(q, { limit: 12, minChars: 0, allowEmpty: '1' });
        } else {
          var path = type === 'delivery' ? 'delivery-staff' : 'sales-staff';
          var res = await fetch('/api/search/' + path + '?q=' + encodeURIComponent(q) + '&limit=12&allowEmpty=1&activeOnly=1', { headers: { Accept: 'application/json' } });
          var json = await res.json().catch(function () { return {}; });
          rows = json.items || json.users || json.staffs || [];
        }
        if (stamp !== lastRun) return;
        rows = (rows || []).filter(function (item) { return staffCode(item); }).slice(0, 12);
        if (!rows.length) {
          box.innerHTML = '<button type="button" class="delivery-v46-suggest-empty">Không có nhân viên trong Hệ thống</button>';
          box.classList.add('show');
          return;
        }
        box.innerHTML = rows.map(function (item, idx) {
          var code = staffCode(item);
          var name = item.fullName || item.name || item.staffName || item.username || '';
          return '<button type="button" data-staff-idx="' + idx + '"><b>' + esc(code) + '</b><span>' + esc(name) + '</span></button>';
        }).join('');
        box.classList.add('show');
        box.querySelectorAll('[data-staff-idx]').forEach(function (button) {
          button.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            var item = rows[Number(button.getAttribute('data-staff-idx'))] || {};
            input.value = staffCode(item);
            input.dataset.staffName = item.fullName || item.name || item.staffName || item.username || '';
            box.classList.remove('show');
            load();
          });
        });
      } catch (err) {
        box.innerHTML = '<button type="button" class="delivery-v46-suggest-empty">Không tải được gợi ý</button>';
        box.classList.add('show');
      }
    }
    input.addEventListener('focus', searchNow);
    input.addEventListener('input', debounce(searchNow, 220));
    input.addEventListener('blur', function () { setTimeout(function () { box.classList.remove('show'); }, 160); });
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
      statusFilter: byId('deliveryCoreStatus') && byId('deliveryCoreStatus').value,
      q: byId('deliveryCoreSearch') && byId('deliveryCoreSearch').value,
      checkStaffAssignment: '1'
    };
  }


  function isDelivered(order) {
    var st = order && order.status && typeof order.status === 'object' ? order.status : {};
    var value = String(st.deliveryStatus || order.deliveryStatus || order.status || '').toLowerCase();
    return ['delivered', 'success', 'done', 'completed'].indexOf(value) >= 0;
  }

  function isAccountingReopenPending(order) {
    order = order || {};
    var st = order.status && typeof order.status === 'object' ? order.status : {};
    var value = String(order.accountingStatus || st.accountingStatus || '').toLowerCase();
    return Boolean(order.accountingNeedsReconfirm || order.needReAccounting || order.reAccountingRequired || order.adminAdjustmentOpen)
      || ['reopened', 'needs_reconfirm', 'needs_repost'].indexOf(value) >= 0;
  }

  function isAccountingConfirmed(order) {
    order = order || {};
    if (isAccountingReopenPending(order)) return false;
    var st = order.status && typeof order.status === 'object' ? order.status : {};
    var value = String(order.accountingStatus || st.accountingStatus || '').toLowerCase();
    return Boolean(order.accountingConfirmed) || ['confirmed', 'locked', 'posted', 'done'].indexOf(value) >= 0;
  }

  function isAccountingSelectable(order) {
    if (!order || !accountingKey(order)) return false;
    if (!isDelivered(order)) return false;
    if (isAccountingReopenPending(order)) return true;
    return !isAccountingConfirmed(order);
  }

  function accountingKey(order) {
    order = order || {};
    return String(order.orderId || order.id || order.code || order.orderCode || order.salesOrderId || order.salesOrderCode || '').trim();
  }

  function selectedAccountingIds() {
    return Object.keys(state.accountingSelectedKeys || {}).filter(function (key) { return state.accountingSelectedKeys[key]; });
  }

  function syncAccountingSelection(rows) {
    var keep = {};
    (rows || []).forEach(function (order) {
      var key = accountingKey(order);
      if (key && state.accountingSelectedKeys[key] && isAccountingSelectable(order)) keep[key] = true;
    });
    state.accountingSelectedKeys = keep;
  }

  function updateBulkAccountingButton() {
    var ids = selectedAccountingIds();
    var bulk = byId('deliveryBulkAccountingButton');
    var all = byId('deliverySelectAllAccounting');
    if (bulk) bulk.textContent = ids.length ? ('Xác nhận kế toán đã chọn (' + ids.length + ')') : 'Xác nhận kế toán đã chọn';
    if (all) {
      var rows = getVisibleOrders();
      var eligible = rows.filter(isAccountingSelectable);
      var selectedCount = eligible.filter(function (order) { return state.accountingSelectedKeys[accountingKey(order)]; }).length;
      all.textContent = eligible.length && selectedCount === eligible.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
    }
  }

  function orderSearchText(order) {
    order = order || {};
    return [
      order.orderCode, order.salesOrderCode, order.code, order.id,
      order.customerCode, order.customerName,
      order.salesStaffCode, order.salesStaffName, order.staffCode, order.staffName,
      order.deliveryStaffCode, order.deliveryStaffName
    ].join(' ').toLowerCase();
  }

  function getVisibleOrders() {
    var rows = (window.DeliveryCore && window.DeliveryCore.state && window.DeliveryCore.state.orders) || [];
    var f = filters();
    var q = String(f.q || '').trim().toLowerCase();
    var statusFilter = String(f.statusFilter || 'all').trim().toLowerCase();
    return rows.filter(function (order) {
      if (q && orderSearchText(order).indexOf(q) < 0) return false;
      if (statusFilter === 'delivered') return isDelivered(order);
      if (statusFilter === 'pending') return !isDelivered(order);
      if (statusFilter === 'return') return amount(order, 'returnAmount') > 0;
      if (statusFilter === 'debt') return normalizeDebtAmount(amount(order, 'debt')) > 0;
      return true;
    });
  }

  function message(text, isError) {
    var node = byId('deliveryCoreMessage');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'message ' + (isError ? 'danger-text' : '');
  }

  function renderKpis() {
    var rows = getVisibleOrders();
    var sum = rows.reduce(function (acc, order) {
      acc.receivable += amount(order, 'receivable');
      acc.cash += amount(order, 'cash');
      acc.bank += amount(order, 'bank');
      acc.reward += amount(order, 'reward');
      acc.returnAmount += amount(order, 'returnAmount');
      acc.debt += normalizeDebtAmount(amount(order, 'debt'));
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

  function statusText(order){ return ''; }

  function staffAssignmentBadge(order) {
    var check = order && order.staffAssignment;
    if (!check) return '';
    return '';
    return '';
  }

  function staffAssignmentDetailHtml(order) {
    var check = order && order.staffAssignment;
    if (!check) return '';
    function line(item) {
      item = item || {};
      return '<div class="delivery-v46-staff-check-line ' + (item.ok ? 'ok' : 'warn') + '">' +
        '<b>' + esc(item.label || '') + '</b>' +
        '<span>Đơn: ' + esc([item.assignedCode, item.assignedName].filter(Boolean).join(' - ') || 'thiếu') + '</span>' +
        '<span>Hệ thống: ' + esc([item.systemCode, item.systemName].filter(Boolean).join(' - ') || 'không tìm thấy') + '</span>' +
        '<em>' + esc(item.message || '') + '</em>' +
      '</div>';
    }
    return '<div class="delivery-v46-staff-check-box"><h4>Kiểm tra nhân viên theo Hệ thống</h4>' + line(check.sales) + line(check.delivery) + '</div>';
  }

  function paymentValueCell(order, key, className) {
    var value = amount(order, key);
    var extraClass = className || '';
    if (key === 'debt') { value = normalizeDebtAmount(value); extraClass += value > 0 ? ' debt-open' : ' debt-done'; }
    return '<span class="mk-delivery-money ' + esc(extraClass) + '" title="' + esc(money(value)) + '">' + esc(money(value)) + '</span>';
  }

  function renderList() {
    renderKpis();
    var list = byId('deliveryCoreList');
    if (!list) return;
    var rows = getVisibleOrders();
    syncAccountingSelection(rows);
    updateBulkAccountingButton();
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">Không có đơn giao theo bộ lọc.</div>';
      return;
    }
    list.innerHTML = rows.map(function (order) {
      var key = orderKey(order);
      var selected = key === state.selectedKey ? ' selected' : '';
      var accKey = accountingKey(order);
      var accountingSelected = accKey && state.accountingSelectedKeys[accKey];
      var accountingLocked = isAccountingConfirmed(order);
      var accountingNeedsReconfirm = isAccountingReopenPending(order);
      var accountingSelectable = isAccountingSelectable(order);
      var debtValue = normalizeDebtAmount(amount(order, 'debt'));
      var debtClass = debtValue > 0 ? ' debt-open' : ' debt-done';
      var orderCode = order.orderCode || order.salesOrderCode || order.code || order.id || '';
      var customerLabel = (order.customerName || '') + (order.customerCode ? ' · ' + order.customerCode : '');
      var salesStaff = order.salesStaffName || order.salesStaffCode || '';
      var deliveryStaff = order.deliveryStaffName || order.deliveryStaffCode || '';
      return '' +
        '<button type="button" class="mk-delivery-order-row mk-delivery-list-grid' + selected + '" data-key="' + esc(key) + '">' +
          '<span class="mk-delivery-check mk-delivery-accounting-check" data-accounting-key="' + esc(accKey) + '" title="Chọn để xác nhận kế toán">' + (accountingLocked ? '✓' : (accountingSelected ? '✓' : (accountingNeedsReconfirm ? '!' : ''))) + '</span>' +
          '<span class="mk-delivery-order-main">' +
            '<strong>' + esc(orderCode) + '</strong>' +
            '<span>' + esc(customerLabel || 'Chưa có khách hàng') + '</span>' +
            '<em>' + esc(statusText(order)) + '</em>' + staffAssignmentBadge(order) +
          '</span>' +
          paymentValueCell(order, 'receivable', 'cell-pt') +
          paymentValueCell(order, 'cash', 'cell-tm') +
          paymentValueCell(order, 'bank', 'cell-ck') +
          paymentValueCell(order, 'reward', 'cell-th') +
          paymentValueCell(order, 'returnAmount', 'cell-ht') +
          paymentValueCell(order, 'debt', 'cell-cn') +
        '</button>';
    }).join('');
    list.querySelectorAll('[data-accounting-key]').forEach(function (node) {
      node.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var accKey = node.getAttribute('data-accounting-key');
        if (!accKey) return;
        var order = (window.DeliveryCore.state.orders || []).find(function (row) { return accountingKey(row) === accKey; });
        if (order && !isAccountingSelectable(order)) {
          message(isDelivered(order) ? 'Đơn này đã xác nhận kế toán, không cần chọn lại' : 'Đơn chưa giao, chưa thể xác nhận kế toán');
          return;
        }
        if (state.accountingSelectedKeys[accKey]) delete state.accountingSelectedKeys[accKey];
        else state.accountingSelectedKeys[accKey] = true;
        renderList();
      });
    });
    list.querySelectorAll('[data-key]').forEach(function (button) {
      button.addEventListener('click', function () { select(button.getAttribute('data-key')); });
    });
  }

  function detailActionHtml(order) {
    var delivered = isDelivered(order);
    var posted = isAccountingConfirmed(order);
    var needReconfirm = isAccountingReopenPending(order);
    var html = '<div class="delivery-v46-detail-actions">';
    if (!delivered) {
      html += '<button id="deliveryConfirmButton" type="button" class="success">Xác nhận giao</button>';
    } else if (needReconfirm) {
      html += '<button id="deliveryAccountingButton" type="button" class="primary">Xác nhận kế toán lại</button>';
      html += '<span class="delivery-accounting-status warn">Chờ xác nhận lại</span>';
    } else if (posted) {
      html += '<button type="button" class="secondary muted-locked" disabled>Đã xác nhận kế toán</button>';
      // ===== SCOPED FIX: DELIVERY TODAY ADMIN ACCOUNTING UNLOCK BUTTON START =====
      // Chỉ hiện nút mở khóa khi đơn đã giao, đã xác nhận kế toán và chưa ở trạng thái chờ xác nhận lại.
      html += '<button id="deliveryAccountingUnlockButton" type="button" class="danger">Mở khóa kế toán</button>';
      // ===== SCOPED FIX: DELIVERY TODAY ADMIN ACCOUNTING UNLOCK BUTTON END =====
    } else {
      html += '<button id="deliveryAccountingButton" type="button" class="primary">Xác nhận kế toán</button>';
    }
    html += '</div>';
    return html;
  }

  function renderDetail(order) {
    var detail = byId('deliveryCoreDetail');
    if (!detail) return;
    if (!order) {
      detail.innerHTML = '<div class="delivery-v46-detail-empty">Chọn đơn bên trái để xem chi tiết.</div>';
      return;
    }
    if (state.activeTab === 'summary') state.activeTab = 'payment';
    var items = Array.isArray(order.items) ? order.items : [];
    detail.innerHTML = '' +
      '<div class="delivery-v46-detail-head">' +
        '<div><h3>' + esc(order.orderCode) + '</h3><p>' + esc(order.customerName) + ' · ' + esc(order.customerCode) + '</p></div>' +
        detailActionHtml(order) +
      '</div>' +
      staffAssignmentDetailHtml(order) +
      '<div class="delivery-v46-tabs">' +
        '<button type="button" data-delivery-detail-tab="products" class="' + (state.activeTab === 'products' ? 'active' : '') + '">Sản phẩm giao</button>' +
        '<button type="button" data-delivery-detail-tab="returns" class="' + (state.activeTab === 'returns' ? 'active' : '') + '">Hàng trả</button>' +
        '<button type="button" data-delivery-detail-tab="payment" class="' + (state.activeTab === 'payment' ? 'active' : '') + '">Thu tiền & Tổng kết</button>' +
      '</div>' +
      '<div class="delivery-v46-tab-body">' +
        (state.activeTab === 'returns' ? returnsHtml(order) : (state.activeTab === 'payment' ? paymentSummaryHtml(order) : productsHtml(items))) +
      '</div>';
    detail.querySelectorAll('[data-delivery-detail-tab]').forEach(function (button) {
      button.addEventListener('click', function () { state.activeTab = button.getAttribute('data-delivery-detail-tab'); renderDetail(order); });
    });
    if (byId('deliveryReturnForm')) byId('deliveryReturnForm').addEventListener('submit', saveReturn);
    if (byId('deliveryReturnUpdateForm')) byId('deliveryReturnUpdateForm').addEventListener('submit', saveReturn);
    if (byId('deliveryBackProductsButton')) byId('deliveryBackProductsButton').addEventListener('click', function () { state.activeTab = 'products'; renderDetail(order); });
    if (byId('deliveryPaymentForm')) byId('deliveryPaymentForm').addEventListener('submit', savePayment);
    if (byId('deliveryClearReturnButton')) byId('deliveryClearReturnButton').addEventListener('click', function () { saveReturn({ preventDefault: function () {}, forceZero: true }); });
    if (byId('deliveryConfirmButton')) byId('deliveryConfirmButton').addEventListener('click', confirmDelivery);
    if (byId('deliveryAccountingButton')) byId('deliveryAccountingButton').addEventListener('click', function () { confirmAccounting(order); });
    // ===== SCOPED FIX: DELIVERY TODAY ADMIN ACCOUNTING UNLOCK EVENT START =====
    // Gắn sự kiện riêng cho nút mở khóa kế toán ở panel chi tiết, không can thiệp các nút khác.
    if (byId('deliveryAccountingUnlockButton')) {
      byId('deliveryAccountingUnlockButton').addEventListener('click', function () { unlockAccounting(order); });
    }
    // ===== SCOPED FIX: DELIVERY TODAY ADMIN ACCOUNTING UNLOCK EVENT END =====
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
        '<div class="delivery-v46-actions"><button type="submit">Lưu hàng trả</button><button type="button" id="deliveryClearReturnButton" class="secondary">Xóa hàng trả</button></div>' +
      '</form>';
  }

  function hidden(idx, field, value) {
    return '<input type="hidden" data-return-field="' + esc(field) + '" data-idx="' + idx + '" value="' + esc(value) + '">';
  }

  function cleanReturnCode(value) {
    return String(value == null ? '' : value).trim().replace(/^RO[-_]?/i, '');
  }

  function returnsForOrder(order) {
    order = order || {};
    var ids = [order.orderId, order.salesOrderId, order.id, order._id].map(String).filter(function (v) { return v && v !== 'undefined' && v !== 'null'; });
    var codes = [order.orderCode, order.salesOrderCode, order.code, order.displayOrderCode].map(cleanReturnCode).filter(Boolean);
    return (window.DeliveryCore.state.returns || []).filter(function (row) {
      var rowIds = [row.salesOrderId, row.orderId, row.sourceOrderId, row.deliveryOrderId].map(String);
      var rowCodes = [row.salesOrderCode, row.orderCode, row.sourceOrderCode, row.deliveryOrderCode, row.returnOrderCode].map(cleanReturnCode);
      return ids.some(function (id) { return rowIds.indexOf(id) >= 0; }) || codes.some(function (code) { return rowCodes.indexOf(code) >= 0; });
    });
  }

  function returnsHtml(order) {
    var rows = returnsForOrder(order);
    if (!rows.length) {
      return '<div class="empty-state">Đơn này chưa có phiếu trả trong returnOrders. Nhập SL trả ở tab Sản phẩm giao rồi bấm Lưu hàng trả.</div>';
    }
    var total = rows.reduce(function (sum, row) { return sum + num(row.amount); }, 0);
    return '' +
      '<form id="deliveryReturnUpdateForm">' +
        '<div class="delivery-v46-return-list-title"><b>Hàng trả đã lưu trong returnOrders</b><span>Tổng: ' + money(total) + '</span></div>' +
        '<div class="delivery-v46-return-table">' +
          '<div class="delivery-v46-return-head"><span>Mã đơn</span><span>Khách hàng</span><span>Sản phẩm</span><span>SL</span><span>Giá</span><span>Thành tiền</span><span>Trạng thái</span></div>' +
          rows.map(function (row, idx) {
            return '<div class="delivery-v46-return-row">' +
              '<span>' + esc(row.salesOrderCode || row.returnOrderCode) + '</span>' +
              '<span>' + esc(row.customerName || row.customerCode) + '</span>' +
              '<span><b>' + esc(row.productCode) + '</b><small>' + esc(row.productName) + '</small>' + hidden(idx, 'productCode', row.productCode) + hidden(idx, 'productName', row.productName) + hidden(idx, 'price', row.price) + '</span>' +
              '<span><input data-return-field="returnQty" data-idx="' + idx + '" type="number" min="0" step="1" value="' + esc(row.returnQty) + '"></span>' +
              '<span>' + money(row.price) + '</span>' +
              '<span>' + money(row.amount) + '</span>' +
              '<span>' + esc(row.status || '') + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="delivery-v46-actions"><button type="submit">Cập nhật hàng trả</button><button type="button" id="deliveryBackProductsButton" class="secondary">Sửa từ sản phẩm giao</button></div>' +
      '</form>';
  }

  function paymentSummaryHtml(order) {
    var r = (order && order.reconciliation) || {};
    var debtForStatus = normalizeDebtAmount(amount(order, 'debt'));
    var cls = r.balanced === false ? ' danger-text' : (debtForStatus > 0 ? ' danger-text' : ' success-text');
    var msg = r.message || (debtForStatus > 0 ? 'Còn công nợ' : 'Đối soát OK');
    var returnAmount = returnAmountFromReturnOrders(order);

    // MK-SCOPED-FIX: PAYMENT_ACCOUNTING_LOCK_START
    // Khóa riêng form Thu tiền khi đơn đã xác nhận kế toán và chưa được admin mở khóa.
    // Chỉ tác động tab Thu tiền & Tổng kết, không đổi luồng hàng giao/hàng trả.
    var accountingLocked = isAccountingConfirmed(order) && !isAccountingReopenPending(order);
    var disabledAttr = accountingLocked ? ' disabled' : '';
    var lockedNotice = accountingLocked
      ? '<div class="delivery-v46-locked-note danger-text">Đơn đã xác nhận kế toán. Muốn sửa tiền cần mở khóa admin trước.</div>'
      : '';
    // MK-SCOPED-FIX: PAYMENT_ACCOUNTING_LOCK_END

    return '' +
      '<div class="delivery-v46-payment-summary-tab">' +
        '<form id="deliveryPaymentForm" class="delivery-v46-payment-form">' +
          '<h4>Thu tiền</h4>' +
          lockedNotice +
          '<label>Tiền mặt<input name="cash" type="number" min="0" value="' + esc(baseAmount(order, 'cash')) + '"' + disabledAttr + '></label>' +
          '<label>Chuyển khoản<input name="bank" type="number" min="0" value="' + esc(baseAmount(order, 'bank')) + '"' + disabledAttr + '></label>' +
          '<label>Trả thưởng<input name="reward" type="number" min="0" value="' + esc(baseAmount(order, 'reward')) + '"' + disabledAttr + '></label>' +
          '<button type="submit"' + disabledAttr + '>Lưu thu tiền</button>' +
        '</form>' +
        '<section class="delivery-v46-summary-box">' +
          '<h4>Tổng kết đơn</h4>' +
          '<div class="delivery-v46-reconcile' + cls + '"><b>' + esc(msg) + '</b></div>' +
          '<div class="delivery-v46-summary-grid">' +
            '<div><span>Phải thu</span><b>' + money(baseAmount(order, 'receivable')) + '</b></div>' +
            '<div><span>Tiền mặt</span><b>' + money(baseAmount(order, 'cash')) + '</b></div>' +
            '<div><span>Chuyển khoản</span><b>' + money(baseAmount(order, 'bank')) + '</b></div>' +
            '<div><span>Trả thưởng</span><b>' + money(baseAmount(order, 'reward')) + '</b></div>' +
            '<div class="returnorders-source"><span>Hàng trả</span><b>' + money(returnAmount) + '</b><small>Nguồn: returnOrders</small></div>' +
            '<div><span>Còn nợ</span><b>' + money(normalizeDebtAmount(amount(order, 'debt'))) + '</b></div>' +
          '</div>' +
        '</section>' +
      '</div>';
  }

  function paymentHtml(order) { return paymentSummaryHtml(order); }
  function summaryHtml(order) { return paymentSummaryHtml(order); }

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
      message(json.message || 'Đã lưu hàng trả vào returnOrders');
      state.selectedKey = orderKey(window.DeliveryCore.state.selectedOrder);
      state.activeTab = forceZero ? 'products' : 'returns';
      renderList();
      renderDetail(window.DeliveryCore.state.selectedOrder);
    } catch (err) { message(err.message, true); }
  }

  async function savePayment(event) {
    if (event && event.preventDefault) event.preventDefault();
    // MK-SCOPED-FIX: PAYMENT_ACCOUNTING_LOCK_GUARD_START
    // Chặn ở JS trước khi gọi API để tránh sửa tiền sau khi kế toán đã xác nhận.
    var selectedOrder = window.DeliveryCore && window.DeliveryCore.state ? window.DeliveryCore.state.selectedOrder : null;
    if (isAccountingConfirmed(selectedOrder) && !isAccountingReopenPending(selectedOrder)) {
      message('Đơn đã xác nhận kế toán, cần mở khóa admin trước khi sửa tiền', true);
      return;
    }
    // MK-SCOPED-FIX: PAYMENT_ACCOUNTING_LOCK_GUARD_END
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

  async function confirmAccounting(order) {
    if (!order || !window.DeliveryCore) return;
    var key = accountingKey(order);
    if (!key) {
      message('Không xác định được mã đơn để xác nhận kế toán', true);
      return;
    }
    if (!isAccountingSelectable(order)) {
      message(isDelivered(order) ? 'Đơn này đã xác nhận kế toán' : 'Đơn chưa giao, chưa thể xác nhận kế toán');
      return;
    }
    if (!confirm(isAccountingReopenPending(order) ? 'Xác nhận kế toán lại đơn này?' : 'Xác nhận kế toán đơn này?')) return;
    try {
      message('Đang xác nhận kế toán...');
      var json = await window.DeliveryCore.confirmAccounting([key], filters());
      delete state.accountingSelectedKeys[key];
      message(json.message || 'Đã xác nhận kế toán');
      await load();
    } catch (err) { message(err.message || 'Không xác nhận kế toán được', true); }
  }


  // ===== SCOPED FIX: DELIVERY TODAY ADMIN ACCOUNTING UNLOCK HANDLER START =====
  // Mở khóa kế toán chỉ dành cho đơn đã xác nhận kế toán trong mục Đơn giao hôm nay.
  // Backend hiện có sẵn API /api/master-orders/delivery-today/:id/admin-unlock.
  async function unlockAccounting(order) {
    if (!order || !window.DeliveryCore) return;
    var key = accountingKey(order);
    if (!key) {
      message('Không xác định được mã đơn để mở khóa kế toán', true);
      return;
    }
    if (!isDelivered(order) || !isAccountingConfirmed(order) || isAccountingReopenPending(order)) {
      message('Chỉ mở khóa được đơn đã giao và đã xác nhận kế toán', true);
      return;
    }
    var reason = prompt('Nhập lý do mở khóa kế toán:');
    if (!reason || !reason.trim()) {
      message('Cần nhập lý do mở khóa kế toán', true);
      return;
    }
    if (!confirm('Mở khóa kế toán đơn này? Sau khi sửa tiền cần xác nhận kế toán lại.')) return;
    try {
      message('Đang mở khóa kế toán...');
      var json = await window.DeliveryCore.adminUnlockAccounting(key, reason.trim());
      message(json.message || 'Đã mở khóa kế toán');
      await load();
    } catch (err) {
      message(err.message || 'Không mở khóa kế toán được', true);
    }
  }
  // ===== SCOPED FIX: DELIVERY TODAY ADMIN ACCOUNTING UNLOCK HANDLER END =====

  function toggleSelectAllAccounting() {
    var rows = getVisibleOrders().filter(isAccountingSelectable);
    var allSelected = rows.length && rows.every(function (order) { return state.accountingSelectedKeys[accountingKey(order)]; });
    rows.forEach(function (order) {
      var key = accountingKey(order);
      if (allSelected) delete state.accountingSelectedKeys[key];
      else state.accountingSelectedKeys[key] = true;
    });
    renderList();
  }

  async function confirmSelectedAccounting() {
    var valid = getVisibleOrders().filter(function (order) {
      var key = accountingKey(order);
      return key && state.accountingSelectedKeys[key] && isAccountingSelectable(order);
    });
    var ids = valid.map(accountingKey);
    if (!ids.length) {
      message('Vui lòng chọn ít nhất 1 đơn hợp lệ để xác nhận kế toán', true);
      return;
    }
    if (!confirm('Xác nhận kế toán ' + ids.length + ' đơn đã chọn?')) return;
    try {
      message('Đang xác nhận kế toán ' + ids.length + ' đơn...');
      var json = await window.DeliveryCore.confirmAccounting(ids, filters());
      state.accountingSelectedKeys = {};
      message(json.message || 'Đã xác nhận kế toán các đơn đã chọn');
      await load();
    } catch (err) { message(err.message || 'Không xác nhận kế toán được các đơn đã chọn', true); }
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

  async function select(key) {
    state.selectedKey = key;
    var order = window.DeliveryCore.selectOrder(key);
    renderList();
    renderDetail(order);
    if (order && window.DeliveryCore && typeof window.DeliveryCore.loadReturnsForOrder === "function") {
      try {
        await window.DeliveryCore.loadReturnsForOrder(order);
        renderDetail(order);
      } catch (e) {
        console.error("loadReturnsForOrder failed", e);
      }
    }
  }

  async function load() {
    if (!window.DeliveryCore) return;
    if (!byId('deliveryCoreList')) renderShell();
    var list = byId('deliveryCoreList');
    if (list) list.innerHTML = '<div class="empty-state">Đang tải...</div>';
    try {
      var f = filters();
      var hasFilter = (f.q || f.salesStaffCode || f.deliveryStaffCode || f.status);
      if (!hasFilter) {
        if (list) list.innerHTML = '<div class="empty-state">Vui lòng nhập mã đơn, khách hàng, NVGH/NVBH hoặc chọn bộ lọc để tải dữ liệu.</div>';
        return;
      }
      await window.DeliveryCore.loadOrders(f);
      await window.DeliveryCore.loadReturns(f);
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
