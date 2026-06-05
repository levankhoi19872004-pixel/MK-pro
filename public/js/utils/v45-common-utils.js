(function initV45CommonUtils(global) {
  'use strict';

  function toNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const n = Number(String(value).replace(/[^0-9.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .trim()
      .toLowerCase();
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[ch]));
  }

  function todayValue() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  }

  function toDateOnly(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let m = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})/);
    if (m) {
      let d = Number(m[1]);
      let mo = Number(m[2]);
      let y = Number(m[3]);
      if (y < 100) y += y >= 70 ? 1900 : 2000;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return raw.slice(0, 10);
  }

  function calculateCartonUnit(quantity, packing = 1) {
    const qty = Math.max(0, toNumber(quantity));
    const rate = Math.max(1, toNumber(packing) || 1);
    const cartons = Math.floor(qty / rate);
    const units = qty % rate;
    return { cartons, units, packing: rate, display: `${cartons}/${units}` };
  }

  function firstPositiveAmount(...values) {
    for (const value of values) {
      const n = toNumber(value);
      if (n > 0) return n;
    }
    return 0;
  }

  function deliveryDebtBase(order = {}) {
    return firstPositiveAmount(
      order.totalAmount,
      order.total,
      order.amount,
      order.grandTotal,
      order.payableAmount,
      order.orderAmount,
      order.debtBeforeCollection,
      order.debtAmount,
      order.debt
    );
  }

  function lineReturnAmount(item = {}) {
    const qty = toNumber(item.qtyReturn ?? item.returnQty ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty ?? 0);
    const price = toNumber(item.salePrice ?? item.price ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
    const explicit = item.returnAmount ?? item.amount;
    const amount = explicit === undefined || explicit === null || explicit === '' ? NaN : toNumber(explicit);
    return Number.isFinite(amount) && amount !== 0 ? amount : Math.round(qty * price);
  }

  function amountFromReturnOrder(returnOrder = {}) {
    const directTotal = toNumber(returnOrder.totalReturnAmount ?? returnOrder.returnAmount ?? returnOrder.totalAmount ?? returnOrder.amount ?? 0);
    if (directTotal > 0) return Math.round(directTotal);
    const items = Array.isArray(returnOrder.items) ? returnOrder.items : [];
    return Math.round(items.reduce((sum, item) => sum + lineReturnAmount(item), 0));
  }

  function deliveryReturnAmount(order = {}) {
    if (order.returnAmountFromReturnOrders !== undefined && order.returnAmountFromReturnOrders !== null) {
      return Math.round(toNumber(order.returnAmountFromReturnOrders));
    }
    const returnItems = Array.isArray(order.deliveryReturnItems)
      ? order.deliveryReturnItems
      : (Array.isArray(order.returnItems) ? order.returnItems : null);
    if (Array.isArray(returnItems)) return Math.round(returnItems.reduce((sum, item) => sum + lineReturnAmount(item), 0));
    if (order.returnOrder) return amountFromReturnOrder(order.returnOrder);
    return Math.round(toNumber(order.returnAmount ?? order.totalReturnAmount ?? order.returnedAmount ?? 0));
  }

  function isDeliveryArLedgerSynced(order = {}) {
    return order?.arLedgerSynced === true || String(order?.debtSource || '').toLowerCase() === 'ar_ledger';
  }

  function deliveryArLedgerDebt(order = {}) {
    return Math.round(toNumber(order.arDebtAmount ?? order.arBalance ?? order.debtAmount ?? order.debt ?? 0));
  }

  function calculateDeliveryDebt(order = {}, options = {}) {
    if (options.useArLedgerIfSynced !== false && isDeliveryArLedgerSynced(order)) return deliveryArLedgerDebt(order);
    return Math.max(0, Math.round(
      deliveryDebtBase(order)
      - toNumber(order.cashCollected ?? order.cashAmount ?? 0)
      - toNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0)
      - toNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0)
      - (options.returnAmountOverride == null ? deliveryReturnAmount(order) : toNumber(options.returnAmountOverride))
    ));
  }



  function debounce(fn, wait = 250) {
    let timer = null;
    return function debouncedFn(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function runSoon(fn, delay = 0) {
    return setTimeout(() => {
      try {
        const result = typeof fn === 'function' ? fn() : null;
        if (result && typeof result.catch === 'function') result.catch(console.warn);
      } catch (error) {
        console.warn('[V45_RUN_SOON_ERROR]', error);
      }
    }, delay);
  }

  global.V45Common = Object.assign({}, global.V45Common || {}, {
    toNumber,
    normalizeText,
    escapeHtml,
    todayValue,
    toDateOnly,
    calculateCartonUnit,
    firstPositiveAmount,
    deliveryDebtBase,
    deliveryReturnAmount,
    amountFromReturnOrder,
    calculateDeliveryDebt,
    isDeliveryArLedgerSynced,
    deliveryArLedgerDebt,
    debounce,
    fetchWithTimeout,
    runSoon
  });

  if (typeof global.debounce !== 'function') global.debounce = debounce;
  if (typeof global.fetchWithTimeout !== 'function') global.fetchWithTimeout = fetchWithTimeout;
  if (typeof global.runSoon !== 'function') global.runSoon = runSoon;
})(window);
