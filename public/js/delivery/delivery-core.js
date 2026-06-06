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
      catch (err) { throw new Error('API trả JSON lỗi: ' + err.message); }
    } else {
      throw new Error((fallbackMessage || 'API không trả JSON') + ' (HTTP ' + res.status + ')');
    }
    if (!res.ok || json.ok === false || json.success === false) {
      throw new Error(json.message || fallbackMessage || 'API lỗi');
    }
    return json;
  }

  function orderKey(order) {
    return text(order && (order.orderId || order.salesOrderId || order.id || order._id || order.orderCode || order.salesOrderCode || order.code));
  }

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


  var DeliveryCore = {
    state: {
      orders: [],
      returns: [],
      returnsLoaded: false,
      selectedOrder: null,
      filters: {}
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
      var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
      var token = localStorage.getItem('mk_web_token') || localStorage.getItem('v43_mobile_token') || '';
      if (token) headers.Authorization = 'Bearer ' + token;
      var res = await fetch(path, Object.assign({}, options, { headers: headers }));
      return readJson(res, 'Không gọi được API giao hàng');
    },

    async loadOrders(filters) {
      filters = Object.assign({}, filters || {});
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
      var rows = json.orders || json.rows || json.items || [];
      this.state.summary = json.summary || {};
      this.state.reconciliation = json.reconciliation || {};
      this.state.orders = rows.map(normalizeOrder);
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

    async loadReturns(filters) {
      filters = Object.assign({}, this.state.filters, filters || {});
      var params = new URLSearchParams();
      Object.keys(filters).forEach(function (key) {
        var value = filters[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, value);
      });
      var json = await this.api('/api/delivery/returns' + (params.toString() ? '?' + params.toString() : ''));
      var rows = json.returns || json.returnOrders || json.rows || [];
      this.state.returns = rows.map(normalizeReturnRow);
      this.state.returnsLoaded = true;
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
      var json = await this.api('/api/delivery/return', { method: 'POST', body: JSON.stringify(this.buildReturnPayload(order, items)) });
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
      var json = await this.api('/api/delivery/payment', { method: 'POST', body: JSON.stringify(this.buildPaymentPayload(order, payment)) });
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
