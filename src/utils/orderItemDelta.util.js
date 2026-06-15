'use strict';

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeProductCode(value = '') {
  return String(value || '').trim().toUpperCase();
}

function itemProductCode(item = {}) {
  return normalizeProductCode(item.productCode || item.code || item.sku || item.productId || item.id);
}

function itemQuantity(item = {}) {
  return Math.max(0, toNumber(item.quantity ?? item.qty ?? item.stockQuantity ?? item.totalQty));
}

function aggregateOrderItems(items = []) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const productCode = itemProductCode(item);
    const quantity = itemQuantity(item);
    if (!productCode || quantity <= 0) continue;

    const current = map.get(productCode) || {
      productCode,
      quantity: 0,
      representative: item
    };
    current.quantity += quantity;
    if (!current.representative) current.representative = item;
    map.set(productCode, current);
  }
  return map;
}

function buildOrderItemQuantityDeltas(previousItems = [], nextItems = []) {
  const previous = aggregateOrderItems(previousItems);
  const next = aggregateOrderItems(nextItems);
  const productCodes = Array.from(new Set([...previous.keys(), ...next.keys()])).sort();

  return productCodes.map((productCode) => {
    const previousRow = previous.get(productCode) || null;
    const nextRow = next.get(productCode) || null;
    const previousQty = toNumber(previousRow?.quantity);
    const nextQty = toNumber(nextRow?.quantity);
    return {
      productCode,
      previousQty,
      nextQty,
      deltaQty: nextQty - previousQty,
      previousItem: previousRow?.representative || null,
      nextItem: nextRow?.representative || null
    };
  });
}

function buildInventoryEditMovements(previousItems = [], nextItems = []) {
  const incoming = [];
  const outgoing = [];

  for (const delta of buildOrderItemQuantityDeltas(previousItems, nextItems)) {
    if (delta.deltaQty > 0) {
      outgoing.push({
        ...(delta.nextItem || delta.previousItem || {}),
        productCode: delta.productCode,
        quantity: delta.deltaQty,
        qty: delta.deltaQty
      });
    } else if (delta.deltaQty < 0) {
      const quantity = Math.abs(delta.deltaQty);
      incoming.push({
        ...(delta.previousItem || delta.nextItem || {}),
        productCode: delta.productCode,
        quantity,
        qty: quantity
      });
    }
  }

  return { incoming, outgoing };
}

module.exports = {
  normalizeProductCode,
  itemProductCode,
  itemQuantity,
  aggregateOrderItems,
  buildOrderItemQuantityDeltas,
  buildInventoryEditMovements
};
