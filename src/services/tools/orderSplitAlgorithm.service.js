'use strict';

/**
 * OUT-OF-FLOW TOOL ONLY.
 * This module must not create/update/delete ERP business data.
 * Do not import order/accounting/inventory/invoice services here.
 */

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeOptions(options = {}) {
  return {
    toleranceAmount: Math.max(0, Number(options.toleranceAmount) || 0),
    tolerancePercent: Math.max(0, Number(options.tolerancePercent) || 0),
    allowTargetOverTotal: options.allowTargetOverTotal === true,
    maxIterations: Math.min(20000, Math.max(500, Number(options.maxIterations) || 5000))
  };
}

function toleranceFor(target, options) {
  const percentValue = Math.abs(target) * (options.tolerancePercent / 100);
  return Math.max(options.toleranceAmount, percentValue);
}

function buildOrders(targets) {
  return targets.map((target, index) => ({
    index,
    orderCode: target.orderCode,
    targetAmount: roundMoney(target.targetAmount),
    actualAmount: 0,
    lines: new Map()
  }));
}

function addQty(order, itemIndex, qty, items) {
  if (!qty) return;
  const current = order.lines.get(itemIndex) || 0;
  const next = current + qty;
  if (next <= 0) order.lines.delete(itemIndex);
  else order.lines.set(itemIndex, next);
  order.actualAmount = roundMoney(order.actualAmount + qty * items[itemIndex].unitPrice);
}

