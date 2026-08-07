'use strict';

const DEFAULT_CHUNK_SIZE = 100;
const MAX_CHUNK_SIZE = 200;
const ACTIVE_EXCLUDED_STATUSES = ['reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed', 'superseded'];

function text(value = '') {
  return String(value ?? '').trim();
}

function unique(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean)));
}

function chunk(values = [], size = DEFAULT_CHUNK_SIZE) {
  const bounded = Math.max(1, Math.min(MAX_CHUNK_SIZE, Number(size || DEFAULT_CHUNK_SIZE)));
  const rows = [];
  for (let index = 0; index < values.length; index += bounded) rows.push(values.slice(index, index + bounded));
  return rows;
}

function enabledValue(value) {
  if (value === true || value === 1) return true;
  return ['1', 'true', 'on', 'yes', 'enabled'].includes(text(value).toLowerCase());
}

function isEnabled(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'batchContextEnabled')) return enabledValue(options.batchContextEnabled);
  if (options.featureFlags && Object.prototype.hasOwnProperty.call(options.featureFlags, 'PERF_BULK_BATCH_CONTEXT_V1')) {
    return enabledValue(options.featureFlags.PERF_BULK_BATCH_CONTEXT_V1);
  }
  return enabledValue(process.env.PERF_BULK_BATCH_CONTEXT_V1);
}

function failurePolicy(options = {}) {
  const configured = text(options.batchContextFailurePolicy || process.env.PERF_BULK_BATCH_CONTEXT_FAILURE_POLICY || 'fail_request').toLowerCase();
  return configured === 'fallback_legacy' ? 'fallback_legacy' : 'fail_request';
}

function targetRefs(target = {}) {
  return unique([
    target.orderCode, target.salesOrderCode, target.code,
    target.orderId, target.salesOrderId, target.id,
    target.originalCloseoutId, target.closeoutId
  ]);
}

function orderRefs(order = {}) {
  const closeout = order.deliveryCloseout && typeof order.deliveryCloseout === 'object' ? order.deliveryCloseout : {};
  return unique([
    order.id, order._id, order.code, order.orderCode, order.salesOrderCode,
    order.documentCode, order.invoiceCode, order.salesOrderId,
    closeout.id, closeout.code, closeout.closeoutId, closeout.closeoutCode,
    closeout.originalCloseoutId, closeout.originalCloseoutCode
  ]);
}

function canonicalOrderKey(order = {}) {
  return text(order.id || order._id || order.orderId || order.salesOrderId || order.code || order.orderCode || order.salesOrderCode);
}

function rowRefs(row = {}) {
  return unique([
    row.id, row._id, row.code,
    row.orderId, row.salesOrderId, row.sourceOrderId, row.originalOrderId, row.deliveryOrderId,
    row.orderCode, row.salesOrderCode, row.sourceOrderCode, row.originalOrderCode, row.deliveryOrderCode,
    row.sourceId, row.sourceCode, row.refId, row.refCode,
    row.originalCloseoutId, row.originalCloseoutCode, row.closeoutId, row.closeoutCode,
    row.canonicalOrderId, row.canonicalOrderCode, row.canonicalOrderKey, row.orderKey,
    row.metadata && row.metadata.orderId,
    row.metadata && row.metadata.salesOrderId,
    row.metadata && row.metadata.orderCode,
    row.metadata && row.metadata.salesOrderCode
  ]);
}

function matchesOrder(row = {}, order = {}) {
  const keys = new Set(orderRefs(order));
  return rowRefs(row).some((value) => keys.has(value));
}


function buildRowsByRef(rows = []) {
  const index = new Map();
  for (const row of rows || []) {
    for (const ref of rowRefs(row)) {
      if (!index.has(ref)) index.set(ref, []);
      index.get(ref).push(row);
    }
  }
  return index;
}

