(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function num(v) { return window.DeliveryCore ? window.DeliveryCore.toNumber(v) : Number(v || 0); }
  function money(v) { return window.DeliveryCore ? window.DeliveryCore.money(v) : String(Math.round(Number(v || 0))); }
  function amount(o, k) { return num(o && o.amounts && o.amounts[k]); }
  function keyOf(o) { return window.DeliveryCore.orderKey(o); }
  function today() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

<<<<<<< HEAD
  var el = deliveryMobileUi.el;
  var esc = deliveryMobileUi.esc;
  var num = deliveryMobileUi.num;
  var money = deliveryMobileUi.money;
  var amount = deliveryMobileUi.amount;
  var keyOf = deliveryMobileUi.keyOf;
  var today = deliveryMobileUi.today;
  var readUser = deliveryMobileUi.readUser;
  var userDisplayName = deliveryMobileUi.userDisplayName;
  var userStaffCode = deliveryMobileUi.userStaffCode;
  var userRoleLabel = deliveryMobileUi.userRoleLabel;
  var selectedOrderSummary = deliveryMobileUi.selectedOrderSummary;
  var phoneHref = deliveryMobileUi.phoneHref;
  var mapHref = deliveryMobileUi.mapHref;
  var copyText = deliveryMobileUi.copyText;
  var debounce = deliveryMobileUi.debounce;
  var msg = deliveryMobileUi.msg;
  var buildOrderKpi = deliveryOrdersView.buildOrderKpi;
  var buildRouteKpi = deliveryOrdersView.buildRouteKpi;

=======
>>>>>>> parent of 5f06eb5 (a)
  var mobileUiRuntime = window.MobileUiRuntime || null;
  var deliveryLifecycle = mobileUiRuntime ? mobileUiRuntime.createLifecycle() : null;
  var deliveryLoadGate = mobileUiRuntime ? mobileUiRuntime.createRequestGate() : null;
  var deliveryOrderRenderer = null;
  var deliveryDebtRenderer = null;
  var deliveryDebtRendererContainer = null;

  var state = {
    selectedKey: '',
    tab: 'orders',
    debts: [],
    debtSummary: {},
    selectedDebtIndex: -1,
    selectedDebtKey: '',
    debtSubtab: 'customers',
    debtSearch: '',
    debtSort: 'debt_desc',
    debtFormDirty: false,
    debtListScrollTop: 0,
    debtLoaded: false,
    debtLoading: false
  };

  function readUser() { try { return JSON.parse(localStorage.getItem('v43_mobile_user') || localStorage.getItem('mk_web_user') || '{}'); } catch (err) { return {}; } }
  function userDisplayName(user) { return String((user && (user.fullName || user.name || user.username || user.staffCode || user.code)) || '').trim(); }
  function userStaffCode(user) { return String((user && (user.staffCode || user.code)) || '').trim(); }
  function userRoleLabel(user) {
    var role = String((user && user.role) || '').toLowerCase();
    if (user && user.roleLabel) return String(user.roleLabel);
    if (role === 'delivery') return 'Nhân viên giao hàng';
    if (role === 'admin') return 'Admin';
    return role || 'Tài khoản';
  }
  function deliveryStatusOf(order) {
    var st = order && order.status && typeof order.status === 'object' ? order.status.deliveryStatus : '';
    return String(st || (order && (order.deliveryStatus || order.status)) || 'pending').toLowerCase();
  }
  function isDelivered(order) { return ['delivered', 'success', 'done', 'completed'].indexOf(deliveryStatusOf(order)) >= 0; }
  function requireDeliveryLogin() {
    var user = readUser();
    var role = String(user.role || '').toLowerCase();
    if (!user || !user.role) { window.location.href = '/login.html?target=delivery'; return false; }
    if (role !== 'admin' && role !== 'delivery') { alert('Tài khoản không có quyền vào App giao hàng.'); window.location.href = '/login.html?target=delivery'; return false; }
    return true;
  }

  function logout() {
    ['mk_web_token','mk_web_refresh_token','mk_web_user','v43_mobile_token','v43_mobile_refresh_token','v43_mobile_user'].forEach(function (key) { localStorage.removeItem(key); });
    fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'X-Requested-With':'XMLHttpRequest'}}).catch(function(){}).finally(function(){window.location.href='/login.html';});
  }

  function root() {
    var r = el('mobileDeliveryRoot');
    if (!r) {
      r = document.createElement('main');
      r.id = 'mobileDeliveryRoot';
      document.body.innerHTML = '';
      document.body.appendChild(r);
    }
    r.className = 'mobile-delivery-v46';
    return r;
  }

  function renderShell() {
    var user = readUser();
    var displayName = userDisplayName(user);
    var staffCode = userStaffCode(user);
    var accountText = displayName ? (displayName + (staffCode && staffCode !== displayName ? ' - ' + staffCode : '')) : 'Chưa xác định tài khoản';
    root().innerHTML = '' +
      '<header class="m-delivery-header m-delivery-header-compact">' +
        '<div class="m-delivery-title-block"><h1>Giao hàng hôm nay</h1><div class="m-account-info"><b>NVGH: ' + esc(accountText) + '</b><span>' + esc(userRoleLabel(user)) + '</span></div></div>' +
        '<div class="m-delivery-header-actions"><button id="mReload" type="button">Tải</button><details class="m-delivery-more"><summary aria-label="Mở menu phụ">⋮</summary><div class="m-delivery-more-menu"><button type="button" data-m-menu-tab="products">Sản phẩm đơn</button><button type="button" data-m-menu-tab="reconciliation">Đối soát ngày</button><button id="mLogout" type="button">Đăng xuất</button></div></details></div>' +
      '</header>' +
<<<<<<< HEAD
      '<section class="m-delivery-filter m-delivery-filter-compact"><input id="mDate" type="date"><select id="mStatusFilter"><option value="all">Tất cả</option><option value="pending" selected>Chưa giao</option><option value="delivered">Đã giao</option><option value="return">Trả hàng</option><option value="debt">Công nợ</option></select><input id="mSearch" type="search" placeholder="Tìm khách / mã đơn / SĐT"></section>' +
      '<section class="m-delivery-kpis m-delivery-kpis-compact" aria-label="Tóm tắt tuyến giao hàng">' +
        '<div><span title="Tổng số đơn trong tuyến">Tổng đơn</span><b id="mKpiTotalOrders">0</b></div><div><span title="Số đơn chưa giao">Chưa giao</span><b id="mKpiPendingOrders">0</b></div>' +
        '<div><span title="Số đơn đã giao">Đã giao</span><b id="mKpiDeliveredOrders">0</b></div><div><span title="Tổng tiền còn phải thu">Phải thu</span><b id="mKpiPt">0</b></div>' +
=======
      '<section class="m-delivery-filter"><input id="mDate" type="date"><select id="mStatusFilter"><option value="all">Tất cả</option><option value="delivered">Đã giao</option><option value="pending">Chưa giao</option><option value="return">Trả hàng</option><option value="debt">Công nợ</option></select><input id="mSearch" placeholder="Tìm khách/mã đơn"></section>' +
      '<section class="m-delivery-kpis">' +
        '<div><span>PT</span><b id="mKpiPt">0</b></div><div><span>TM</span><b id="mKpiTm">0</b></div><div><span>CK</span><b id="mKpiCk">0</b></div>' +
        '<div><span>TH</span><b id="mKpiTh">0</b></div><div><span>HT</span><b id="mKpiHt">0</b></div><div><span>CN</span><b id="mKpiCn">0</b></div>' +
>>>>>>> parent of 5f06eb5 (a)
      '</section>' +
      '<nav class="m-delivery-tabs m-delivery-tabs-main" aria-label="Chức năng chính app giao hàng">' +
        '<button data-m-tab="orders" class="active">Đơn giao</button>' +
        '<button data-m-tab="payment">Thu tiền</button>' +
        '<button data-m-tab="returns">Hàng trả</button>' +
        '<button data-m-tab="debt">Công nợ</button>' +
      '</nav>' +
      '<section id="mBody" class="m-delivery-body">Đang tải...</section>' +
      '<section id="mBottomAction" class="m-delivery-bottom-action" aria-live="polite"></section>' +
      '<p id="mMsg" class="m-delivery-msg"></p>';
    el('mDate').value = today();
    deliveryOrderRenderer = mobileUiRuntime
      ? mobileUiRuntime.createChunkedHtmlRenderer(el('mBody'), { initialCount: 60, chunkSize: 80 })
      : null;
    var bind = deliveryLifecycle ? deliveryLifecycle.listen : function (target, type, handler) {
      target.addEventListener(type, handler);
      return function () { target.removeEventListener(type, handler); };
    };
    bind(el('mReload'), 'click', load);
    bind(el('mLogout'), 'click', logout);
    bind(el('mDate'), 'change', load);
    bind(el('mStatusFilter'), 'change', load);
    var debouncedSearch = mobileUiRuntime ? mobileUiRuntime.debounce(load, 250) : debounce(load, 250);
    bind(el('mSearch'), 'input', debouncedSearch);
    if (deliveryLifecycle) deliveryLifecycle.add(function () { if (debouncedSearch.cancel) debouncedSearch.cancel(); });
    document.querySelectorAll('[data-m-tab]').forEach(function (button) {
      bind(button, 'click', function () {
<<<<<<< HEAD
        switchTab(button.getAttribute('data-m-tab'));
      });
    });
    document.querySelectorAll('[data-m-menu-tab]').forEach(function (button) {
      bind(button, 'click', function () {
        var menu = button.closest('details');
        if (menu) menu.open = false;
        switchTab(button.getAttribute('data-m-menu-tab'));
=======
        var nextTab = button.getAttribute('data-m-tab');
        if (
          state.tab === 'debt' &&
          nextTab !== 'debt' &&
          state.debtFormDirty &&
          !window.confirm('Bạn đang có phiếu thu chưa gửi. Rời Công nợ sẽ xóa dữ liệu đang nhập.')
        ) {
          return;
        }
        if (state.tab === 'debt' && nextTab !== 'debt') state.debtFormDirty = false;
        state.tab = nextTab;
        render();
        if (state.tab === 'returns') loadSelectedReturnsDirect();
        if (state.tab === 'debt') loadDeliveryDebts();
>>>>>>> parent of 5f06eb5 (a)
      });
    });
    if (deliveryLifecycle) {
      deliveryLifecycle.delegate(el('mBody'), 'click', '[data-order-key]', function (_event, button) {
        select(button.getAttribute('data-order-key'));
      });
<<<<<<< HEAD
      deliveryLifecycle.delegate(el('mBody'), 'click', '[data-copy-address]', function (event, button) {
        event.preventDefault();
        event.stopPropagation();
        copyText(button.getAttribute('data-copy-address')).then(function () {
          msg('Đã copy địa chỉ khách hàng');
        }).catch(function (err) {
          msg(err.message || 'Không copy được địa chỉ', true);
        });
      });
      deliveryLifecycle.delegate(el('mBody'), 'click', '[data-order-pay]', function (event, button) {
        event.preventDefault();
        event.stopPropagation();
        goToOrderAction(button.getAttribute('data-order-pay'), 'payment');
      });
      deliveryLifecycle.delegate(el('mBody'), 'click', '[data-order-confirm]', function (event, button) {
        event.preventDefault();
        event.stopPropagation();
        goToOrderAction(button.getAttribute('data-order-confirm'), 'confirm');
      });
=======
>>>>>>> parent of 5f06eb5 (a)
      deliveryLifecycle.delegate(el('mBody'), 'click', '[data-debt-index]:not([disabled])', function (_event, button) {
        openDeliveryDebtCollection(Number(button.getAttribute('data-debt-index')));
      });
      deliveryLifecycle.listen(window, 'pagehide', function () {
        if (deliveryOrderRenderer) deliveryOrderRenderer.cancel();
        if (deliveryDebtRenderer) deliveryDebtRenderer.cancel();
        deliveryLoadGate.cancel();
        deliveryLifecycle.destroy();
      }, { once: true });
    }
  }

