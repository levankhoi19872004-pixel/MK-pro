'use strict';

const VALID_SALES_ORDER_ID_RE = /^SO\d+$/i;

function compactDeliveryOrderKeys(order = {}) {
  return [order.id, order._id, order.code, order.orderCode, order.documentCode, order.salesOrderId, order.salesOrderCode, order.sourceOrderId, order.sourceOrderCode, order.deliveryOrderId, order.deliveryOrderCode, order.masterOrderId, order.masterOrderCode]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function normalizeSalesOrderIds(ids = []) {
  return Array.from(new Set((ids || [])
    .map((value) => String(value || '').trim())
    .filter((value) => VALID_SALES_ORDER_ID_RE.test(value))));
}

function buildSalesOrderIdInQuery(ids = []) {
  return { id: { $in: normalizeSalesOrderIds(ids) } };
}

function isCleanOrderCode(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  if (/[\u0000-\u001F\u007F\uFFFD]/.test(text)) return false;
  return text.length <= 80;
}

function pushMasterSalesOrderRef(acc, value) {
  if (Array.isArray(value)) {
    value.forEach((item) => pushMasterSalesOrderRef(acc, item));
    return acc;
  }
  if (value && typeof value === 'object') {
    [value.id, value._id, value.salesOrderId, value.orderId, value.sourceOrderId, value.deliveryOrderId].forEach((item) => {
      const text = String(item || '').trim();
      if (VALID_SALES_ORDER_ID_RE.test(text)) acc.salesOrderIds.push(text);
    });
    [value.code, value.orderCode, value.documentCode, value.invoiceCode, value.salesOrderCode, value.sourceOrderCode, value.deliveryOrderCode].forEach((item) => {
      const text = String(item || '').trim();
      if (isCleanOrderCode(text)) acc.salesOrderCodes.push(text);
    });
    return acc;
  }
  const text = String(value || '').trim();
  if (!text) return acc;
  if (VALID_SALES_ORDER_ID_RE.test(text)) acc.salesOrderIds.push(text);
  else if (isCleanOrderCode(text)) acc.salesOrderCodes.push(text);
  return acc;
}

function normalizeMasterSalesOrderRefs(masterOrder = {}) {
  const acc = { salesOrderIds: [], salesOrderCodes: [] };
  [masterOrder.children, masterOrder.childOrders, masterOrder.orderIds, masterOrder.childOrderIds, masterOrder.salesOrderIds, masterOrder.salesOrders, masterOrder.orderCodes, masterOrder.salesOrderCodes]
    .forEach((value) => pushMasterSalesOrderRef(acc, value));
  const salesOrderIds = [...new Set(acc.salesOrderIds.filter((value) => VALID_SALES_ORDER_ID_RE.test(String(value || '').trim())))];
  const salesOrderCodes = [...new Set(acc.salesOrderCodes.filter(isCleanOrderCode))];
  return { salesOrderIds, salesOrderCodes, refs: [...new Set([...salesOrderIds, ...salesOrderCodes])] };
}

function masterChildOrderRefs(masterOrder = {}) {
  return normalizeMasterSalesOrderRefs(masterOrder).refs;
}

function buildIdentityInFilter(keys = [], fields = ['id', 'code']) {
  const values = [...new Set((keys || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!values.length) return null;
  return { $or: fields.map((field) => ({ [field]: { $in: values } })) };
}

module.exports = {
  VALID_SALES_ORDER_ID_RE,
  compactDeliveryOrderKeys,
  normalizeSalesOrderIds,
  buildSalesOrderIdInQuery,
  isCleanOrderCode,
  normalizeMasterSalesOrderRefs,
  masterChildOrderRefs,
  buildIdentityInFilter
};
