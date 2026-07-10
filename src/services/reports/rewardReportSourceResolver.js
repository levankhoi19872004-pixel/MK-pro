'use strict';

const { toNumber } = require('../../utils/common.util');

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function valueAt(source = {}, field = '') {
  return String(field || '').split('.').reduce((current, key) => current?.[key], source);
}

function hasValue(source = {}, field = '') {
  const value = valueAt(source, field);
  return value !== undefined && value !== null && text(value) !== '';
}

function positiveNumber(source = {}, fields = []) {
  for (const field of Array.isArray(fields) ? fields : []) {
    if (!hasValue(source, field)) continue;
    const value = Math.max(0, toNumber(valueAt(source, field)));
    if (value > 0) return { amount: value, field };
  }
  return { amount: 0, field: '' };
}

const ORDER_REWARD_FIELDS = Object.freeze([
  'deliveryCloseout.rewardAmount',
  'deliveryCloseout.reward',
  'rewardAmount',
  'bonusAmount',
  'allowanceAmount',
  'promotionRewardAmount',
  'displayRewardAmount',
  'bonusReturnAmount',
  'rewardOffsetAmount',
  'promotionOffsetAmount',
  'deliveryCloseout.offsetAmount',
  'offsetAmount',
  'debtOffsetAmount',
  'deliveryOffsetAmount',
  'otherOffsetAmount'
]);

const VERSION_REWARD_FIELDS = Object.freeze([
  'rewardAmount',
  'adjustedRewardAmount',
  'finalRewardAmount',
  'rewardAfterAdjustment',
  'rewardDeltaAmount'
]);

const ALLOCATION_REWARD_FIELDS = Object.freeze([
  'rewardAmount',
  'rewardAllowanceAmount',
  'rewardOffsetAmount',
  'metadata.rewardAmount',
  'diagnostic.rewardAmount'
]);