function rowsForOrder(index = new Map(), order = {}) {
  const found = new Map();
  for (const ref of orderRefs(order)) {
    for (const row of index.get(ref) || []) {
      const key = text(row._id || row.id || row.idempotencyKey || JSON.stringify(row));
      if (!found.has(key)) found.set(key, row);
    }
  }
  return [...found.values()];
}

function latestByOrder(rows = [], orders = [], versionFields = []) {
  const map = new Map();
  const index = buildRowsByRef(rows);
  for (const order of orders) {
    const candidates = rowsForOrder(index, order);
    candidates.sort((left, right) => {
      for (const field of versionFields) {
        const delta = Number(right[field] || 0) - Number(left[field] || 0);
        if (delta) return delta;
      }
      const rightTime = Date.parse(right.updatedAt || right.postedAt || right.createdAt || 0) || 0;
      const leftTime = Date.parse(left.updatedAt || left.postedAt || left.createdAt || 0) || 0;
      return rightTime - leftTime;
    });
    map.set(canonicalOrderKey(order), candidates[0] || null);
  }
  return map;
}

function buildOrderLookup(refs = []) {
  const keys = unique(refs);
  return {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    status: { $nin: ACTIVE_EXCLUDED_STATUSES },
    $or: [
      { id: { $in: keys } }, { code: { $in: keys } }, { orderCode: { $in: keys } }, { salesOrderCode: { $in: keys } },
      { documentCode: { $in: keys } }, { invoiceCode: { $in: keys } },
      { 'deliveryCloseout.id': { $in: keys } }, { 'deliveryCloseout.code': { $in: keys } },
      { 'deliveryCloseout.closeoutId': { $in: keys } }, { 'deliveryCloseout.closeoutCode': { $in: keys } }
    ]
  };
}

