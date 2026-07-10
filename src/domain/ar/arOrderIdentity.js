'use strict';

/**
 * Canonical business-order identity used by AR readers and reconcile writers.
 *
 * Correction/closeout/allocation documents may have their own sourceId/sourceCode.
 * Those document identities must never replace the sales order identity when
 * calculating the current AR balance for an order.
 */

const BUSINESS_ORDER_SOURCE_TYPES = Object.freeze(new Set([
  'ORDER',
  'SALES_ORDER',
  'SALESORDER',
  'SALE_ORDER',
  'SALES_ORDER_DELIVERY_CLOSEOUT'
]));

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function first(values = []) {
  return (Array.isArray(values) ? values : []).map(clean).find(Boolean) || '';
}

function unique(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(clean).filter(Boolean)));
}

function isBusinessOrderSourceType(value = '') {
  return BUSINESS_ORDER_SOURCE_TYPES.has(upper(value));
}

function sourceOrderAliases(source = {}) {
  if (!isBusinessOrderSourceType(source.sourceType)) return [];
  return [source.sourceId, source.sourceCode];
}

function resolveCanonicalArOrderIdentity(input = {}) {
  const order = input.order && typeof input.order === 'object' ? input.order : {};
  const allocation = input.allocation && typeof input.allocation === 'object' ? input.allocation : {};
  const explicit = input.identity && typeof input.identity === 'object' ? input.identity : {};

  const orderId = first([
    explicit.salesOrderId,
    explicit.orderId,
    order.salesOrderId,
    order.orderId,
    order.id,
    order._id,
    allocation.salesOrderId,
    allocation.orderId
  ]);
  const orderCode = first([
    explicit.salesOrderCode,
    explicit.orderCode,
    order.salesOrderCode,
    order.orderCode,
    order.code,
    order.documentCode,
    order.invoiceCode,
    allocation.salesOrderCode,
    allocation.orderCode
  ]);

  const allowedSourceAliases = unique([
    ...sourceOrderAliases(explicit),
    ...sourceOrderAliases(order),
    ...sourceOrderAliases(allocation)
  ]);
  const ignoredSourceAliases = unique([
    explicit.sourceId,
    explicit.sourceCode,
    order.sourceId,
    order.sourceCode,
    allocation.sourceId,
    allocation.sourceCode
  ]).filter((value) => !allowedSourceAliases.includes(value));

  const lookupKeys = unique([
    orderId,
    orderCode,
    explicit.salesOrderId,
    explicit.orderId,
    explicit.salesOrderCode,
    explicit.orderCode,
    order.salesOrderId,
    order.orderId,
    order.id,
    order._id,
    order.salesOrderCode,
    order.orderCode,
    order.code,
    allocation.salesOrderId,
    allocation.orderId,
    allocation.salesOrderCode,
    allocation.orderCode,
    ...allowedSourceAliases,
    ...(Array.isArray(input.extraOrderKeys) ? input.extraOrderKeys : [])
  ]).filter((value) => !ignoredSourceAliases.includes(value));

  return {
    orderId,
    orderCode,
    salesOrderId: first([explicit.salesOrderId, order.salesOrderId, allocation.salesOrderId, orderId]),
    salesOrderCode: first([explicit.salesOrderCode, order.salesOrderCode, allocation.salesOrderCode, orderCode]),
    lookupKeys,
    ignoredSourceAliases,
    sourceType: first([explicit.sourceType, allocation.sourceType, order.sourceType])
  };
}

function buildCanonicalArOrderLookupKeys(input = {}) {
  return resolveCanonicalArOrderIdentity(input).lookupKeys;
}

module.exports = {
  BUSINESS_ORDER_SOURCE_TYPES,
  isBusinessOrderSourceType,
  resolveCanonicalArOrderIdentity,
  buildCanonicalArOrderLookupKeys,
  _internal: { clean, upper, first, unique, sourceOrderAliases }
};
