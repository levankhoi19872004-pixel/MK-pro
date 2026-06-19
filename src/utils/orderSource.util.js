'use strict';

const { normalizeText } = require('./common.util');

const ORDER_SOURCE = Object.freeze({
  DMS: 'DMS',
  NVBH: 'NVBH'
});

const DMS_TOKENS = [
  'dms',
  'dms_import',
  'import dms',
  'import excel dms',
  'excel dms',
  'file dms',
  'don dms',
  'đơn dms',
  'tu dms',
  'từ dms',
  'unilever dms'
];

function normalizeOrderSourceValue(order = {}) {
  const raw = normalizeText([
    order.orderSource,
    order.source,
    order.sourceType,
    order.orderSourceName,
    order.importSource,
    order.importType,
    order.origin,
    order.note
  ].filter(Boolean).join(' '));
  if (DMS_TOKENS.some((token) => raw.includes(normalizeText(token)))) return ORDER_SOURCE.DMS;
  return ORDER_SOURCE.NVBH;
}

function isDmsOrder(order = {}) {
  return normalizeOrderSourceValue(order) === ORDER_SOURCE.DMS;
}

function applyOrderSourceFields(order = {}, forcedSource) {
  const source = forcedSource || normalizeOrderSourceValue(order);
  return {
    ...order,
    source,
    orderSource: source,
    sourceType: source === ORDER_SOURCE.DMS ? 'dms_import' : (order.sourceType || 'mobile_sales'),
    orderSourceName: source === ORDER_SOURCE.DMS ? 'Từ DMS' : 'Từ NVBH',
    isImported: source === ORDER_SOURCE.DMS ? true : Boolean(order.isImported)
  };
}

module.exports = {
  ORDER_SOURCE,
  normalizeOrderSourceValue,
  isDmsOrder,
  applyOrderSourceFields
};
