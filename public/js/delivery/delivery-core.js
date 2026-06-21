(function () {
  'use strict';

  function toNumber(value) {
    var n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function money(value) {
    try { return Math.round(toNumber(value)).toLocaleString('vi-VN'); }
    catch (err) { return String(Math.round(toNumber(value))); }
  }

  var DEBT_ZERO_TOLERANCE = 1000;

  function normalizeDebtAmount(value) {
    var n = Math.round(toNumber(value));
    return Math.abs(n) <= DEBT_ZERO_TOLERANCE ? 0 : n;
  }

  async function readJson(res, fallbackMessage) {
    var contentType = String(res.headers && res.headers.get ? res.headers.get('content-type') || '' : '');
    var raw = await res.text();
    var json = {};
    if (contentType.indexOf('application/json') >= 0) {
      try { json = JSON.parse(raw || '{}'); }
      catch (err) {
        var parseErr = new Error('API trả JSON lỗi: ' + err.message);
        parseErr.status = res.status;
        parseErr.response = res;
        throw parseErr;
      }
    } else {
      var typeErr = new Error((fallbackMessage || 'API không trả JSON') + ' (HTTP ' + res.status + ')');
      typeErr.status = res.status;
      typeErr.response = res;
      typeErr.body = raw;
      throw typeErr;
    }
    if (!res.ok || json.ok === false || json.success === false) {
      var apiErr = new Error(json.message || fallbackMessage || 'API lỗi');
      apiErr.status = res.status;
      apiErr.response = res;
      apiErr.data = json;
      throw apiErr;
    }
    return json;
  }

  function orderKey(order) {
    return text(order && (order.orderId || order.salesOrderId || order.id || order._id || order.orderCode || order.salesOrderCode || order.code));
  }

  // DELIVERY_CLIENT_DEDUP_ORDERS_START
  function canonicalBusinessOrderKey(order) {
    order = order || {};
    var code = text(order.salesOrderCode || order.orderCode || order.code || order.displayOrderCode).replace(/^RO[-_]?/i, '');
    if (code) return 'code:' + code.toLowerCase().replace(/[^a-z0-9]/g, '');
    var id = text(order.salesOrderId || order.orderId || order.id || order._id);
    return id ? 'id:' + id : '';
  }

  function orderCandidateScore(order) {
    order = order || {};
    var status = text(order.deliveryStatus || (order.status && order.status.deliveryStatus) || order.status).toLowerCase();
    var statusScore = ['delivered', 'completed', 'done'].indexOf(status) >= 0 ? 80 : 0;
    var itemScore = Array.isArray(order.items) ? Math.min(order.items.length, 50) : 0;
    var updated = Date.parse(order.updatedAt || order.modifiedAt || order.createdAt || '') || 0;
    return statusScore + (order.accountingConfirmed ? 20 : 0) + itemScore + updated / 100000000000000;
  }

  function dedupeOrders(rows) {
    var map = new Map();
    var passthrough = [];
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row) return;
      var key = canonicalBusinessOrderKey(row);
      if (!key) {
        passthrough.push(row);
        return;
      }
      var prev = map.get(key);
      if (!prev || orderCandidateScore(row) >= orderCandidateScore(prev)) map.set(key, row);
    });
    return passthrough.concat(Array.from(map.values()));
  }
  // DELIVERY_CLIENT_DEDUP_ORDERS_END

  function normalizeOrder(order) {
    order = order || {};
    var amounts = order.amounts || {};
    var items = Array.isArray(order.items) ? order.items : [];
    return Object.assign({}, order, {
      orderId: text(order.orderId || order.salesOrderId || order.id || order._id),
      orderCode: text(order.orderCode || order.salesOrderCode || order.code || order.displayOrderCode || order.id),
      salesOrderId: text(order.salesOrderId || order.orderId || order.id || order._id),
      salesOrderCode: text(order.salesOrderCode || order.orderCode || order.code || order.displayOrderCode),
      customerCode: text(order.customerCode),
      customerName: text(order.customerName),
      items: items,
      amounts: {
        receivable: toNumber(amounts.receivable || amounts.totalReceivable || order.totalAmount || order.debtBeforeCollection),
        cash: toNumber(amounts.cash || amounts.cashAmount || order.cashCollected || order.cashAmount),
        bank: toNumber(amounts.bank || amounts.bankAmount || order.bankCollected || order.bankAmount || order.transferAmount),
        reward: toNumber(amounts.reward || amounts.rewardAmount || order.rewardAmount || order.bonusAmount),
        returnAmount: toNumber(amounts.returnAmount || order.returnAmount || order.returnedAmount),
        processed: toNumber(amounts.processed || order.processedAmount || order.collectedAmount),
        debt: normalizeDebtAmount(amounts.debt || amounts.debtAmount || order.debtAmount || order.debt)
      },
      status: order.status && typeof order.status === 'object' ? order.status : {
        deliveryStatus: text(order.deliveryStatus || order.status || 'pending'),
        paymentStatus: text(order.paymentStatus || ''),
        returnStatus: text(order.returnStatus || ''),
        accountingStatus: text(order.accountingStatus || '')
      }
    });
  }

  function normalizeItem(item) {
    item = item || {};
    var productCode = text(item.productCode || item.code || item.productId || item.sku || item.id);
    var returnQty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? 0);
    var price = toNumber(item.price ?? item.salePrice ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
    var quantity = toNumber(item.quantity ?? item.deliveredQty ?? item.qty ?? item.orderQty ?? item.soldQty ?? item.totalQty ?? 0);
    return Object.assign({}, item, {
      productId: text(item.productId || productCode),
      productCode: productCode,
      code: productCode,
      productName: text(item.productName || item.name || item.product),
      name: text(item.productName || item.name || item.product),
      quantity: quantity,
      deliveredQty: toNumber(item.deliveredQty ?? quantity),
      orderQty: toNumber(item.orderQty ?? quantity),
      lineAmount: toNumber(item.lineAmount ?? item.totalAmount ?? quantity * price),
      returnQty: returnQty,
      qtyReturn: returnQty,
      returnQuantity: returnQty,
      returnedQty: returnQty,
      price: price,
      salePrice: price,
      unitPrice: price,
      returnAmount: Math.round(returnQty * price),
      amount: Math.round(returnQty * price)
    });
  }


  function normalizeReturnRow(row) {
    row = row || {};
    return Object.assign({}, row, {
      returnOrderId: text(row.returnOrderId || row.id || row._id),
      returnOrderCode: text(row.returnOrderCode || row.code || row.id),
      salesOrderId: text(row.salesOrderId || row.orderId),
      salesOrderCode: text(row.salesOrderCode || row.orderCode),
      customerCode: text(row.customerCode),
      customerName: text(row.customerName),
      productCode: text(row.productCode || row.code || row.productId),
      productName: text(row.productName || row.name),
      returnQty: toNumber(row.returnQty || row.qtyReturn || row.quantity),
      price: toNumber(row.price || row.salePrice || row.unitPrice),
      amount: toNumber(row.amount || row.returnAmount)
    });
  }


  function rowsFromReturnOrder(returnOrder, fallbackOrder) {
    returnOrder = returnOrder || {};
    fallbackOrder = normalizeOrder(fallbackOrder || {});
    var base = {
      returnOrderId: text(returnOrder.returnOrderId || returnOrder.id || returnOrder._id),
      returnOrderCode: text(returnOrder.returnOrderCode || returnOrder.code || returnOrder.id),
      salesOrderId: text(returnOrder.salesOrderId || returnOrder.orderId || fallbackOrder.salesOrderId || fallbackOrder.orderId),
      salesOrderCode: text(returnOrder.salesOrderCode || returnOrder.orderCode || fallbackOrder.salesOrderCode || fallbackOrder.orderCode),
      orderId: text(returnOrder.orderId || returnOrder.salesOrderId || fallbackOrder.orderId || fallbackOrder.salesOrderId),
      orderCode: text(returnOrder.orderCode || returnOrder.salesOrderCode || fallbackOrder.orderCode || fallbackOrder.salesOrderCode),
      customerCode: text(returnOrder.customerCode || fallbackOrder.customerCode),
      customerName: text(returnOrder.customerName || fallbackOrder.customerName),
      deliveryDate: text(returnOrder.deliveryDate || returnOrder.date || fallbackOrder.deliveryDate),
      status: text(returnOrder.status || returnOrder.returnStatus || 'active')
    };
    var items = Array.isArray(returnOrder.items) ? returnOrder.items : [];
    return items.map(function (item) {
      var normalized = normalizeItem(item);
      return Object.assign({}, base, {
        productCode: normalized.productCode,
        productName: normalized.productName,
        returnQty: normalized.returnQty,
        price: normalized.price,
        amount: normalized.returnAmount || normalized.amount
      });
    }).filter(function (row) { return row.productCode && toNumber(row.returnQty) > 0; });
  }

  function extractReturnRows(json, fallbackOrder) {
    json = json || {};
    var rows = json.returns || json.returnOrders || json.rows || [];
    if (Array.isArray(rows) && rows.length) return rows;
    if (json.returnOrder) return rowsFromReturnOrder(json.returnOrder, fallbackOrder);
    return [];
  }

  function sessionToken() { return ''; }

  function sessionRefreshToken() { return ''; }

  function saveSession(data) {
    data = data || {};
    localStorage.removeItem('mk_web_token');
    localStorage.removeItem('v43_mobile_token');
    // Refresh token nằm trong cookie HttpOnly; luôn xóa bản legacy có thể còn lại.
    localStorage.removeItem('mk_web_refresh_token');
    localStorage.removeItem('v43_mobile_refresh_token');
    if (data.user) {
      var userJson = JSON.stringify(data.user || {});
      localStorage.setItem('mk_web_user', userJson);
      localStorage.setItem('v43_mobile_user', userJson);
    }
  }

  function clearSessionAndRedirect() {
    [
      'mk_web_token',
      'mk_web_refresh_token',
      'mk_web_user',
      'v43_mobile_token',
      'v43_mobile_refresh_token',
      'v43_mobile_user'
    ].forEach(function (key) { localStorage.removeItem(key); });
    if (window.location && window.location.pathname !== '/login.html') {
      window.location.href = '/login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search);
    }
  }

  async function refreshSession() {
    var legacyRefreshToken = sessionRefreshToken();
    try {
      var res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      });
      var json = await readJson(res, 'Không làm mới được phiên đăng nhập');
      if (!json || !json.token) return false;
      saveSession(json);
      return true;
    } catch (err) {
      return false;
    }
  }


  var DeliveryCore = {
    state: {
      orders: [],
      returns: [],
      returnsLoaded: false,
      returnsLoadedByOrder: {},
      selectedOrder: null,
      filters: {},
      requestSeq: { orders: 0, returns: 0 }
    },

    money: money,
    toNumber: toNumber,
    normalizeDebtAmount: normalizeDebtAmount,
    normalizeOrder: normalizeOrder,
    normalizeItem: normalizeItem,
    normalizeReturnRow: normalizeReturnRow,
    orderKey: orderKey,


    async api(path, options) {
      options = options || {};

      async function sendRequest() {
        var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
        return fetch(path, Object.assign({}, options, { credentials: options.credentials || 'same-origin', headers: headers }));
      }

      var res = await sendRequest();
      if (res.status === 401 && await refreshSession()) {
        res = await sendRequest();
      }

      try {
        return await readJson(res, 'Không gọi được API giao hàng');
      } catch (err) {
        if (err && err.status === 401) clearSessionAndRedirect();
        throw err;
      }
    },

    async loadOrders(filters) {
      filters = Object.assign({}, filters || {});
      var requestSeq = Number(this.state.requestSeq && this.state.requestSeq.orders || 0) + 1;
      this.state.requestSeq = Object.assign({}, this.state.requestSeq, { orders: requestSeq });
      // Web admin cần được lọc theo NVGH/NVBH.
      // App giao hàng nếu user role=delivery thì backend /api/delivery/* sẽ tự ép NVGH theo token,
      // nên không cần xóa deliveryStaffCode ở core chung.
      this.state.filters = Object.assign({}, this.state.filters, filters || {});
      var params = new URLSearchParams();
      Object.keys(this.state.filters).forEach(function (key) {
        var value = DeliveryCore.state.filters[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, value);
      });
      var json = await this.api('/api/delivery/orders' + (params.toString() ? '?' + params.toString() : ''));
      if (!this.state.requestSeq || requestSeq !== this.state.requestSeq.orders) return this.state.orders;
      var rows = dedupeOrders(json.orders || json.rows || json.items || []);
      this.state.summary = json.summary || {};
      this.state.reconciliation = json.reconciliation || {};
      this.state.orders = dedupeOrders(rows.map(normalizeOrder));
      if (this.state.selectedOrder) {
        var key = orderKey(this.state.selectedOrder);
        this.state.selectedOrder = this.state.orders.find(function (row) { return orderKey(row) === key; }) || null;
      }
      return this.state.orders;
    },

    buildReturnQueryForOrder(order) {
      order = normalizeOrder(order || this.state.selectedOrder || {});
      return {
        orderId: order.orderId,
        orderCode: order.orderCode,
        salesOrderId: order.salesOrderId,
        salesOrderCode: order.salesOrderCode,
        orderKey: order.orderCode || order.salesOrderCode || order.orderId || order.salesOrderId
      };
    },

    // DELIVERY_RETURN_ROW_SCOPE_START
    // returnOrders có thể được tải theo từng đơn để giữ tốc độ màn Đơn giao hôm nay.
    // Không dùng cờ returnsLoaded toàn cục để kết luận mọi đơn đều không có hàng trả.
    returnLoadKeysForOrder(order) {
      order = normalizeOrder(order || {});
      return [
        order.orderId, order.orderCode, order.salesOrderId, order.salesOrderCode, order.id, order.code
      ].map(text).filter(Boolean);
    },

    markReturnsLoadedForOrder(order) {
      const map = this.state.returnsLoadedByOrder || {};
      this.returnLoadKeysForOrder(order).forEach(function (key) { map[key] = true; });
      this.state.returnsLoadedByOrder = map;
    },
    // DELIVERY_RETURN_ROW_SCOPE_END

    async loadReturns(filters) {
      filters = Object.assign({}, this.state.filters, filters || {});
      var requestSeq = Number(this.state.requestSeq && this.state.requestSeq.returns || 0) + 1;
      this.state.requestSeq = Object.assign({}, this.state.requestSeq, { returns: requestSeq });
      var params = new URLSearchParams();
      Object.keys(filters).forEach(function (key) {
        var value = filters[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, value);
      });
      var json = await this.api('/api/delivery/returns' + (params.toString() ? '?' + params.toString() : ''));
      if (!this.state.requestSeq || requestSeq !== this.state.requestSeq.returns) return this.state.returns;
      var rows = json.returns || json.returnOrders || json.rows || [];
      this.state.returns = rows.map(normalizeReturnRow);
      this.state.returnsLoaded = true;
      this.state.returnsLoadedByOrder = {};
      return this.state.returns;
    },

    async loadReturnsForOrder(order) {
      order = normalizeOrder(order || this.state.selectedOrder || {});
      var directFilters = this.buildReturnQueryForOrder(order);
      var params = new URLSearchParams();
      Object.keys(directFilters).forEach(function (key) {
        var value = directFilters[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, value);
      });
      var json = await this.api('/api/delivery/returns' + (params.toString() ? '?' + params.toString() : ''));
      var rows = extractReturnRows(json, order).map(normalizeReturnRow);
      var match = this.returnRowMatcher(order);
      this.state.returns = (this.state.returns || []).filter(function (row) { return !match(row); });
      if (rows.length) this.mergeReturns(rows);
      this.state.returnsLoaded = true;
      this.markReturnsLoadedForOrder(order);
      return rows;
    },

    returnRowMatcher(order) {
      order = normalizeOrder(order || {});
      var ids = [order.orderId, order.salesOrderId, order.id, order._id].map(text).filter(Boolean);
      var codes = [order.orderCode, order.salesOrderCode, order.code, order.displayOrderCode].map(function (v) { return text(v).replace(/^RO[-_]?/i, ''); }).filter(Boolean);
      return function (row) {
        row = row || {};
        var rowIds = [row.salesOrderId, row.orderId, row.sourceOrderId, row.deliveryOrderId].map(text);
        var rowCodes = [row.salesOrderCode, row.orderCode, row.sourceOrderCode, row.deliveryOrderCode, row.returnOrderCode].map(function (v) { return text(v).replace(/^RO[-_]?/i, ''); });
        return ids.some(function (id) { return rowIds.indexOf(id) >= 0; }) || codes.some(function (code) { return rowCodes.indexOf(code) >= 0; });
      };
    },

    selectOrder(orderKeyValue) {
      var value = text(orderKeyValue);
      this.state.selectedOrder = this.state.orders.find(function (row) {
        return [row.orderId, row.orderCode, row.salesOrderId, row.salesOrderCode, row.id, row.code].map(text).indexOf(value) >= 0;
      }) || null;
      return this.state.selectedOrder;
    },

    calculateAmounts(order) {
      order = normalizeOrder(order);
      var amounts = order.amounts || {};
      var processed = toNumber(amounts.cash) + toNumber(amounts.bank) + toNumber(amounts.reward) + toNumber(amounts.returnAmount);
      var debt = normalizeDebtAmount(Math.max(0, toNumber(amounts.receivable) - processed));
      return Object.assign({}, amounts, { processed: processed, debt: debt });
    },

    buildReturnPayload(order, items) {
      order = normalizeOrder(order);
      return {
        orderId: order.orderId,
        orderCode: order.orderCode,
        salesOrderId: order.salesOrderId,
        salesOrderCode: order.salesOrderCode,
        customerCode: order.customerCode,
        customerName: order.customerName,
        deliveryDate: order.deliveryDate,
        deliveryStaffCode: order.deliveryStaffCode,
        deliveryStaffName: order.deliveryStaffName,
        salesStaffCode: order.salesStaffCode,
        salesStaffName: order.salesStaffName,
        returnType: 'partial',
        replaceReturnItems: true,
        allowEmptyReturn: true,
        items: (Array.isArray(items) ? items : []).map(normalizeItem)
      };
    },

    buildPaymentPayload(order, payment) {
      order = normalizeOrder(order);
      payment = payment || {};
      return {
        orderId: order.orderId,
        orderCode: order.orderCode,
        salesOrderId: order.salesOrderId,
        salesOrderCode: order.salesOrderCode,
        cashAmount: toNumber(payment.cashAmount || payment.cash),
        bankAmount: toNumber(payment.bankAmount || payment.bank),
        rewardAmount: toNumber(payment.rewardAmount || payment.reward),
        selectedDebtOrderIds: Array.isArray(payment.selectedDebtOrderIds) ? payment.selectedDebtOrderIds : []
      };
    },

    async saveReturn(order, items) {
      order = normalizeOrder(order || this.state.selectedOrder);
      var payload = this.buildReturnPayload(order, items);
      var json;
      try {
        json = await this.api('/api/delivery/return', { method: 'POST', body: JSON.stringify(payload) });
      } catch (err) {
        if (window.MobileOfflineSync && window.MobileOfflineSync.isNetworkError(err)) {
          await window.MobileOfflineSync.queueOperation('delivery_return_save', payload);
          return { ok: true, offlineQueued: true, message: 'Đã lưu hàng trả offline, sẽ tự đồng bộ khi có mạng', order: order };
        }
        throw err;
      }
      if (json.order) this.patchOrder(json.order);

      // After saving Tab 2, Tab 3 must show the official returnOrder immediately.
      // Prefer rows returned by POST /return, then force-reload by selected order key.
      var savedRows = extractReturnRows(json, order);
      if (Array.isArray(savedRows) && savedRows.length) this.mergeReturns(savedRows);
      try {
        var loadedRows = await this.loadReturnsForOrder(order);
        // Guard: nếu API reload theo key trả rỗng vì lệch key cũ, không được xóa dữ liệu vừa POST trả về.
        // Tab Hàng trả phải ưu tiên dữ liệu returnOrders chính thức vừa lưu.
        if ((!Array.isArray(loadedRows) || !loadedRows.length) && Array.isArray(savedRows) && savedRows.length) {
          this.mergeReturns(savedRows);
        }
      } catch (err) {
        // Keep returned rows if the direct reload fails; the UI should not look empty after a successful save.
        if (!Array.isArray(savedRows) || !savedRows.length) throw err;
        this.mergeReturns(savedRows);
      }
      return json;
    },

    async savePayment(order, payment) {
      var payload = this.buildPaymentPayload(order, payment);
      var json;
      try {
        json = await this.api('/api/delivery/payment', { method: 'POST', body: JSON.stringify(payload) });
      } catch (err) {
        if (window.MobileOfflineSync && window.MobileOfflineSync.isNetworkError(err)) {
          await window.MobileOfflineSync.queueOperation('delivery_payment_save', payload);
          return { ok: true, offlineQueued: true, message: 'Đã lưu tiền thu offline, sẽ tự đồng bộ khi có mạng', order: normalizeOrder(order) };
        }
        throw err;
      }
      if (json.order) this.patchOrder(json.order);
      return json;
    },

    async loadReconciliation(filters) {
      filters = Object.assign({}, this.state.filters, filters || {});
      var params = new URLSearchParams();
      Object.keys(filters).forEach(function (key) {
        var value = filters[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, value);
      });
      var json = await this.api('/api/delivery/reconciliation' + (params.toString() ? '?' + params.toString() : ''));
      this.state.reconciliation = json.reconciliation || json.summary || {};
      return this.state.reconciliation;
    },

    async confirmAccounting(orderIds, filters) {
      filters = filters || this.state.filters || {};
      var ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).map(text).filter(Boolean);
      if (!ids.length) throw new Error('Vui lòng chọn ít nhất 1 đơn để xác nhận kế toán');
      var body = {
        date: filters.date || filters.deliveryDate || '',
        deliveryDate: filters.date || filters.deliveryDate || '',
        deliveryStaffCode: filters.deliveryStaffCode || '',
        salesStaffCode: filters.salesStaffCode || '',
        orderIds: ids
      };
      return this.api('/api/master-orders/delivery-today/confirm-accounting', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },

    // ===== SCOPED FIX: DELIVERY TODAY ADMIN ACCOUNTING UNLOCK START =====
    // Chỉ thêm hàm gọi API mở khóa kế toán cho màn Đơn giao hôm nay.
    // Không thay đổi luồng xác nhận kế toán, lưu thu tiền hoặc ghi AR Ledger.
    async adminUnlockAccounting(orderId, reason) {
      var key = text(orderId);
      if (!key) throw new Error('Không xác định được mã đơn để mở khóa kế toán');
      return this.api('/api/master-orders/delivery-today/' + encodeURIComponent(key) + '/admin-unlock', {
        method: 'POST',
        body: JSON.stringify({
          reason: text(reason) || 'Admin mở khóa điều chỉnh kế toán',
          unlockedBy: 'admin'
        })
      });
    },
    // ===== SCOPED FIX: DELIVERY TODAY ADMIN ACCOUNTING UNLOCK END =====

    async confirmDelivery(order, payload) {
      order = normalizeOrder(order);
      payload = payload || {};
      var body = Object.assign({
        orderId: order.orderId,
        orderCode: order.orderCode,
        salesOrderId: order.salesOrderId,
        salesOrderCode: order.salesOrderCode,
        deliveryStatus: 'delivered'
      }, payload);
      var json = await this.api('/api/delivery/confirm', { method: 'POST', body: JSON.stringify(body) });
      if (json.order) this.patchOrder(json.order);
      return json;
    },

    mergeReturns(rows) {
      var incoming = (Array.isArray(rows) ? rows : []).map(normalizeReturnRow);
      var keep = (this.state.returns || []).filter(function (oldRow) {
        return !incoming.some(function (newRow) {
          var sameOrder = text(oldRow.salesOrderId) && text(oldRow.salesOrderId) === text(newRow.salesOrderId)
            || text(oldRow.salesOrderCode) && text(oldRow.salesOrderCode) === text(newRow.salesOrderCode);
          var sameProduct = text(oldRow.productCode) === text(newRow.productCode);
          return sameOrder && sameProduct;
        });
      });
      this.state.returns = keep.concat(incoming);
      return this.state.returns;
    },

    patchOrder(order) {
      var normalized = normalizeOrder(order);
      var key = orderKey(normalized);
      var idx = this.state.orders.findIndex(function (row) { return orderKey(row) === key; });
      if (idx >= 0) this.state.orders[idx] = normalized;
      else this.state.orders.push(normalized);
      this.state.selectedOrder = normalized;
      return normalized;
    }
  };

  window.DeliveryCore = DeliveryCore;
}());
