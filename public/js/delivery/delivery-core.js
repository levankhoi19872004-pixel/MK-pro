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
        debt: toNumber(amounts.debt || amounts.debtAmount || order.debtAmount || order.debt)
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

  var DeliveryCore = {
    state: {
      orders: [],
      selectedOrder: null,
      filters: {}
    },

    money: money,
    toNumber: toNumber,
    normalizeOrder: normalizeOrder,
    normalizeItem: normalizeItem,
    orderKey: orderKey,

    async api(path, options) {
      var res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}));
      return readJson(res, 'Không gọi được API giao hàng');
    },

    async loadOrders(filters) {
      this.state.filters = Object.assign({}, this.state.filters, filters || {});
      var params = new URLSearchParams();
      Object.keys(this.state.filters).forEach(function (key) {
        var value = DeliveryCore.state.filters[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, value);
      });
      var json = await this.api('/api/delivery/orders' + (params.toString() ? '?' + params.toString() : ''));
      var rows = json.orders || json.rows || json.items || [];
      this.state.orders = rows.map(normalizeOrder);
      if (this.state.selectedOrder) {
        var key = orderKey(this.state.selectedOrder);
        this.state.selectedOrder = this.state.orders.find(function (row) { return orderKey(row) === key; }) || null;
      }
      return this.state.orders;
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
      var debt = Math.max(0, toNumber(amounts.receivable) - processed);
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
      var json = await this.api('/api/delivery/return', { method: 'POST', body: JSON.stringify(this.buildReturnPayload(order, items)) });
      if (json.order) this.patchOrder(json.order);
      return json;
    },

    async savePayment(order, payment) {
      var json = await this.api('/api/delivery/payment', { method: 'POST', body: JSON.stringify(this.buildPaymentPayload(order, payment)) });
      if (json.order) this.patchOrder(json.order);
      return json;
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
