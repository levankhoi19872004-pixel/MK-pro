'use strict';

/**
 * Read-only net-sale allocator used by VAT/SSE exports.
 * It never writes to MongoDB and never mutates source orders/return orders.
 */

function cleanText(value) {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = 0) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const text = cleanText(value).replace(/\s/g, '').replace(/,/g, '');
  if (!text) return fallback;
  const number = Number(text);
  return Number.isFinite(number) ? number : fallback;
}

function roundQty(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 1e6) / 1e6;
}

function uniqueText(values = []) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function conversionRateOf(item = {}) {
  return Math.max(1, toNumber(
    item.conversionRateAtOrder
    ?? item.conversionRate
    ?? item.packingQty
    ?? item.unitsPerCase
    ?? item.qtyPerCase
    ?? item.packSize
    ?? 1,
    1
  ));
}

function parseCaseLoose(value, conversionRate = 1) {
  const text = cleanText(value);
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return NaN;
  return toNumber(match[1]) * Math.max(1, conversionRate) + toNumber(match[2]);
}

function firstDefined(item, fields = []) {
  for (const field of fields) {
    const value = item?.[field];
    if (value !== undefined && value !== null && cleanText(value) !== '') return value;
  }
  return undefined;
}

function soldQtyOf(item = {}) {
  const rate = conversionRateOf(item);
  const direct = firstDefined(item, ['quantity', 'qty', 'totalQty', 'qtySale', 'saleQty', 'baseQty']);
  if (direct !== undefined) {
    const caseLoose = parseCaseLoose(direct, rate);
    return roundQty(Number.isFinite(caseLoose) ? caseLoose : Math.max(0, toNumber(direct)));
  }
  const cases = toNumber(firstDefined(item, ['caseQty', 'cartonQty', 'cases', 'qtyCase', 'caseQuantity']), 0);
  const loose = toNumber(firstDefined(item, ['looseQty', 'unitQty', 'remainderQty', 'qtyLoose', 'looseQuantity']), 0);
  return roundQty(Math.max(0, cases * rate + loose));
}

function returnedQtyOf(item = {}) {
  const rate = conversionRateOf(item);
  const direct = firstDefined(item, ['returnQty', 'qtyReturn', 'returnQuantity', 'returnedQty', 'baseReturnQty']);
  if (direct !== undefined) {
    const caseLoose = parseCaseLoose(direct, rate);
    return roundQty(Number.isFinite(caseLoose) ? caseLoose : Math.max(0, toNumber(direct)));
  }
  const cases = toNumber(firstDefined(item, ['returnCaseQty', 'caseReturnQty', 'qtyReturnCase', 'returnedCaseQty']), 0);
  const loose = toNumber(firstDefined(item, ['returnLooseQty', 'looseReturnQty', 'qtyReturnLoose', 'returnedLooseQty']), 0);
  return roundQty(Math.max(0, cases * rate + loose));
}

function productCodeOf(item = {}) {
  return cleanText(item.productCode || item.code || item.sku || item.barcode || item.productId || item.id);
}

function lineKeyOf(item = {}) {
  return cleanText(item.lineKey || item.orderLineId || item.salesOrderItemId || item.itemId || item._id);
}

function priceOf(item = {}) {
  return toNumber(item.finalPrice ?? item.priceAfterPromotion ?? item.promoPrice ?? item.price ?? item.salePrice ?? item.unitPrice ?? item.sellPrice ?? 0);
}

function priceKeyOf(item = {}) {
  const price = priceOf(item);
  return price ? String(Math.round((price + Number.EPSILON) * 1e6) / 1e6) : '';
}

function salesOrderKeys(order = {}) {
  return uniqueText([
    order._id, order.id, order.code, order.orderCode, order.salesOrderCode,
    order.documentCode, order.invoiceCode, order.externalOrderCode, order.refCode
  ]);
}