const INACTIVE_ALLOCATION_STATUSES = new Set(['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'inactive', 'stale']);
const INACTIVE_VERSION_STATUSES = new Set(['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'inactive']);

function orderIdentityKeys(row = {}) {
  return Array.from(new Set([
    row._id,
    row.id,
    row.code,
    row.documentCode,
    row.invoiceCode,
    row.orderCode,
    row.salesOrderId,
    row.salesOrderCode,
    row.sourceOrderId,
    row.sourceOrderCode,
    row.deliveryOrderId,
    row.deliveryOrderCode,
    row.sourceId,
    row.sourceCode
  ].map(text).filter(Boolean)));
}

function canonicalOrderKey(row = {}) {
  return orderIdentityKeys(row)[0] || '';
}

function isCorrectionCode(value = '') {
  return /^(DCOC|DCOA|DCOV)[-_]/i.test(text(value));
}

function allocationOrderKeys(row = {}) {
  return Array.from(new Set([
    row.orderId,
    row.orderCode,
    row.salesOrderId,
    row.salesOrderCode,
    row.originalOrderId,
    row.originalOrderCode,
    row.sourceOrderId,
    row.sourceOrderCode,
    // sourceId/sourceCode may point at DCOC/DCOA/DCOV. Keep them for lookup only;
    // canonical order identity is still orderId/orderCode when available.
    row.sourceId,
    row.sourceCode
  ].map(text).filter(Boolean)));
}

function versionOrderKeys(row = {}) {
  return Array.from(new Set([
    row.orderId,
    row.orderCode,
    row.salesOrderId,
    row.salesOrderCode,
    row.originalOrderId,
    row.originalOrderCode,
    row.sourceOrderId,
    row.sourceOrderCode,
    row.originalCloseoutId,
    row.originalCloseoutCode
  ].map(text).filter(Boolean)));
}

function isInactiveAllocation(row = {}) {
  if (!row) return true;
  if (row.isCurrent === false || row.current === false || row.isLatest === false) return true;
  if (row.stale === true || row.isStale === true || row.superseded === true) return true;
  return INACTIVE_ALLOCATION_STATUSES.has(lower(row.status));
}

function isInactiveVersion(row = {}) {
  if (!row) return true;
  if (row.isLatest === false || row.current === false) return true;
  if (row.immutable === false && lower(row.status) === 'draft') return true;
  return INACTIVE_VERSION_STATUSES.has(lower(row.status));
}

function versionNo(row = {}) {
  return Number(row.sourceVersion || row.closeoutVersion || row.version || row.originalCloseoutVersion || 0) || 0;
}

function timeKey(row = {}) {
  return text(row.postedAt || row.updatedAt || row.createdAt || row._id || '');
}

function isBetterAllocation(candidate = {}, current = null) {
  if (!current) return true;
  const cv = versionNo(candidate);
  const rv = versionNo(current);
  if (cv !== rv) return cv > rv;
  return timeKey(candidate) > timeKey(current);
}

function isBetterVersion(candidate = {}, current = null) {
  if (!current) return true;
  const cv = versionNo(candidate);
  const rv = versionNo(current);
  if (cv !== rv) return cv > rv;
  return timeKey(candidate) > timeKey(current);
}

function allocationIsCurrentForVersion(allocation = null, latestVersion = null) {
  if (!allocation || isInactiveAllocation(allocation)) return false;
  if (!latestVersion || isInactiveVersion(latestVersion)) return true;
  const allocationVersion = versionNo(allocation);
  const latestCorrectionVersion = versionNo(latestVersion);
  if (latestCorrectionVersion > allocationVersion) return false;
  return true;
}

function rewardAmountFromOrder(order = {}) {
  return positiveNumber(order, ORDER_REWARD_FIELDS);
}

function rewardAmountFromVersion(version = {}) {
  return positiveNumber(version, VERSION_REWARD_FIELDS);
}

function rewardAmountFromAllocation(allocation = {}) {
  return positiveNumber(allocation, ALLOCATION_REWARD_FIELDS);
}

function resolveRewardSource(input = {}) {
  const order = input.order || {};
  const latestCloseoutVersion = input.latestCloseoutVersion || null;
  const currentPaymentAllocation = input.currentPaymentAllocation || null;
  const warnings = [];

  const orderReward = rewardAmountFromOrder(order);
  const versionReward = latestCloseoutVersion && !isInactiveVersion(latestCloseoutVersion)
    ? rewardAmountFromVersion(latestCloseoutVersion)
    : { amount: 0, field: '' };
  const allocationIsCurrent = allocationIsCurrentForVersion(currentPaymentAllocation, latestCloseoutVersion);
  const allocationReward = allocationIsCurrent
    ? rewardAmountFromAllocation(currentPaymentAllocation)
    : { amount: 0, field: '' };

  if (currentPaymentAllocation && !allocationIsCurrent) {
    warnings.push({
      code: 'STALE_ORDER_PAYMENT_ALLOCATION_IGNORED',
      allocationCode: text(currentPaymentAllocation.allocationCode),
      allocationVersion: versionNo(currentPaymentAllocation),
      latestCloseoutVersion: latestCloseoutVersion ? versionNo(latestCloseoutVersion) : null
    });
  }
  if (currentPaymentAllocation && (isCorrectionCode(currentPaymentAllocation.sourceId) || isCorrectionCode(currentPaymentAllocation.sourceCode)) && !text(currentPaymentAllocation.orderId || currentPaymentAllocation.orderCode || currentPaymentAllocation.salesOrderId || currentPaymentAllocation.salesOrderCode)) {
    warnings.push({
      code: 'ALLOCATION_CORRECTION_SOURCE_WITHOUT_ORDER_IDENTITY',
      sourceId: text(currentPaymentAllocation.sourceId),
      sourceCode: text(currentPaymentAllocation.sourceCode)
    });
  }

  let selected = {
    rewardAmount: 0,
    rewardSource: '',
    rewardSourcePriority: 0,
    selectedField: ''
  };

  if (allocationReward.amount > 0) {
    selected = {
      rewardAmount: allocationReward.amount,
      rewardSource: `orderPaymentAllocations.current.${allocationReward.field}`,
      rewardSourcePriority: 1,
      selectedField: allocationReward.field
    };
  } else if (versionReward.amount > 0) {
    selected = {
      rewardAmount: versionReward.amount,
      rewardSource: `deliveryCloseoutVersions.latest.${versionReward.field}`,
      rewardSourcePriority: 2,
      selectedField: versionReward.field
    };
  } else if (orderReward.amount > 0 && String(orderReward.field || '').startsWith('deliveryCloseout.')) {
    selected = {
      rewardAmount: orderReward.amount,
      rewardSource: `orders.${orderReward.field}`,
      rewardSourcePriority: 3,
      selectedField: orderReward.field
    };
  } else if (orderReward.amount > 0) {
    selected = {
      rewardAmount: orderReward.amount,
      rewardSource: `orders.${orderReward.field}`,
      rewardSourcePriority: 4,
      selectedField: orderReward.field
    };
  }

  return {
    ...selected,
    sourceBreakdown: {
      orderKey: canonicalOrderKey(order),
      orderCode: text(order.code || order.orderCode || order.salesOrderCode),
      orderRewardAmount: orderReward.amount,
      orderRewardField: orderReward.field,
      latestVersionRewardAmount: versionReward.amount,
      latestVersionRewardField: versionReward.field,
      latestVersionNo: latestCloseoutVersion ? versionNo(latestCloseoutVersion) : null,
      allocationRewardAmount: allocationReward.amount,
      allocationRewardField: allocationReward.field,
      allocationCode: currentPaymentAllocation ? text(currentPaymentAllocation.allocationCode) : '',
      allocationVersion: currentPaymentAllocation ? versionNo(currentPaymentAllocation) : null,
      allocationCurrent: allocationIsCurrent,
      selectedRewardAmount: selected.rewardAmount,
      selectedRewardSource: selected.rewardSource,
      selectedRewardPriority: selected.rewardSourcePriority,
      priorityPolicy: [
        'orderPaymentAllocations.current.rewardAmount',
        'deliveryCloseoutVersions.latest.rewardAmount',
        'orders.deliveryCloseout.rewardAmount',
        'orders.rewardAmount fallback'
      ]
    },
    warnings
  };
}

function buildLookup(rows = [], keyFn, betterFn) {
  const lookup = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const keys = keyFn(row);
    for (const key of keys) {
      const current = lookup.get(key);
      if (!current || betterFn(row, current)) lookup.set(key, row);
    }
  }
  return lookup;
}

function buildAllocationLookup(rows = []) {
  return buildLookup((rows || []).filter((row) => !isInactiveAllocation(row)), allocationOrderKeys, isBetterAllocation);
}

function buildCloseoutVersionLookup(rows = []) {
  return buildLookup((rows || []).filter((row) => !isInactiveVersion(row)), versionOrderKeys, isBetterVersion);
}

function findRelatedByOrder(order = {}, lookup = new Map()) {
  for (const key of orderIdentityKeys(order)) {
    const value = lookup.get(key);
    if (value) return value;
  }
  return null;
}

module.exports = {
  ORDER_REWARD_FIELDS,
  VERSION_REWARD_FIELDS,
  ALLOCATION_REWARD_FIELDS,
  orderIdentityKeys,
  canonicalOrderKey,
  allocationOrderKeys,
  versionOrderKeys,
  isInactiveAllocation,
  isInactiveVersion,
  allocationIsCurrentForVersion,
  rewardAmountFromOrder,
  rewardAmountFromVersion,
  rewardAmountFromAllocation,
  resolveRewardSource,
  buildAllocationLookup,
  buildCloseoutVersionLookup,
  findRelatedByOrder
};