function createMongoAdapter() {
  const SalesOrder = require('../../models/SalesOrder');
  const DeliveryCloseoutVersion = require('../../models/DeliveryCloseoutVersion');
  const ReturnOrder = require('../../models/ReturnOrder');
  const OrderPaymentAllocation = require('../../models/OrderPaymentAllocation');
  const DeliveryCloseoutCorrection = require('../../models/DeliveryCloseoutCorrection');
  const arLedgerReadService = require('../arLedgerRead.service');

  return {
    async batchFindOrders(refs) {
      if (!refs.length) return [];
      return SalesOrder.find(buildOrderLookup(refs)).lean();
    },
    async batchFindVersions(orders) {
      const refs = unique(orders.flatMap(orderRefs));
      if (!refs.length) return [];
      return DeliveryCloseoutVersion.find({
        status: { $nin: ACTIVE_EXCLUDED_STATUSES },
        $or: [
          { originalCloseoutId: { $in: refs } }, { originalCloseoutCode: { $in: refs } },
          { salesOrderId: { $in: refs } }, { salesOrderCode: { $in: refs } },
          { orderId: { $in: refs } }, { orderCode: { $in: refs } },
          { id: { $in: refs } }, { code: { $in: refs } }, { closeoutCode: { $in: refs } }
        ]
      }).sort({ closeoutVersion: -1, sourceVersion: -1, updatedAt: -1, createdAt: -1 }).lean();
    },
    async batchFindReturns(orders) {
      const refs = unique(orders.flatMap(orderRefs));
      if (!refs.length) return [];
      return ReturnOrder.find({
        deleted: { $ne: true },
        isDeleted: { $ne: true },
        $or: [
          { salesOrderId: { $in: refs } }, { orderId: { $in: refs } }, { sourceOrderId: { $in: refs } },
          { originalOrderId: { $in: refs } }, { deliveryOrderId: { $in: refs } },
          { salesOrderCode: { $in: refs } }, { orderCode: { $in: refs } }, { sourceOrderCode: { $in: refs } },
          { originalOrderCode: { $in: refs } }, { deliveryOrderCode: { $in: refs } },
          { code: { $in: refs.map((ref) => `RO-${String(ref).replace(/^RO[-_]?/i, '')}`) } }
        ]
      }).sort({ updatedAt: -1, createdAt: -1 }).lean();
    },
    async batchFindAllocations(orders) {
      const refs = unique(orders.flatMap(orderRefs));
      if (!refs.length) return [];
      return OrderPaymentAllocation.find({
        $or: [
          { orderId: { $in: refs } }, { orderCode: { $in: refs } },
          { sourceId: { $in: refs } }, { sourceCode: { $in: refs } }
        ]
      }).sort({ sourceVersion: -1, postedAt: -1, updatedAt: -1 }).lean();
    },
    async batchFindArContext(orders) {
      const refs = unique(orders.flatMap(orderRefs));
      if (!refs.length) return { inspection: null, idempotencyLedgers: [] };
      // arLedgerRead.service intentionally caps a single query at 1,000 rows.
      // Detect the cap and fail closed rather than silently building partial financial context.
      const inspectionLimit = 1000;
      const inspection = await arLedgerReadService.inspectActiveDebtReadModelLedgersByOrderKeys(
        refs,
        { status: 'all' },
        { limit: inspectionLimit }
      );
      if (Number(inspection && inspection.rawMatchedLedgerCount || 0) >= inspectionLimit
        || Number(inspection && inspection.canonicalMatchedLedgerCount || 0) >= inspectionLimit) {
        throw contextError('BULK_BATCH_CONTEXT_AR_LIMIT_REACHED', 'AR batch context chạm giới hạn an toàn và có thể bị tải thiếu; request đã bị chặn.', {
          inspectionLimit,
          rawMatchedLedgerCount: Number(inspection && inspection.rawMatchedLedgerCount || 0),
          canonicalMatchedLedgerCount: Number(inspection && inspection.canonicalMatchedLedgerCount || 0)
        });
      }
      const idempotencyLimit = 1000;
      const idempotencyLedgers = await arLedgerReadService.findArLedgerRowsByRawMatch({
        account: 'AR',
        category: 'AR-DEBT-ADJUSTMENT',
        active: { $ne: false }, reversed: { $ne: true }, isDeleted: { $ne: true }, deleted: { $ne: true },
        status: { $nin: ACTIVE_EXCLUDED_STATUSES },
        $or: [
          { orderId: { $in: refs } }, { salesOrderId: { $in: refs } },
          { orderCode: { $in: refs } }, { salesOrderCode: { $in: refs } },
          { sourceId: { $in: refs } }, { sourceCode: { $in: refs } },
          { refId: { $in: refs } }, { refCode: { $in: refs } }
        ]
      }, { limit: idempotencyLimit });
      if (idempotencyLedgers.length >= idempotencyLimit) {
        throw contextError('BULK_BATCH_CONTEXT_IDEMPOTENCY_LIMIT_REACHED', 'AR idempotency context chạm giới hạn an toàn và có thể bị tải thiếu; request đã bị chặn.', {
          idempotencyLimit,
          matchedLedgerCount: idempotencyLedgers.length
        });
      }
      return { inspection, idempotencyLedgers };
    },
    async batchFindCorrectionIdempotency(orders) {
      const refs = unique(orders.flatMap(orderRefs));
      if (!refs.length) return [];
      return DeliveryCloseoutCorrection.find({
        $or: [
          { salesOrderId: { $in: refs } }, { orderId: { $in: refs } },
          { salesOrderCode: { $in: refs } }, { orderCode: { $in: refs } },
          { originalCloseoutId: { $in: refs } }, { originalCloseoutCode: { $in: refs } }
        ]
      }).lean();
    }
  };
}