function validateInputs(items, targets, options) {
  if (!items.length) throw new Error('Không có dữ liệu đơn tổng để chia.');
  if (!targets.length) throw new Error('Không có danh sách đơn con target.');
  const totalAmount = roundMoney(items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const targetAmount = roundMoney(targets.reduce((sum, target) => sum + target.targetAmount, 0));
  if (targetAmount > totalAmount && !options.allowTargetOverTotal) {
    throw new Error(`Tổng target (${targetAmount.toLocaleString('vi-VN')}) vượt tổng đơn tổng (${totalAmount.toLocaleString('vi-VN')}).`);
  }
  return { totalAmount, targetAmount };
}

function initialAllocate(items, targets, options) {
  const totals = validateInputs(items, targets, options);
  const orders = buildOrders(targets);
  const remaining = items.map((item) => Math.max(0, Math.trunc(item.quantity)));
  const sumTarget = totals.targetAmount || 1;

  items.forEach((item, itemIndex) => {
    let used = 0;
    const fractions = [];
    orders.forEach((order) => {
      const exact = item.quantity * (order.targetAmount / sumTarget);
      const qty = Math.min(remaining[itemIndex] - used, Math.floor(exact));
      if (qty > 0) {
        addQty(order, itemIndex, qty, items);
        used += qty;
      }
      fractions.push({ order, fraction: exact - Math.floor(exact) });
    });
    let left = remaining[itemIndex] - used;
    fractions.sort((a, b) => b.fraction - a.fraction || (a.order.actualAmount - a.order.targetAmount) - (b.order.actualAmount - b.order.targetAmount));
    for (const entry of fractions) {
      if (left <= 0) break;
      addQty(entry.order, itemIndex, 1, items);
      left -= 1;
    }
    remaining[itemIndex] = left;
  });

  return { orders, remaining, ...totals };
}

function totalError(orders) {
  return roundMoney(orders.reduce((sum, order) => sum + Math.abs(order.actualAmount - order.targetAmount), 0));
}

function optimizeMoves(state, items, options) {
  let currentError = totalError(state.orders);
  for (let iter = 0; iter < options.maxIterations; iter += 1) {
    let best = null;
    for (const from of state.orders) {
      for (const [itemIndex, qty] of from.lines.entries()) {
        if (qty <= 0) continue;
        const price = items[itemIndex].unitPrice;
        for (const to of state.orders) {
          if (from === to) continue;
          const before = Math.abs(from.actualAmount - from.targetAmount) + Math.abs(to.actualAmount - to.targetAmount);
          const after = Math.abs((from.actualAmount - price) - from.targetAmount) + Math.abs((to.actualAmount + price) - to.targetAmount);
          const gain = before - after;
          if (gain > 0.0001 && (!best || gain > best.gain)) best = { from, to, itemIndex, gain };
        }
      }
    }
    if (!best) break;
    addQty(best.from, best.itemIndex, -1, items);
    addQty(best.to, best.itemIndex, 1, items);
    const nextError = totalError(state.orders);
    if (nextError >= currentError - 0.0001) break;
    currentError = nextError;
  }
}

function optimizeSwaps(state, items, options) {
  for (let iter = 0; iter < Math.min(1000, options.maxIterations); iter += 1) {
    let best = null;
    for (const a of state.orders) {
      for (const b of state.orders) {
        if (a.index >= b.index) continue;
        for (const [itemA, qtyA] of a.lines.entries()) {
          if (qtyA <= 0) continue;
          for (const [itemB, qtyB] of b.lines.entries()) {
            if (qtyB <= 0 || itemA === itemB) continue;
            const priceA = items[itemA].unitPrice;
            const priceB = items[itemB].unitPrice;
            const before = Math.abs(a.actualAmount - a.targetAmount) + Math.abs(b.actualAmount - b.targetAmount);
            const nextA = a.actualAmount - priceA + priceB;
            const nextB = b.actualAmount - priceB + priceA;
            const after = Math.abs(nextA - a.targetAmount) + Math.abs(nextB - b.targetAmount);
            const gain = before - after;
            if (gain > 0.0001 && (!best || gain > best.gain)) best = { a, b, itemA, itemB, gain };
          }
        }
      }
    }
    if (!best) break;
    addQty(best.a, best.itemA, -1, items);
    addQty(best.b, best.itemB, -1, items);
    addQty(best.a, best.itemB, 1, items);
    addQty(best.b, best.itemA, 1, items);
  }
}

function materialize(state, items, targets, options, parseWarnings = [], invoiceInfo = []) {
  const resultLines = [];
  const compareRows = [];
  const warnings = parseWarnings.map((warning) => ({
    orderCode: warning.orderCode || '',
    type: warning.type || 'WARNING',
    message: warning.message || String(warning),
    level: warning.level || 'WARN'
  }));

  const usedByItem = items.map(() => 0);
  state.orders.forEach((order) => {
    Array.from(order.lines.entries()).sort((a, b) => a[0] - b[0]).forEach(([itemIndex, qty]) => {
      const item = items[itemIndex];
      if (qty <= 0) return;
      usedByItem[itemIndex] += qty;
      resultLines.push({
        orderCode: order.orderCode,
        productCode: item.productCode,
        productName: item.productName,
        unit: item.unit || '',
        quantity: qty,
        unitPrice: roundMoney(item.unitPrice),
        amount: roundMoney(qty * item.unitPrice),
        vatRate: item.vatRate
      });
    });
    const diff = roundMoney(order.actualAmount - order.targetAmount);
    const tolerance = toleranceFor(order.targetAmount, options);
    const diffPercent = order.targetAmount ? roundMoney((diff / order.targetAmount) * 100) : 0;
    const status = Math.abs(diff) <= tolerance ? 'OK' : 'LỆCH NGOÀI BIÊN ĐỘ';
    compareRows.push({
      orderCode: order.orderCode,
      targetAmount: roundMoney(order.targetAmount),
      actualAmount: roundMoney(order.actualAmount),
      diff,
      diffPercent,
      tolerance: roundMoney(tolerance),
      status
    });
    if (status !== 'OK') {
      warnings.push({ orderCode: order.orderCode, type: 'TARGET_OUT_OF_TOLERANCE', message: `Đơn ${order.orderCode} lệch ${diff.toLocaleString('vi-VN')} so với target.`, level: 'WARN' });
    }
  });

  const stockRows = items.map((item, index) => ({
    productCode: item.productCode,
    productName: item.productName,
    initialQty: item.quantity,
    allocatedQty: usedByItem[index],
    remainingQty: item.quantity - usedByItem[index]
  }));

  stockRows.forEach((row) => {
    if (row.remainingQty < 0) warnings.push({ orderCode: '', type: 'NEGATIVE_REMAINING', message: `Mã SP ${row.productCode} bị chia vượt số lượng.`, level: 'ERROR' });
  });

  return {
    summary: {
      totalAmount: roundMoney(state.totalAmount),
      targetAmount: roundMoney(state.targetAmount),
      actualAllocatedAmount: roundMoney(compareRows.reduce((sum, row) => sum + row.actualAmount, 0)),
      totalDiff: roundMoney(compareRows.reduce((sum, row) => sum + Math.abs(row.diff), 0)),
      orderCount: targets.length,
      itemCount: items.length
    },
    resultLines,
    compareRows,
    stockRows,
    warnings,
    invoiceInfo
  };
}

function splitOrders(items, targets, rawOptions = {}, parseWarnings = [], invoiceInfo = []) {
  const options = normalizeOptions(rawOptions);
  const state = initialAllocate(items, targets, options);
  optimizeMoves(state, items, options);
  optimizeSwaps(state, items, options);
  return materialize(state, items, targets, options, parseWarnings, invoiceInfo);
}

module.exports = { splitOrders, roundMoney, toleranceFor, normalizeOptions };