function returnOrderKeys(row = {}) {
  return uniqueText([
    row.salesOrderId, row.orderId, row.sourceOrderId, row.deliveryOrderId,
    row.salesOrderCode, row.orderCode, row.sourceOrderCode,
    row.deliveryOrderCode, row.originalOrderCode
  ]);
}

function returnDocumentIdentity(row = {}, index = 0) {
  return cleanText(row.code || row.returnOrderCode || row.documentCode || row.id || row._id) || `RETURN_DOC_${index}`;
}

function returnDocumentUpdatedAt(row = {}) {
  const raw = row.updatedAt || row.modifiedAt || row.createdAt || row.date || row.documentDate || '';
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function sourceOf(row = {}, item = {}, qty = 0) {
  return {
    code: cleanText(row.code || row.returnOrderCode || row.documentCode || row.id || row._id),
    id: cleanText(row.id || row._id || row.code || row.returnOrderCode || row.documentCode),
    productCode: productCodeOf(item),
    qty: roundQty(qty)
  };
}

function selectLatestReturnDocuments(returnOrders = [], isEligibleReturnOrder = () => true) {
  const latest = new Map();
  (returnOrders || []).forEach((row, index) => {
    if (!isEligibleReturnOrder(row)) return;
    const identity = returnDocumentIdentity(row, index);
    const orderKeys = returnOrderKeys(row);
    if (!orderKeys.length) return;
    const key = identity;
    const updatedAt = returnDocumentUpdatedAt(row);
    const previous = latest.get(key);
    if (!previous || updatedAt >= previous.updatedAt) latest.set(key, { row, updatedAt, identity, orderKeys });
  });
  return [...latest.values()];
}

function allocateQuantity(lines, qty, source, preferred = {}) {
  let remaining = roundQty(qty);
  if (remaining <= 0) return 0;

  const exactLine = preferred.lineKey
    ? lines.filter((line) => line.lineKey && line.lineKey === preferred.lineKey)
    : [];
  const exactPrice = preferred.priceKey
    ? lines.filter((line) => line.priceKey && line.priceKey === preferred.priceKey && !exactLine.includes(line))
    : [];
  const fallback = lines.filter((line) => !exactLine.includes(line) && !exactPrice.includes(line));
  const ordered = [...exactLine, ...exactPrice, ...fallback];

  for (const line of ordered) {
    if (remaining <= 0) break;
    const capacity = roundQty(Math.max(0, line.soldQty - line.returnedQty));
    if (capacity <= 0) continue;
    const allocated = roundQty(Math.min(capacity, remaining));
    line.returnedQty = roundQty(line.returnedQty + allocated);
    line.returnSources.push({ ...source, allocatedQty: allocated });
    remaining = roundQty(remaining - allocated);
  }
  return remaining;
}

function buildNetSaleDataset({ orders = [], returnOrders = [], isEligibleReturnOrder = () => true } = {}) {
  const warnings = [];
  const orderRecords = (orders || []).map((order, orderIndex) => {
    const lines = (Array.isArray(order.items) ? order.items : []).map((item, itemIndex) => ({
      item,
      itemIndex,
      productCode: productCodeOf(item),
      soldQty: soldQtyOf(item),
      returnedQty: 0,
      netQty: 0,
      lineKey: lineKeyOf(item),
      priceKey: priceKeyOf(item),
      returnSources: []
    }));
    return { order, orderIndex, orderKeys: salesOrderKeys(order), lines };
  });

  const orderByKey = new Map();
  for (const record of orderRecords) {
    for (const key of record.orderKeys) {
      if (!orderByKey.has(key)) orderByKey.set(key, new Set());
      orderByKey.get(key).add(record);
    }
  }

  const returnDocuments = selectLatestReturnDocuments(returnOrders, isEligibleReturnOrder);
  for (const document of returnDocuments) {
    const matched = new Set();
    for (const key of document.orderKeys) {
      for (const record of orderByKey.get(key) || []) matched.add(record);
    }
    if (matched.size !== 1) {
      warnings.push({
        code: matched.size ? 'AMBIGUOUS_RETURN_ORDER_LINK' : 'UNMATCHED_RETURN_ORDER',
        returnOrderCode: document.identity,
        orderKeys: document.orderKeys,
        message: matched.size
          ? 'Phiếu trả liên kết tới nhiều đơn bán; không tự động trừ để tránh sai đơn.'
          : 'Phiếu trả không liên kết được với đơn bán trong dataset xuất.'
      });
      continue;
    }

    const orderRecord = [...matched][0];
    for (const item of Array.isArray(document.row.items) ? document.row.items : []) {
      const productCode = productCodeOf(item);
      const qty = returnedQtyOf(item);
      if (!productCode || qty <= 0) continue;
      const productLines = orderRecord.lines.filter((line) => line.productCode === productCode && line.soldQty > 0);
      if (!productLines.length) {
        warnings.push({
          code: 'UNMATCHED_RETURN_PRODUCT',
          returnOrderCode: document.identity,
          orderCode: cleanText(orderRecord.order.code || orderRecord.order.orderCode || orderRecord.order.id),
          productCode,
          returnedQty: qty,
          message: 'Mã sản phẩm trả không tồn tại trong đơn bán gốc.'
        });
        continue;
      }
      const remaining = allocateQuantity(productLines, qty, sourceOf(document.row, item, qty), {
        lineKey: lineKeyOf(item),
        priceKey: priceKeyOf(item)
      });
      if (remaining > 0) {
        warnings.push({
          code: 'RETURN_QTY_EXCEEDS_SOLD',
          returnOrderCode: document.identity,
          orderCode: cleanText(orderRecord.order.code || orderRecord.order.orderCode || orderRecord.order.id),
          productCode,
          soldQty: roundQty(productLines.reduce((sum, line) => sum + line.soldQty, 0)),
          returnedQty: qty,
          excessQty: remaining,
          message: 'Tổng số lượng trả vượt số lượng bán; số lượng thực xuất đã được giới hạn về 0.'
        });
      }
    }
  }

  for (const record of orderRecords) {
    for (const line of record.lines) {
      line.returnedQty = roundQty(Math.min(line.soldQty, line.returnedQty));
      line.netQty = roundQty(Math.max(0, line.soldQty - line.returnedQty));
      line.rawReturnedQty = roundQty(line.returnSources.reduce((sum, entry) => sum + toNumber(entry.allocatedQty), 0));
    }
    record.exportableLines = record.lines.filter((line) => line.productCode && line.soldQty > 0 && line.netQty > 0);
    record.totalSoldQty = roundQty(record.lines.reduce((sum, line) => sum + line.soldQty, 0));
    record.totalReturnedQty = roundQty(record.lines.reduce((sum, line) => sum + line.returnedQty, 0));
    record.totalNetQty = roundQty(record.lines.reduce((sum, line) => sum + line.netQty, 0));
    record.fullyReturned = record.totalSoldQty > 0 && record.totalNetQty <= 0;
  }

  return { orders: orderRecords, warnings };
}

function sourceSummary(line = {}) {
  const codes = uniqueText((line.returnSources || []).map((entry) => entry.code));
  const ids = uniqueText((line.returnSources || []).map((entry) => entry.id));
  const rows = (line.returnSources || []).map((entry) => `${entry.code || entry.id || 'RETURN'}:${entry.productCode}:${entry.allocatedQty}`);
  return {
    ReturnOrderCode: codes.join(', '),
    ReturnOrderId: ids.join(', '),
    ReturnQtySource: rows.join(' | ')
  };
}

module.exports = {
  buildNetSaleDataset,
  soldQtyOf,
  returnedQtyOf,
  productCodeOf,
  lineKeyOf,
  priceKeyOf,
  salesOrderKeys,
  returnOrderKeys,
  sourceSummary,
  _private: {
    parseCaseLoose,
    conversionRateOf,
    selectLatestReturnDocuments,
    allocateQuantity
  }
};