function inspectionForOrder(order = {}, batchInspection = null) {
  const refs = new Set(orderRefs(order));
  const canonicalLedgers = (batchInspection && batchInspection.canonicalLedgers || []).filter((row) => rowRefs(row).some((key) => refs.has(key)));
  const rawActiveConfirmedLedgers = (batchInspection && batchInspection.rawActiveConfirmedLedgers || []).filter((row) => rowRefs(row).some((key) => refs.has(key)));
  const excludedLedgers = (batchInspection && batchInspection.excludedLedgers || []).filter((row) => rowRefs(row).some((key) => refs.has(key)));
  const currentArBalance = canonicalLedgers.reduce((sum, row) => {
    const signed = Number(row.debit || row.debitAmount || 0) - Number(row.credit || row.creditAmount || 0);
    return sum + (Number.isFinite(signed) ? Math.round(signed) : 0);
  }, 0);
  return {
    lookupKeys: [...refs],
    rawMatchedLedgerCount: rawActiveConfirmedLedgers.length + excludedLedgers.length,
    rawActiveConfirmedLedgerCount: rawActiveConfirmedLedgers.length,
    canonicalMatchedLedgerCount: canonicalLedgers.length,
    excludedLedgerCount: excludedLedgers.length,
    canonicalLedgers,
    rawActiveConfirmedLedgers,
    excludedLedgers,
    currentArBalance,
    identity: { lookupKeys: [...refs], ignoredSourceAliases: [], sourceAliasesMatchingBusinessIdentity: [] }
  };
}

function contextError(code, message, data = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  error.data = data;
  return error;
}