<<<<<<< HEAD
  function switchTab(nextTab) {
    if (!nextTab) return;
    if (
      state.tab === 'debt' &&
      nextTab !== 'debt' &&
      state.debtFormDirty &&
      !window.confirm('Bạn đang có phiếu thu chưa gửi. Rời Công nợ sẽ xóa dữ liệu đang nhập.')
    ) {
      return;
    }
    if (state.tab === 'debt' && nextTab !== 'debt') state.debtFormDirty = false;
    state.tab = nextTab;
    render();
    if (state.tab === 'returns') loadSelectedReturnsDirect({ force: false });
    if (state.tab === 'debt') loadDeliveryDebts(false);
    if (state.tab === 'reconciliation') loadDeliveryReconciliation(false);
  }

  function goToOrderAction(orderKey, action) {
    if (orderKey) {
      state.selectedKey = orderKey;
      window.DeliveryCore.selectOrder(orderKey);
    }
    if (action === 'payment') {
      switchTab('payment');
      return;
    }
    if (action === 'returns') {
      switchTab('returns');
      return;
    }
    if (action === 'products') {
      switchTab('products');
      return;
    }
    if (action === 'confirm') {
      confirmDelivery();
    }
  }

  function renderBottomAction() {
    var node = el('mBottomAction');
    if (!node) return;
    var order = currentOrder();
    if (!order || state.tab !== 'orders') {
      node.innerHTML = '';
      node.className = 'm-delivery-bottom-action';
      return;
    }
    var key = keyOf(order);
    var phone = deliveryMobileUi.orderPhone(order);
    var call = phoneHref(phone);
    node.className = 'm-delivery-bottom-action active';
    node.innerHTML = '<div><b>' + esc(order.customerName || order.customerCode || 'Khách hàng') + '</b><span>' + money(amount(order, 'receivable')) + '</span></div>' +
      (call ? '<a href="' + esc(call) + '">Gọi</a>' : '<button type="button" disabled>Gọi</button>') +
      '<button type="button" data-bottom-pay="' + esc(key) + '">Thu tiền</button>' +
      '<button type="button" data-bottom-return="' + esc(key) + '">Trả hàng</button>';
    var pay = node.querySelector('[data-bottom-pay]');
    var ret = node.querySelector('[data-bottom-return]');
    if (pay) pay.addEventListener('click', function () { goToOrderAction(key, 'payment'); });
    if (ret) ret.addEventListener('click', function () { goToOrderAction(key, 'returns'); });
  }

  function selectedReturnCacheKey(order) {
    return keyOf(order || currentOrder() || {});
=======
  function debounce(fn, wait) {
    var timer = null;
    return function () { clearTimeout(timer); timer = setTimeout(fn, wait); };
>>>>>>> parent of 5f06eb5 (a)
  }

  function msg(text, danger) {
    var node = el('mMsg');
    if (!node) return;
    node.textContent = text || '';
    node.className = 'm-delivery-msg ' + (danger ? 'danger' : '');
  }

  function filters() {
    return {
      date: el('mDate') && el('mDate').value,
      q: el('mSearch') && el('mSearch').value,
      statusFilter: el('mStatusFilter') && el('mStatusFilter').value
    };
  }

<<<<<<< HEAD
=======
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

  function shouldUseSelectedOrderKpi() {
    return !!currentOrder() && ['products', 'returns', 'payment'].indexOf(state.tab) >= 0;
  }

>>>>>>> parent of 5f06eb5 (a)
  function renderKpis() {
    var rows = window.DeliveryCore.state.orders || [];
    var s = buildRouteKpi(rows);
    if (el('mKpiTotalOrders')) el('mKpiTotalOrders').textContent = String(s.totalOrders || 0);
    if (el('mKpiPendingOrders')) el('mKpiPendingOrders').textContent = String(s.pendingOrders || 0);
    if (el('mKpiDeliveredOrders')) el('mKpiDeliveredOrders').textContent = String(s.deliveredOrders || 0);
    if (el('mKpiPt')) el('mKpiPt').textContent = money(s.pt);
  }

  function render() {
    renderKpis();
    document.querySelectorAll('[data-m-tab]').forEach(function (button) { button.classList.toggle('active', button.getAttribute('data-m-tab') === state.tab); });
    renderBottomAction();
    var body = el('mBody');
    if (!body) return;
    if (state.tab !== 'orders' && deliveryOrderRenderer) deliveryOrderRenderer.cancel();
    if (state.tab !== 'debt' && deliveryDebtRenderer) deliveryDebtRenderer.cancel();
    if (state.tab === 'products') return renderProducts(body);
    if (state.tab === 'returns') return renderReturns(body);
    if (state.tab === 'payment') return renderPayment(body);
    if (state.tab === 'debt') return renderDebtApp(body);
    return renderOrders(body);
  }

  function renderOrderCard(order) {
    var key = keyOf(order);
    var selected = key === state.selectedKey ? ' selected' : '';
    var delivered = isDelivered(order);
    var dotClass = delivered ? 'delivered' : 'pending';
    var dotTitle = delivered ? 'Đã giao' : 'Chưa giao';
    return '<button type="button" class="m-order-card' + selected + '" data-order-key="' + esc(key) + '">' +
      '<div class="m-order-top"><b>' + esc(order.orderCode) + '</b><span class="m-order-customer"><span class="m-customer-name">' + esc(order.customerName || order.customerCode) + '</span><i class="delivery-status-dot ' + dotClass + '" title="' + esc(dotTitle) + '"></i></span></div>' +
      '<div class="m-order-metrics"><span>PT ' + money(amount(order, 'receivable')) + '</span><span>TM ' + money(amount(order, 'cash')) + '</span><span>CK ' + money(amount(order, 'bank')) + '</span><span>TH ' + money(amount(order, 'returnAmount')) + '</span><span>HT ' + money(amount(order, 'reward')) + '</span><span>CN ' + (amount(order, 'debt') > 0 ? money(amount(order, 'debt')) : 'Đủ') + '</span></div>' +
    '</button>';
  }

  function renderOrders(body) {
    var rows = window.DeliveryCore.state.orders || [];
    if (!rows.length) {
      if (mobileUiRuntime) mobileUiRuntime.renderState(body, { state: 'empty', className: 'm-delivery-body', title: 'Không có đơn giao.' });
      else body.innerHTML = '<div class="m-empty">Không có đơn giao.</div>';
      return;
    }
    if (deliveryOrderRenderer) {
      deliveryOrderRenderer.render(rows, renderOrderCard, { className: 'm-delivery-body' });
    } else {
      body.innerHTML = rows.map(renderOrderCard).join('');
    }
  }

  function currentOrder() { return window.DeliveryCore.state.selectedOrder; }


  function debtMoneyValue(customer) {
    return num(customer && (customer.debtAmount || customer.debt || 0));
  }

  function debtAvailableValue(customer) {
    customer = customer || {};
    var value = customer.availableDebtAmount;
    if (value == null) value = customer.availableDebt;
    if (value == null) value = customer.debtAmount;
    if (value == null) value = customer.debt;
    return num(value || 0);
  }

  function debtPendingValue(customer) {
    customer = customer || {};
    var value = customer.pendingCollectedAmount;
    if (value == null) value = customer.pendingCollected;
    return num(value || 0);
  }

  function debtOrderRows(customer) {
    var orders = Array.isArray(customer && customer.orders) ? customer.orders : [];
    return orders.filter(function (row) {
      var available = row.availableDebt;
      if (available == null) available = row.debt;
      return num(available || 0) > 0;
    });
  }

  function deliveryDebtCustomerKey(customer) {
    customer = customer || {};
    return String(
      customer.customerId ||
      customer.customerCode ||
      customer.code ||
      customer.id ||
      customer._id ||
      customer.customerName ||
      ''
    ).trim();
  }

  function selectedDeliveryDebtCustomer() {
    if (!state.selectedDebtKey) return null;
    return (state.debts || []).find(function (customer) {
      return deliveryDebtCustomerKey(customer) === state.selectedDebtKey;
    }) || null;
  }

  function visibleDeliveryDebtCustomers() {
    var keyword = String(state.debtSearch || '').trim().toLowerCase();
    var rows = (state.debts || []).map(function (customer, originalIndex) {
      return { customer: customer, originalIndex: originalIndex };
    }).filter(function (entry) {
      if (!keyword) return true;
      var customer = entry.customer || {};
      return [customer.customerCode, customer.customerName, customer.phone, customer.customerPhone].some(function (value) {
        return String(value || '').toLowerCase().indexOf(keyword) >= 0;
      });
    });

    rows.sort(function (left, right) {
      if (state.debtSort === 'available_desc') {
        return debtAvailableValue(right.customer) - debtAvailableValue(left.customer);
      }
      if (state.debtSort === 'oldest_asc') {
        return String(left.customer.oldestDebtDate || '9999-12-31').localeCompare(String(right.customer.oldestDebtDate || '9999-12-31'));
      }
      return debtMoneyValue(right.customer) - debtMoneyValue(left.customer);
    });

    return rows;
  }

  function setDeliveryDebtSubtab(nextSubtab, options) {
    options = options || {};
    state.debtSubtab = nextSubtab === 'collect' ? 'collect' : 'customers';
    var customerActive = state.debtSubtab === 'customers';
    var customerTab = el('mDebtCustomersSubtab');
    var collectTab = el('mDebtCollectSubtab');
    var customerPanel = el('mDebtCustomersPanel');
    var collectPanel = el('mDebtCollectPanel');

    if (customerTab) {
      customerTab.classList.toggle('active', customerActive);
      customerTab.setAttribute('aria-selected', String(customerActive));
    }
    if (collectTab) {
      collectTab.classList.toggle('active', !customerActive);
      collectTab.setAttribute('aria-selected', String(!customerActive));
    }
    if (customerPanel) customerPanel.classList.toggle('active', customerActive);
    if (collectPanel) collectPanel.classList.toggle('active', !customerActive);

    if (customerActive && options.restoreScroll !== false) {
      window.requestAnimationFrame(function () {
        window.scrollTo({ top: state.debtListScrollTop || 0, behavior: 'auto' });
      });
    } else if (!customerActive && options.scroll !== false) {
      var body = el('mBody');
      if (body) body.scrollIntoView({ block: 'start', behavior: options.behavior || 'smooth' });
    }
  }

  function openDeliveryDebtCollection(index) {
    var customer = (state.debts || [])[index];
    if (!customer || debtAvailableValue(customer) <= 0) return;
    var nextKey = deliveryDebtCustomerKey(customer);

    if (state.selectedDebtKey === nextKey) {
      setDeliveryDebtSubtab('collect');
      return;
    }

    if (
      state.debtFormDirty &&
      state.selectedDebtKey &&
      state.selectedDebtKey !== nextKey &&
      !window.confirm('Bạn đang có phiếu thu chưa gửi. Dữ liệu hiện tại sẽ bị xóa khi chuyển khách hàng.')
    ) {
      return;
    }

    state.debtListScrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    state.selectedDebtIndex = index;
    state.selectedDebtKey = nextKey;
    state.debtFormDirty = false;
    state.debtSubtab = 'collect';
    render();
    var body = el('mBody');
    if (body) body.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  async function loadDeliveryDebts(force) {
    if (state.debtLoading) return;
    if (state.debtLoaded && !force) {
      render();
      return;
    }

    state.debtLoading = true;
    msg('Đang tải công nợ...');

    try {
      var previousKey = state.selectedDebtKey;
      var json = await window.DeliveryCore.api(
        '/api/mobile/debts?collectorType=delivery&includePendingCollections=1&includePaid=0&limit=100'
      );

      state.debts = Array.isArray(json.items) ? json.items : [];
      state.debtSummary = json.summary || {};
      state.debtLoaded = true;
      state.selectedDebtIndex = previousKey
        ? state.debts.findIndex(function (customer) { return deliveryDebtCustomerKey(customer) === previousKey; })
        : -1;

      if (state.selectedDebtIndex < 0) {
        state.selectedDebtIndex = -1;
        state.selectedDebtKey = '';
        state.debtFormDirty = false;
      }

      msg('');
    } catch (err) {
      state.debtLoaded = false;
      msg(err.message || 'Không tải được công nợ giao hàng', true);
    } finally {
      state.debtLoading = false;
      render();
    }
  }

  function renderDebtApp(body) {
    var rows = state.debts || [];
    var summary = state.debtSummary || {};

    if (state.debtLoading && !rows.length) {
      if (mobileUiRuntime) mobileUiRuntime.renderState(body, { state: 'loading', className: 'm-delivery-body', title: 'Đang tải công nợ...' });
      else body.innerHTML = '<div class="m-empty">Đang tải công nợ...</div>';
      return;
    }

    var selected = selectedDeliveryDebtCustomer();
    var customerTabActive = state.debtSubtab !== 'collect';

    body.innerHTML =
      '<section class="m-debt-summary">' +
        '<div><span>Tổng nợ</span><b>' + money(summary.totalDebt || 0) + '</b></div>' +
        '<div><span>Chờ KT</span><b>' + money(summary.pendingCollected || summary.pendingCollectedAmount || 0) + '</b></div>' +
        '<div><span>Có thể thu</span><b>' + money(summary.availableDebt || summary.availableDebtAmount || 0) + '</b></div>' +
        '<div><span>Khách nợ</span><b>' + esc(summary.customerCount || rows.length) + '</b></div>' +
      '</section>' +
      '<div class="m-action-row m-debt-reload-row">' +
        '<button id="mReloadDebt" type="button">Tải lại công nợ</button>' +
      '</div>' +
      '<div class="debt-subtabs m-debt-subtabs" role="tablist" aria-label="Nghiệp vụ công nợ">' +
        '<button id="mDebtCustomersSubtab" type="button" class="debt-subtab' + (customerTabActive ? ' active' : '') + '" role="tab" aria-selected="' + customerTabActive + '">Khách nợ</button>' +
        '<button id="mDebtCollectSubtab" type="button" class="debt-subtab' + (!customerTabActive ? ' active' : '') + '" role="tab" aria-selected="' + (!customerTabActive) + '">Thu nợ</button>' +
      '</div>' +
      '<section id="mDebtCustomersPanel" class="debt-subpanel' + (customerTabActive ? ' active' : '') + '">' +
        '<div class="debt-list-toolbar">' +
          '<input id="mDebtCustomerSearch" type="search" value="' + esc(state.debtSearch) + '" placeholder="Tìm mã / tên / SĐT khách hàng" aria-label="Tìm khách hàng đang nợ">' +
          '<select id="mDebtCustomerSort" aria-label="Sắp xếp danh sách công nợ">' +
            '<option value="debt_desc"' + (state.debtSort === 'debt_desc' ? ' selected' : '') + '>Nợ cao nhất</option>' +
            '<option value="available_desc"' + (state.debtSort === 'available_desc' ? ' selected' : '') + '>Có thể thu cao nhất</option>' +
            '<option value="oldest_asc"' + (state.debtSort === 'oldest_asc' ? ' selected' : '') + '>Nợ cũ nhất</option>' +
          '</select>' +
        '</div>' +
        '<div id="mDebtCustomerList" class="m-debt-list"></div>' +
      '</section>' +
      '<section id="mDebtCollectPanel" class="debt-subpanel' + (!customerTabActive ? ' active' : '') + '">' +
        '<div id="mDebtDetailContainer" class="m-debt-detail">' + renderDebtCustomerDetail(selected) + '</div>' +
      '</section>';

    var reload = el('mReloadDebt');
    if (reload) reload.addEventListener('click', function () {
      if (state.debtFormDirty && !window.confirm('Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.')) return;
      state.debtFormDirty = false;
      state.debtLoaded = false;
      loadDeliveryDebts(true);
    });

    var customerTab = el('mDebtCustomersSubtab');
    if (customerTab) customerTab.addEventListener('click', function () {
      setDeliveryDebtSubtab('customers');
    });

    var collectTab = el('mDebtCollectSubtab');
    if (collectTab) collectTab.addEventListener('click', function () {
      setDeliveryDebtSubtab('collect');
    });

    var chooseCustomer = el('mChooseDebtCustomer');
    if (chooseCustomer) chooseCustomer.addEventListener('click', function () {
      setDeliveryDebtSubtab('customers');
    });

    var search = el('mDebtCustomerSearch');
    if (search) search.addEventListener('input', debounce(function () {
      state.debtSearch = search.value || '';
      renderDeliveryDebtCustomerList();
    }, 120));

    var sort = el('mDebtCustomerSort');
    if (sort) sort.addEventListener('change', function () {
      state.debtSort = sort.value || 'debt_desc';
      renderDeliveryDebtCustomerList();
    });

    renderDeliveryDebtCustomerList();

    var form = el('mDeliveryDebtCollectionForm');
    if (form && selected) {
      form.addEventListener('input', function () { state.debtFormDirty = true; });
      form.addEventListener('change', function () { state.debtFormDirty = true; });
      form.addEventListener('submit', function (event) {
        submitDeliveryDebtCollectionFromDebtTab(event, selected);
      });
    }

    body.querySelectorAll('.m-debt-order-check').forEach(function (input) {
      input.addEventListener('change', function () {
        updateDeliveryDebtAmount(selected);
        state.debtFormDirty = true;
      });
    });
  }

  function renderDeliveryDebtCustomerList() {
    var list = el('mDebtCustomerList');
    if (!list) return;
    var entries = visibleDeliveryDebtCustomers();
    if (!(state.debts || []).length) {
      if (mobileUiRuntime) mobileUiRuntime.renderState(list, { state: 'empty', className: 'm-debt-customer-list', title: 'Không có khách hàng còn nợ.' });
      else list.innerHTML = '<div class="m-empty">Không có khách hàng còn nợ.</div>';
      return;
    }
    if (!entries.length) {
      if (mobileUiRuntime) mobileUiRuntime.renderState(list, { state: 'empty', className: 'm-debt-customer-list', title: 'Không tìm thấy khách hàng phù hợp.' });
      else list.innerHTML = '<div class="m-empty">Không tìm thấy khách hàng phù hợp.</div>';
      return;
    }
    if (mobileUiRuntime) {
      if (deliveryDebtRendererContainer !== list) {
        if (deliveryDebtRenderer) deliveryDebtRenderer.cancel();
        deliveryDebtRendererContainer = list;
        deliveryDebtRenderer = mobileUiRuntime.createChunkedHtmlRenderer(list, { initialCount: 60, chunkSize: 80 });
      }
      deliveryDebtRenderer.render(entries, renderDebtCustomerCard, { className: 'm-debt-customer-list' });
    } else {
      list.innerHTML = entries.map(renderDebtCustomerCard).join('');
    }
  }

  function renderDebtCustomerCard(entry) {
    var customer = entry.customer;
    var index = entry.originalIndex;
    var selected = deliveryDebtCustomerKey(customer) === state.selectedDebtKey ? ' selected' : '';
    var available = debtAvailableValue(customer);
    var disabled = available <= 0;

    return '<article class="m-order-card m-debt-customer-card' + selected + '">' +
      '<div class="m-order-top">' +
        '<b>' + esc(customer.customerCode || '') + ' - ' + esc(customer.customerName || '') + '</b>' +
      '</div>' +
      '<div class="m-order-metrics">' +
        '<span>Nợ ' + money(debtMoneyValue(customer)) + '</span>' +
        '<span>Chờ KT ' + money(debtPendingValue(customer)) + '</span>' +
        '<span>Có thể thu ' + money(available) + '</span>' +
        '<span>' + esc(customer.orderCount || 0) + ' đơn</span>' +
      '</div>' +
      '<button type="button" class="m-debt-collect-action' + (disabled ? ' disabled' : '') + '" data-debt-index="' + index + '"' + (disabled ? ' disabled aria-disabled="true"' : '') + '>' +
        (disabled ? 'Đang chờ KT' : 'Thu nợ') +
      '</button>' +
    '</article>';
  }

  function renderDebtCustomers(entries) {
    if (!(state.debts || []).length) return '<div class="m-empty">Không có khách hàng còn nợ.</div>';
    if (!entries.length) return '<div class="m-empty">Không tìm thấy khách hàng phù hợp.</div>';
    return entries.map(renderDebtCustomerCard).join('');
  }

  function renderDebtCustomerDetail(customer) {
    if (!customer) {
      return '<div class="m-empty debt-empty-state">' +
        '<b>Chưa chọn khách hàng để thu nợ</b>' +
        '<span>Chọn một khách hàng trong tab Khách nợ để mở biểu mẫu.</span>' +
        '<button id="mChooseDebtCustomer" type="button" class="m-debt-empty-action">Chọn khách hàng</button>' +
      '</div>';
    }

    var orders = debtOrderRows(customer);

    if (!orders.length) {
      return '<div class="m-selected-order"><b>' + esc(customer.customerCode || '') + ' - ' + esc(customer.customerName || '') + '</b></div>' +
        '<div class="m-empty">Khách hàng này không còn số tiền có thể thu hoặc đang chờ kế toán xác nhận.</div>';
    }

    var rowsHtml = orders.map(function (order, index) {
      var available = order.availableDebt;
      if (available == null) available = order.debt;
      available = num(available || 0);

      return '<label class="m-debt-order-row">' +
        '<input type="checkbox" class="m-debt-order-check" data-index="' + index + '" checked>' +
        '<div>' +
          '<b>' + esc(order.salesOrderCode || order.orderCode || '') + '</b>' +
          '<small>Ngày: ' + esc(order.orderDate || order.documentDate || '') + '</small>' +
          '<em>Nợ: ' + money(order.debt || 0) +
            ' · Chờ KT: ' + money(order.pendingCollectedAmount || 0) +
            ' · Có thể thu: ' + money(available) +
          '</em>' +
        '</div>' +
      '</label>';
    }).join('');

    return '<div class="m-selected-order">' +
        '<b>' + esc(customer.customerCode || '') + ' - ' + esc(customer.customerName || '') + '</b>' +
        '<span>Nợ: ' + money(debtMoneyValue(customer)) +
          ' · Chờ KT: ' + money(debtPendingValue(customer)) +
          ' · Có thể thu: ' + money(debtAvailableValue(customer)) +
        '</span>' +
      '</div>' +
      '<form id="mDeliveryDebtCollectionForm" class="m-payment-form">' +
        '<h3>Gửi phiếu thu nợ chờ kế toán</h3>' +
        '<p class="m-help-text">Công nợ chỉ giảm sau khi kế toán xác nhận trên web.</p>' +
        '<div class="m-return-scroll debt-order-selection-list">' + rowsHtml + '</div>' +
        '<label>Số tiền đã thu<input id="mDeliveryDebtAmount" name="amount" type="number" min="0" value="' + esc(debtAvailableValue(customer)) + '"></label>' +
        '<label>Hình thức<select name="paymentMethod"><option value="cash">Tiền mặt</option><option value="bank_transfer">Chuyển khoản</option><option value="other">Khác</option></select></label>' +
        '<label>Ghi chú<input name="note" placeholder="VD: Khách trả một phần"></label>' +
        '<div class="debt-submit-bar"><button type="submit">Gửi phiếu thu chờ KT</button></div>' +
      '</form>';
  }

  function updateDeliveryDebtAmount(customer) {
    var orders = debtOrderRows(customer);
    var total = 0;

    document.querySelectorAll('.m-debt-order-check:checked').forEach(function (input) {
      var index = Number(input.getAttribute('data-index'));
      var order = orders[index];
      if (!order) return;
      var available = order.availableDebt;
      if (available == null) available = order.debt;
      total += num(available || 0);
    });

    var amountInput = el('mDeliveryDebtAmount');
    if (amountInput) amountInput.value = Math.max(0, Math.round(total));
  }

  async function submitDeliveryDebtCollectionFromDebtTab(event, customer) {
    if (event && event.preventDefault) event.preventDefault();

    var formElement = event.target;
    var form = new FormData(formElement);
    var amountValue = num(form.get('amount'));

    if (amountValue <= 0) {
      msg('Số tiền thu phải lớn hơn 0', true);
      return;
    }

    var orders = debtOrderRows(customer);
    var allocations = [];

    document.querySelectorAll('.m-debt-order-check:checked').forEach(function (input) {
      var index = Number(input.getAttribute('data-index'));
      var order = orders[index];
      if (!order) return;

      var available = order.availableDebt;
      if (available == null) available = order.debt;
      available = num(available || 0);
      if (available <= 0) return;

      allocations.push({
        salesOrderId: order.salesOrderId || order.orderId || '',
        salesOrderCode: order.salesOrderCode || order.orderCode || '',
        allocatedAmount: available
      });
    });

    if (!allocations.length) {
      msg('Cần chọn ít nhất một đơn nợ', true);
      return;
    }

    var totalSelected = allocations.reduce(function (sum, row) {
      return sum + num(row.allocatedAmount);
    }, 0);

    if (amountValue > totalSelected) {
      msg('Số tiền thu vượt tổng công nợ đã chọn', true);
      return;
    }

    var remain = amountValue;
    allocations = allocations.map(function (row) {
      var allocated = Math.min(num(row.allocatedAmount), remain);
      remain -= allocated;
      return Object.assign({}, row, { allocatedAmount: allocated });
    }).filter(function (row) {
      return num(row.allocatedAmount) > 0;
    });

    var submitButton = formElement.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Đang gửi...';
    }

    try {
      msg('Đang gửi phiếu thu nợ chờ kế toán...');

      await window.DeliveryCore.api('/api/mobile/debt-collections', {
        method: 'POST',
        body: JSON.stringify({
          collectorType: 'delivery',
          customerId: customer.customerId || '',
          customerCode: customer.customerCode || '',
          customerName: customer.customerName || '',
          amount: amountValue,
          paymentMethod: form.get('paymentMethod') || 'cash',
          note: form.get('note') || '',
          allocations: allocations,
          idempotencyKey: 'delivery-debt-' + (customer.customerCode || Date.now()) + '-' + Date.now()
        })
      });

      state.debtFormDirty = false;
      state.selectedDebtIndex = -1;
      state.selectedDebtKey = '';
      state.debtSubtab = 'customers';
      state.debtLoaded = false;
      await loadDeliveryDebts(true);
      msg('Đã ghi nhận thu nợ, chờ kế toán xác nhận');
      window.requestAnimationFrame(function () {
        window.scrollTo({ top: state.debtListScrollTop || 0, behavior: 'auto' });
      });
    } catch (err) {
      msg(err.message || 'Không gửi được phiếu thu nợ', true);
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Gửi phiếu thu chờ KT';
      }
    }
  }

  function renderProducts(body) {
    var order = currentOrder();
    if (!order) { body.innerHTML = '<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'; return; }
    var items = Array.isArray(order.items) ? order.items : [];
    body.innerHTML = '<div class="m-selected-order"><b>' + esc(order.orderCode) + '</b><span>' + esc(order.customerName) + '</span></div>' +
      '<form id="mReturnForm"><div class="m-return-scroll">' +
      items.map(function (it, idx) {
        var code = it.productCode || it.code || it.productId || '';
        var name = it.productName || it.name || '';
        // DELIVERY_LOCKED_PRICE_READ_START
        // App giao hàng ưu tiên unitPrice đã khóa từ backend, không tự tính lại khuyến mại.
        var price = num(it.unitPrice || it.price || it.salePrice || it.finalPrice);
        // DELIVERY_LOCKED_PRICE_READ_END
        var qty = num(it.quantity || it.deliveredQty || it.qty || it.orderQty || it.soldQty);
        var rqty = num(it.returnQty || it.qtyReturn || it.returnQuantity || it.returnedQty);
        return '<div class="m-product-row"><div><b>' + esc(code) + '</b><small>' + esc(name) + '</small><em>SL giao ' + money(qty) + ' · Giá cố định ' + money(price) + '</em>' + hidden(idx, 'productCode', code) + hidden(idx, 'productName', name) + hidden(idx, 'price', price) + '</div><input data-m-return-field="returnQty" data-idx="' + idx + '" type="number" min="0" step="1" value="' + esc(rqty) + '"></div>';
      }).join('') + '</div><div class="m-action-row"><button type="submit">Lưu hàng trả</button><button id="mClearReturn" type="button" class="secondary">Bỏ qua hàng trả</button></div></form>';
    el('mReturnForm').addEventListener('submit', saveReturn);
    el('mClearReturn').addEventListener('click', function () { saveReturn({ preventDefault: function () {}, forceZero: true }); });
  }

  function hidden(idx, field, value) { return '<input type="hidden" data-m-return-field="' + esc(field) + '" data-idx="' + idx + '" value="' + esc(value) + '">'; }

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

  function renderReturns(body) {
    var order = currentOrder();
    if (!order) { body.innerHTML = '<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'; return; }
    var rows = returnsForOrder(order);
    // Safety fallback: /api/delivery/orders already overlays returnItems from returnOrders.
    // If the direct return list is late or mismatched by legacy key, still show the selected order's official returnItems.
    if (!rows.length && Array.isArray(order.returnItems) && order.returnItems.length) {
      rows = order.returnItems.map(function (item) {
        return Object.assign({}, item, {
          salesOrderId: order.salesOrderId,
          salesOrderCode: order.salesOrderCode,
          orderId: order.orderId,
          orderCode: order.orderCode,
          customerCode: order.customerCode,
          customerName: order.customerName
        });
      });
    }
    if (!rows.length && amount(order, 'returnAmount') > 0) {
      body.innerHTML = '<div class="m-selected-order"><b>' + esc(order.orderCode) + '</b><span>' + esc(order.customerName) + '</span></div><div class="m-empty">Đơn có tiền hàng trả ' + money(amount(order, 'returnAmount')) + ' nhưng app chưa lấy được dòng sản phẩm. Bấm Tải lại hàng trả để gọi trực tiếp returnOrders.</div><div class="m-action-row"><button id="mReloadReturns" type="button">Tải lại hàng trả</button></div>';
      el('mReloadReturns').addEventListener('click', loadSelectedReturnsDirect);
      return;
    }
    if (!rows.length) {
<<<<<<< HEAD
      body.innerHTML = selectedOrderSummary(order) + '<div class="m-empty">Chưa có hàng trả trong returnOrders. Nhập SL trả ở mục Sản phẩm đơn rồi bấm Lưu hàng trả hoặc bấm Bỏ qua hàng trả để sang Thu tiền.</div><div class="m-action-row"><button id="mGoProducts" type="button">Mở sản phẩm đơn</button><button id="mSkipReturns" type="button" class="secondary">Bỏ qua hàng trả</button></div>';
      el('mGoProducts').addEventListener('click', function () { switchTab('products'); });
=======
      body.innerHTML = '<div class="m-selected-order"><b>' + esc(order.orderCode) + '</b><span>' + esc(order.customerName) + '</span></div><div class="m-empty">Chưa có hàng trả trong returnOrders. Nhập SL trả ở tab Sản phẩm giao rồi bấm Lưu hàng trả hoặc bấm Bỏ qua hàng trả để sang Thu tiền.</div><div class="m-action-row"><button id="mGoProducts" type="button">Quay lại sản phẩm</button><button id="mSkipReturns" type="button" class="secondary">Bỏ qua hàng trả</button></div>';
      el('mGoProducts').addEventListener('click', function () { state.tab = 'products'; render(); });
>>>>>>> parent of 5f06eb5 (a)
      el('mSkipReturns').addEventListener('click', function () { state.tab = 'payment'; render(); });
      return;
    }
    body.innerHTML = '<div class="m-selected-order"><b>' + esc(order.orderCode) + '</b><span>' + esc(order.customerName) + '</span></div>' +
      '<form id="mReturnSaveForm"><div class="m-return-scroll">' +
      rows.map(function (it, idx) {
        var amount = num(it.returnQty) * num(it.price);
        return '<div class="m-product-row"><div><b>' + esc(it.productCode) + '</b><small>' + esc(it.productName) + '</small><em>Giá cố định ' + money(it.price) + ' · Thành tiền ' + money(amount) + '</em>' + hidden(idx, 'productCode', it.productCode) + hidden(idx, 'productName', it.productName) + hidden(idx, 'price', it.price) + '</div><input data-m-return-field="returnQty" data-idx="' + idx + '" type="number" min="0" step="1" value="' + esc(it.returnQty) + '"></div>';
      }).join('') + '</div><div class="m-action-row"><button type="submit">Cập nhật hàng trả</button><button id="mBackProducts" type="button" class="secondary">Sửa từ sản phẩm đơn</button></div></form>';
    el('mReturnSaveForm').addEventListener('submit', saveReturn);
    el('mBackProducts').addEventListener('click', function () { switchTab('products'); });
  }

  function renderPayment(body) {
    var order = currentOrder();
    if (!order) { body.innerHTML = '<div class="m-empty">Chọn đơn ở tab Đơn giao trước.</div>'; return; }
    body.innerHTML = '<div class="m-selected-order"><b>' + esc(order.orderCode) + '</b><span>' + esc(order.customerName) + '</span></div>' +
      '<form id="mPaymentForm" class="m-payment-form"><h3>Thu tiền đơn giao</h3><label>Tiền mặt<input name="cash" type="number" min="0" value="' + esc(amount(order, 'cash')) + '"></label><label>Chuyển khoản<input name="bank" type="number" min="0" value="' + esc(amount(order, 'bank')) + '"></label><label>Trả thưởng<input name="reward" type="number" min="0" value="' + esc(amount(order, 'reward')) + '"></label><button type="submit">Lưu thu tiền</button></form>';
    el('mPaymentForm').addEventListener('submit', savePayment);
  }

  function collectReturnItems(forceZero) {
    var byIdx = {};
    document.querySelectorAll('[data-m-return-field]').forEach(function (input) {
      var idx = input.getAttribute('data-idx');
      var field = input.getAttribute('data-m-return-field');
      byIdx[idx] = byIdx[idx] || {};
      byIdx[idx][field] = (forceZero && field === 'returnQty') ? 0 : input.value;
    });
    return Object.keys(byIdx).map(function (idx) { return byIdx[idx]; });
  }

  async function saveReturn(event) {
    if (event && event.preventDefault) event.preventDefault();
    try {
      msg('Đang lưu hàng trả...');
      await window.DeliveryCore.saveReturn(currentOrder(), collectReturnItems(event && event.forceZero));
      msg('Đã lưu hàng trả vào returnOrders');
      state.selectedKey = keyOf(window.DeliveryCore.state.selectedOrder);
      state.tab = 'payment';
      render();
    } catch (err) { msg(err.message, true); }
  }


  async function savePayment(event) {
    if (event && event.preventDefault) event.preventDefault();
    var form = new FormData(event.target);
    try {
      msg('Đang lưu thu tiền...');
      await window.DeliveryCore.savePayment(currentOrder(), { cash: form.get('cash'), bank: form.get('bank'), reward: form.get('reward') });
      await window.DeliveryCore.confirmDelivery(currentOrder(), { deliveryStatus: 'delivered' });
      msg('Đã lưu thu tiền và xác nhận giao');
      state.selectedKey = keyOf(window.DeliveryCore.state.selectedOrder);
      state.tab = 'orders';
      render();
    } catch (err) { msg(err.message, true); }
  }

  async function confirmDelivery() {
    try {
      msg('Đang xác nhận giao...');
      await window.DeliveryCore.confirmDelivery(currentOrder(), { deliveryStatus: 'delivered' });
      msg('Đã xác nhận giao');
      state.selectedKey = keyOf(window.DeliveryCore.state.selectedOrder);
      state.tab = 'orders';
      render();
    } catch (err) { msg(err.message, true); }
  }

  async function loadSelectedReturnsDirect() {
    var order = currentOrder();
    if (!order || !window.DeliveryCore || !window.DeliveryCore.loadReturnsForOrder) return;
    try {
      msg('Đang tải hàng trả trực tiếp từ returnOrders...');
      await window.DeliveryCore.loadReturnsForOrder(order);
      msg('');
      render();
    } catch (err) {
      msg('Không tải trực tiếp được hàng trả: ' + err.message, true);
    }
  }

  function select(key) {
    state.selectedKey = key;
    window.DeliveryCore.selectOrder(key);
    render();
    loadSelectedReturnsDirect();
  }

  async function load() {
    if (!requireDeliveryLogin()) return;
    if (
      state.tab === 'debt' &&
      state.debtFormDirty &&
      !window.confirm('Bạn đang có phiếu thu chưa gửi. Tải lại sẽ xóa dữ liệu đang nhập.')
    ) {
      return;
    }
    if (state.tab === 'debt') state.debtFormDirty = false;
    if (!el('mBody')) renderShell();
    var requestToken = deliveryLoadGate ? deliveryLoadGate.begin() : null;
    if (mobileUiRuntime) mobileUiRuntime.renderState(el('mBody'), { state: 'loading', className: 'm-delivery-body', title: 'Đang tải dữ liệu giao hàng...' });
    else el('mBody').innerHTML = '<div class="m-empty">Đang tải...</div>';
    try {
      await window.DeliveryCore.loadOrders(filters());
      if (deliveryLoadGate && !deliveryLoadGate.isCurrent(requestToken)) return;
      await window.DeliveryCore.loadReturns(filters());
      if (deliveryLoadGate && !deliveryLoadGate.isCurrent(requestToken)) return;
      if (!state.selectedKey && window.DeliveryCore.state.orders[0]) state.selectedKey = keyOf(window.DeliveryCore.state.orders[0]);
      if (state.selectedKey) window.DeliveryCore.selectOrder(state.selectedKey);
      if (state.tab === 'returns') {
        await loadSelectedReturnsDirect();
      } else if (state.tab === 'debt') {
        state.debtLoaded = false;
        await loadDeliveryDebts(true);
      } else {
        render();
        msg('');
      }
    } catch (err) {
      if (deliveryLoadGate && !deliveryLoadGate.isCurrent(requestToken)) return;
      if (mobileUiRuntime) mobileUiRuntime.renderState(el('mBody'), { state: 'error', className: 'm-delivery-body', title: 'Không tải được dữ liệu giao hàng', detail: err.message || 'Vui lòng thử lại.' });
      else el('mBody').innerHTML = '<div class="m-empty danger">' + esc(err.message) + '</div>';
      msg(err.message, true);
    }
  }

  window.DeliveryMobileView = { load: load, select: select, renderShell: renderShell };
  window.loadDeliveryOrders = function () { return load(); };
  document.addEventListener('DOMContentLoaded', load);
}());