async function loadBatchContext(targets = [], options = {}) {
  const adapter = options.batchContextAdapter || createMongoAdapter();
  const chunks = chunk(targets.map((target, inputPosition) => ({ target, inputPosition })), options.batchContextChunkSize);
  const itemByPosition = new Map();
  const canonicalPositions = new Map();
  const metrics = { chunks: chunks.length, batchFindOrders: 0, batchFindVersions: 0, batchFindReturns: 0, batchFindAllocations: 0, batchFindArContext: 0, batchFindCorrectionIdempotency: 0 };

  for (const group of chunks) {
    const refs = unique(group.flatMap(({ target }) => targetRefs(target)));
    metrics.batchFindOrders += 1;
    const orders = await adapter.batchFindOrders(refs);
    const resolved = group.map(({ target, inputPosition }) => {
      const wanted = new Set(targetRefs(target));
      const candidates = (orders || []).filter((candidate) => orderRefs(candidate).some((ref) => wanted.has(ref)));
      const candidatesByCanonicalKey = new Map(candidates.map((candidate) => [canonicalOrderKey(candidate), candidate]));
      if (!candidates.length) {
        throw contextError('BULK_BATCH_CONTEXT_ORDER_NOT_FOUND', 'Batch context không tìm thấy đầy đủ đơn đã chọn.', { inputPosition, refs: [...wanted] });
      }
      if (candidatesByCanonicalKey.has('')) {
        throw contextError('BULK_BATCH_CONTEXT_CANONICAL_IDENTITY_MISSING', 'Đơn trong batch thiếu canonical identity; request đã bị chặn.', { inputPosition, refs: [...wanted] });
      }
      if (candidatesByCanonicalKey.size > 1) {
        throw contextError('BULK_BATCH_CONTEXT_AMBIGUOUS_ORDER', 'Một input khớp nhiều canonical order; request đã bị chặn để tránh ghi nhầm đơn.', {
          inputPosition,
          refs: [...wanted],
          canonicalOrderKeys: [...candidatesByCanonicalKey.keys()]
        });
      }
      const order = candidatesByCanonicalKey.values().next().value;
      return { target, inputPosition, order };
    });
    const uniqueOrders = Array.from(new Map(resolved.map((row) => [canonicalOrderKey(row.order), row.order])).values());

    metrics.batchFindVersions += 1;
    const versions = await adapter.batchFindVersions(uniqueOrders);
    metrics.batchFindReturns += 1;
    const returns = await adapter.batchFindReturns(uniqueOrders);
    metrics.batchFindAllocations += 1;
    const allocations = await adapter.batchFindAllocations(uniqueOrders);
    metrics.batchFindArContext += 1;
    const arContext = await adapter.batchFindArContext(uniqueOrders);
    metrics.batchFindCorrectionIdempotency += 1;
    const corrections = await adapter.batchFindCorrectionIdempotency(uniqueOrders);

    const versionByOrder = latestByOrder(versions || [], uniqueOrders, ['closeoutVersion', 'sourceVersion', 'version']);
    const allocationByOrder = latestByOrder(allocations || [], uniqueOrders, ['sourceVersion', 'version']);
    const returnsByRef = buildRowsByRef(returns || []);
    const idempotencyByRef = buildRowsByRef(arContext && arContext.idempotencyLedgers || []);
    const correctionsByRef = buildRowsByRef(corrections || []);

    for (const row of resolved) {
      const key = canonicalOrderKey(row.order);
      const returnOrders = rowsForOrder(returnsByRef, row.order);
      const idempotencyLedgers = rowsForOrder(idempotencyByRef, row.order);
      const correctionsByIdempotencyKey = new Map(
        rowsForOrder(correctionsByRef, row.order).map((item) => [text(item.idempotencyKey), item]).filter(([idempotencyKey]) => idempotencyKey)
      );
      const positions = canonicalPositions.get(key) || [];
      positions.push(row.inputPosition);
      canonicalPositions.set(key, positions);
      itemByPosition.set(row.inputPosition, Object.freeze({
        complete: true,
        inputPosition: row.inputPosition,
        canonicalOrderKey: key,
        order: row.order,
        orderLoaded: true,
        latestVersion: versionByOrder.get(key) || null,
        latestVersionLoaded: true,
        returnOrders,
        returnOrdersLoaded: true,
        currentAllocation: allocationByOrder.get(key) || null,
        allocationLoaded: true,
        arBalanceDetails: inspectionForOrder(row.order, arContext && arContext.inspection),
        arContextLoaded: true,
        idempotencyLedgers,
        idempotencyLoaded: true,
        correctionsByIdempotencyKey,
        correctionIdempotencyLoaded: true
      }));
    }
  }

  for (const [key, positions] of canonicalPositions.entries()) {
    if (positions.length < 2) continue;
    for (const position of positions) {
      const current = itemByPosition.get(position);
      itemByPosition.set(position, Object.freeze({ ...current, duplicateCanonicalInput: true, duplicateInputPositions: [...positions] }));
    }
  }

  if (itemByPosition.size !== targets.length) {
    throw contextError('BULK_BATCH_CONTEXT_PARTIAL_LOAD', 'Batch context bị thiếu hoặc chỉ tải một phần; request đã bị chặn.', { expected: targets.length, loaded: itemByPosition.size });
  }

  return Object.freeze({
    complete: true,
    requestScoped: true,
    targetCount: targets.length,
    itemByPosition,
    canonicalPositions,
    metrics,
    loadedAt: new Date().toISOString()
  });
}

function itemForPosition(context, inputPosition) {
  if (!context || context.complete !== true || !(context.itemByPosition instanceof Map)) {
    throw contextError('BULK_BATCH_CONTEXT_INVALID', 'Batch context không hợp lệ hoặc chưa tải hoàn chỉnh.');
  }
  const item = context.itemByPosition.get(inputPosition);
  if (!item || item.complete !== true) {
    throw contextError('BULK_BATCH_CONTEXT_ITEM_MISSING', 'Không tìm thấy context đầy đủ cho vị trí input.', { inputPosition });
  }
  return item;
}

module.exports = {
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  isEnabled,
  failurePolicy,
  loadBatchContext,
  itemForPosition,
  _internal: {
    text, unique, chunk, targetRefs, orderRefs, rowRefs, canonicalOrderKey,
    matchesOrder, buildRowsByRef, rowsForOrder, latestByOrder, inspectionForOrder, buildOrderLookup, createMongoAdapter
  }
};
