'use strict';

const dateUtil = require('../../utils/date.util');
const { toNumber } = require('../../utils/common.util');
const { isMongoObjectId } = require('../../utils/identity.util');

function text(value = '') {
  return String(value ?? '').trim();
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function dateOnly(value) {
  if (value instanceof Date) return dateUtil.dateKeyInTimeZone(value, dateUtil.VIETNAM_TIME_ZONE);
  return dateUtil.toDateOnly(value || '', '');
}

function normalizeDeliveryDateInput(input) {
  return dateUtil.normalizeDeliveryDateInput(input, dateUtil.VIETNAM_TIME_ZONE);
}

function displayDateFromDateKey(dateKey) {
  return dateUtil.displayDateFromDateKey(dateKey);
}

const SALES_ORDER_HOT_PATH_PROJECTION = [
  '_id', 'id', 'code', 'orderCode', 'salesOrderCode', 'documentCode', 'invoiceCode', 'sourceId', 'sourceCode',
  'customerCode', 'customerName', 'phone', 'customerPhone', 'phoneNumber',
  'salesStaffCode', 'salesStaffName', 'salesmanCode', 'salesmanName', 'nvbhCode', 'nvbhName',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
  'deliveryDate', 'deliveryDateKey', 'orderDate', 'createdAt', 'updatedAt',
  'masterOrderId', 'masterOrderCode', 'masterId', 'masterCode',
  'mergeStatus', 'isChildOrder',
  'totalAmount', 'amount', 'total', 'finalAmount', 'orderAmount',
  'cashAmount', 'cashCollected', 'bankAmount', 'bankCollected', 'transferAmount',
  'rewardAmount', 'bonusAmount', 'displayRewardAmount', 'offsetAmount',
  'status', 'deliveryStatus', 'lifecycleStatus', 'accountingStatus', 'accountingConfirmed',
  'deliveryCloseoutStatus', 'closeout', 'deliveryCloseout',
  'items', 'orderItems', 'soldItems', 'products', 'lines',
  'deleted', 'isDeleted', 'deleteMode', 'cancelled', 'canceled'
].join(' ');

const MASTER_ORDER_METADATA_PROJECTION = [
  '_id', 'id', 'code', 'masterOrderCode',
  'childOrderIds', 'childOrderCodes', 'orderCodes', 'salesOrderCodes',
  'deliveryStaffCode', 'deliveryStaffName', 'deliveryCode', 'deliveryName', 'nvghCode', 'nvghName',
  'status', 'deliveryStatus', 'accountingStatus',
  'updatedAt', 'createdAt', 'deleted', 'isDeleted'
].join(' ');

const INACTIVE_MASTER_STATUSES = new Set([
  'cancelled',
  'canceled',
  'void',
  'voided',
  'deleted',
  'removed',
  'duplicate_cancelled'
]);

function buildDateFilterDiagnostics(input) {
  const normalized = normalizeDeliveryDateInput(input);
  return {
    requestedDate: normalized.selectedDateKey || '',
    timezone: normalized.timezone,
    canonicalField: 'orders.deliveryDate',
    startInclusive: normalized.startInclusive || '',
    endExclusive: normalized.endExclusive || '',
    fallbackDateFieldsUsed: [],
    warnings: []
  };
}

function escapeRegExp(value = '') {
  return text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function activeOrderMatch() {
  return {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    deleteMode: { $nin: ['hard_deleted', 'deleted'] }
  };
}

function pushAnd(match, condition) {
  match.$and = Array.isArray(match.$and) ? match.$and : [];
  match.$and.push(condition);
}

function buildCanonicalDateCondition(dateFilter) {
  if (!dateFilter || !dateFilter.selectedDateKey) return null;
  const key = dateFilter.selectedDateKey;
  const display = displayDateFromDateKey(key);
  const keyPrefix = new RegExp(`^${escapeRegExp(key)}(?:T|\\s|$)`);
  const displayRx = display ? new RegExp(`^${escapeRegExp(display)}$`) : null;
  const or = [
    { deliveryDate: key },
    { deliveryDate: keyPrefix },
    { deliveryDateKey: key }
  ];
  if (displayRx) or.push({ deliveryDate: displayRx });
  if (dateFilter.startOfDayVN && dateFilter.endOfDayVN) {
    or.push({ deliveryDate: { $gte: dateFilter.startOfDayVN, $lt: dateFilter.endOfDayVN } });
  }
  return { $or: or };
}

function buildCanonicalSalesOrderMatch(query = {}, options = {}) {
  const match = activeOrderMatch();
  const dateFilter = normalizeDeliveryDateInput(query.date || query.deliveryDate);
  const dateCondition = buildCanonicalDateCondition(dateFilter);
  if (dateCondition) pushAnd(match, dateCondition);

  const q = text(query.q || query.search || query.keyword || query.orderCode || query.customerCode || query.customerName);
  if (q) {
    const rx = new RegExp(escapeRegExp(q), 'i');
    pushAnd(match, {
      $or: [
        { id: rx },
        { code: rx },
        { orderCode: rx },
        { salesOrderCode: rx },
        { customerCode: rx },
        { customerName: rx },
        { phone: rx },
        { customerPhone: rx },
        { phoneNumber: rx },
        { deliveryStaffCode: rx },
        { deliveryStaffName: rx },
        { salesStaffCode: rx },
        { salesStaffName: rx }
      ]
    });
  }

  const salesman = text(query.salesman || query.salesStaffCode || query.salesStaff || query.nvbh);
  if (salesman) {
    const rx = new RegExp(escapeRegExp(salesman), 'i');
    pushAnd(match, { $or: [{ salesStaffCode: rx }, { salesStaffName: rx }, { salesmanCode: rx }, { nvbhCode: rx }] });
  }

  // Delivery staff is intentionally not used as the primary DB predicate when a
  // date/search scope exists. Some canonical orders have missing deliveryStaff*
  // and can be enriched from masterOrders metadata after the orders read. This
  // keeps orders/salesOrders as the primary source while allowing metadata-only
  // assignment support.
  const delivery = text(query.delivery || query.deliveryStaffCode || query.deliveryStaff || query.nvgh);
  const hasOtherScope = Boolean(dateFilter.selectedDateKey || q || salesman || options.allowBroadDeliveryScan);
  if (delivery && !hasOtherScope) {
    const rx = new RegExp(escapeRegExp(delivery), 'i');
    pushAnd(match, { $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }, { deliveryCode: rx }, { nvghCode: rx }] });
  }

  return match;
}

function orderKeys(order = {}) {
  return Array.from(new Set([
    order.id,
    order._id,
    order.code,
    order.orderCode,
    order.salesOrderCode,
    order.documentCode,
    order.invoiceCode,
    order.sourceId,
    order.sourceCode
  ].map(text).filter(Boolean)));
}

function masterKeys(order = {}) {
  return Array.from(new Set([
    order.masterOrderId,
    order.masterOrderCode,
    order.masterId,
    order.masterCode
  ].map(text).filter(Boolean)));
}

function canonicalKey(value = '') {
  return text(value).toLowerCase();
}

function compactKeys(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean)));
}

function masterIdentityKeys(master = {}) {
  return compactKeys([master.id, master.code, master.masterOrderCode, master._id]);
}

function masterChildKeys(master = {}) {
  return compactKeys([
    ...(Array.isArray(master.childOrderIds) ? master.childOrderIds : []),
    ...(Array.isArray(master.childOrderCodes) ? master.childOrderCodes : []),
    ...(Array.isArray(master.orderCodes) ? master.orderCodes : []),
    ...(Array.isArray(master.salesOrderCodes) ? master.salesOrderCodes : [])
  ]);
}

function masterBindingId(master = {}) {
  return canonicalKey(master.id || master._id || master.code || master.masterOrderCode);
}

function isActiveMaster(master = {}) {
  if (!master || master.deleted === true || master.isDeleted === true) return false;
  const statuses = [master.status, master.deliveryStatus, master.accountingStatus]
    .map((value) => canonicalKey(value))
    .filter(Boolean);
  return !statuses.some((status) => INACTIVE_MASTER_STATUSES.has(status));
}

function orderDirectlyReferencesMaster(order = {}, master = {}) {
  const orderMasterKeys = new Set(masterKeys(order).map(canonicalKey));
  if (!orderMasterKeys.size) return false;
  return masterIdentityKeys(master).some((key) => orderMasterKeys.has(canonicalKey(key)));
}

function masterReferencesOrderChild(master = {}, order = {}) {
  const childKeys = new Set(masterChildKeys(master).map(canonicalKey));
  if (!childKeys.size) return false;
  return orderKeys(order).some((key) => childKeys.has(canonicalKey(key)));
}

function bindingConflict(code, masters = []) {
  return {
    code,
    masterRefs: (masters || []).map((master) => ({
      id: text(master && (master.id || master._id)),
      code: text(master && (master.code || master.masterOrderCode))
    }))
  };
}

function pushIndexedMaster(map, key, master) {
  const normalized = canonicalKey(key);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, []);
  map.get(normalized).push(master);
}

function uniqueMasters(rows = []) {
  const seen = new Set();
  const result = [];
  for (const master of rows || []) {
    const key = masterBindingId(master);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(master);
  }
  return result;
}

function buildMasterBindingIndexes(masterRows = []) {
  const mastersByIdentityKey = new Map();
  const mastersByChildKey = new Map();
  const activeMasters = (Array.isArray(masterRows) ? masterRows : []).filter(isActiveMaster);
  for (const master of activeMasters) {
    for (const key of masterIdentityKeys(master)) pushIndexedMaster(mastersByIdentityKey, key, master);
    for (const key of masterChildKeys(master)) pushIndexedMaster(mastersByChildKey, key, master);
  }
  return { mastersByIdentityKey, mastersByChildKey, activeMasters };
}

function emptyBinding(conflicts = []) {
  return { master: null, verified: false, source: 'none', conflicts };
}

function resolveMasterBindingForOrder(order = {}, candidate = {}) {
  const indexes = candidate && candidate.mastersByIdentityKey
    ? candidate
    : buildMasterBindingIndexes(Array.isArray(candidate) ? candidate : []);
  const directMatches = uniqueMasters(masterKeys(order)
    .flatMap((key) => indexes.mastersByIdentityKey.get(canonicalKey(key)) || [])
    .filter((master) => orderDirectlyReferencesMaster(order, master)));
  const childMatches = uniqueMasters(orderKeys(order)
    .flatMap((key) => indexes.mastersByChildKey.get(canonicalKey(key)) || [])
    .filter((master) => masterReferencesOrderChild(master, order)));
  const combined = uniqueMasters([...directMatches, ...childMatches]);

  if (directMatches.length && childMatches.length) {
    const directIds = new Set(directMatches.map(masterBindingId));
    const conflicting = childMatches.some((master) => !directIds.has(masterBindingId(master)));
    if (conflicting) return emptyBinding([bindingConflict('MASTER_ORDER_METADATA_IDENTITY_CONFLICT', combined)]);
  }

  if (combined.length > 1) return emptyBinding([bindingConflict('MASTER_ORDER_METADATA_BINDING_AMBIGUOUS', combined)]);
  if (directMatches.length === 1) return { master: directMatches[0], verified: true, source: 'direct-order-link', conflicts: [] };
  if (childMatches.length === 1) return { master: childMatches[0], verified: true, source: 'canonical-child-reference', conflicts: [] };
  return emptyBinding();
}

function queryChain(model, filter) {
  if (!model || typeof model.find !== 'function') throw new Error('SalesOrder model is required for canonical delivery-today reader');
  return model.find(filter);
}

async function executeLean(query) {
  if (!query) return [];
  if (typeof query.lean === 'function') return await query.lean();
  return await query;
}

function applySortLimit(query, sort, limit, session) {
  let q = query;
  if (q && typeof q.sort === 'function') q = q.sort(sort);
  if (q && typeof q.limit === 'function') q = q.limit(limit);
  if (session && q && typeof q.session === 'function') q = q.session(session);
  return q;
}

function applyProjection(query, projection) {
  if (query && projection && typeof query.select === 'function') return query.select(projection);
  return query;
}

function buildMasterMetadataLookupFilter(orders = []) {
  const childKeys = Array.from(new Set((Array.isArray(orders) ? orders : []).flatMap(orderKeys).filter(Boolean)));
  const directMasterKeys = Array.from(new Set((Array.isArray(orders) ? orders : []).flatMap(masterKeys).filter(Boolean)));
  const directMasterObjectIds = directMasterKeys.filter(isMongoObjectId);
  if (!childKeys.length && !directMasterKeys.length) {
    return { filter: null, childKeys, directMasterKeys, directMasterObjectIds };
  }
  const filter = {
    deleted: { $ne: true },
    isDeleted: { $ne: true },
    status: { $nin: Array.from(INACTIVE_MASTER_STATUSES) },
    deliveryStatus: { $nin: Array.from(INACTIVE_MASTER_STATUSES) },
    accountingStatus: { $nin: Array.from(INACTIVE_MASTER_STATUSES) },
    $or: [
      { childOrderIds: { $in: childKeys } },
      { childOrderCodes: { $in: childKeys } },
      { orderCodes: { $in: childKeys } },
      { salesOrderCodes: { $in: childKeys } }
    ]
  };
  if (directMasterKeys.length) {
    filter.$or.push(
      { id: { $in: directMasterKeys } },
      { code: { $in: directMasterKeys } },
      { masterOrderCode: { $in: directMasterKeys } }
    );
  }
  if (directMasterObjectIds.length) {
    filter.$or.push({ _id: { $in: directMasterObjectIds } });
  }
  return { filter, childKeys, directMasterKeys, directMasterObjectIds };
}

async function loadMasterOrderMetadata(orders = [], models = {}, options = {}) {
  const MasterOrder = models.MasterOrder;
  const empty = { metadataByOrderKey: new Map(), masterRows: [], bindingDiagnostics: { applied: 0, unbound: 0, conflicts: 0, sources: {} }, queryExecuted: false };
  if (!MasterOrder || typeof MasterOrder.find !== 'function' || !orders.length) return empty;
  const { filter, childKeys } = buildMasterMetadataLookupFilter(orders);
  if (!filter) return empty;
  let q = MasterOrder.find(filter);
  q = applyProjection(q, MASTER_ORDER_METADATA_PROJECTION);
  q = applySortLimit(q, { updatedAt: -1, createdAt: -1 }, Math.max(1000, childKeys.length * 2), options.session);
  const rows = await executeLean(q);
  const activeRows = (rows || []).filter(isActiveMaster);
  const indexes = buildMasterBindingIndexes(activeRows);
  const map = new Map();
  const bindingDiagnostics = { applied: 0, unbound: 0, conflicts: 0, sources: {} };
  for (const order of orders) {
    const binding = resolveMasterBindingForOrder(order, indexes);
    if (binding.verified) {
      bindingDiagnostics.applied += 1;
      bindingDiagnostics.sources[binding.source] = Number(bindingDiagnostics.sources[binding.source] || 0) + 1;
    } else {
      bindingDiagnostics.unbound += 1;
      if (binding.conflicts && binding.conflicts.length) bindingDiagnostics.conflicts += 1;
      bindingDiagnostics.sources.none = Number(bindingDiagnostics.sources.none || 0) + 1;
    }
    for (const orderKey of orderKeys(order)) {
      map.set(orderKey, binding);
    }
  }
  return { metadataByOrderKey: map, masterRows: activeRows, bindingDiagnostics, queryExecuted: true };
}

function metadataForOrder(order = {}, metadataByOrderKey = new Map()) {
  for (const key of orderKeys(order)) {
    const row = metadataByOrderKey.get(key);
    if (row) return row;
  }
  return null;
}

function deliveryAssignmentFromOrder(order = {}) {
  return {
    code: text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode),
    name: text(order.deliveryStaffName || order.deliveryName || order.nvghName)
  };
}

function normalizeBindingInput(binding = null) {
  if (!binding) return emptyBinding();
  if (Object.prototype.hasOwnProperty.call(binding, 'verified')) return {
    master: binding.master || null,
    verified: binding.verified === true,
    source: text(binding.source || 'none') || 'none',
    conflicts: Array.isArray(binding.conflicts) ? binding.conflicts : []
  };
  return emptyBinding([{ code: 'MASTER_ORDER_METADATA_UNVERIFIED_RAW_MASTER_REJECTED' }]);
}

function masterWarning(binding = {}) {
  const conflict = Array.isArray(binding.conflicts) && binding.conflicts.length ? binding.conflicts[0] : null;
  return conflict && conflict.code ? conflict.code : '';
}

function enrichOrderWithMasterMetadata(order = {}, bindingInput = null) {
  const binding = normalizeBindingInput(bindingInput);
  const master = binding.master;
  const orderDelivery = deliveryAssignmentFromOrder(order);
  const orderHasDelivery = Boolean(orderDelivery.code);
  const verifiedMasterDeliveryCode = binding.verified ? text(master && (master.deliveryStaffCode || master.deliveryCode || master.nvghCode)) : '';
  const verifiedMasterDeliveryName = binding.verified ? text(master && (master.deliveryStaffName || master.deliveryName || master.nvghName)) : '';
  if (!binding.verified || !master) {
    return {
      ...order,
      _canonicalPrimarySource: 'orders',
      _masterOrdersMetadataApplied: false,
      deliveryAssignmentSource: orderHasDelivery ? 'orders' : 'none',
      deliveryAssignmentVerified: orderHasDelivery,
      masterMetadataBindingWarning: masterWarning(binding),
      masterMetadataConflicts: binding.conflicts || []
    };
  }
  const deliveryStaffCode = text(order.deliveryStaffCode || order.deliveryCode || order.nvghCode) || text(master.deliveryStaffCode || master.deliveryCode || master.nvghCode);
  const deliveryStaffName = text(order.deliveryStaffName || order.deliveryName || order.nvghName) || text(master.deliveryStaffName || master.deliveryName || master.nvghName);
  const assignmentSource = orderHasDelivery ? 'orders' : `masterOrder.${binding.source}`;
  return {
    ...order,
    _canonicalPrimarySource: 'orders',
    _masterOrdersMetadataApplied: true,
    masterOrderId: text(order.masterOrderId || order.masterId || master.id || master._id || ''),
    masterOrderCode: text(order.masterOrderCode || order.masterCode || master.code || master.masterOrderCode || ''),
    deliveryStaffCode,
    deliveryStaffName,
    deliveryCode: text(order.deliveryCode || deliveryStaffCode),
    deliveryName: text(order.deliveryName || deliveryStaffName),
    nvghCode: text(order.nvghCode || deliveryStaffCode),
    nvghName: text(order.nvghName || deliveryStaffName),
    deliveryAssignmentSource: assignmentSource,
    deliveryAssignmentVerified: orderHasDelivery || Boolean(verifiedMasterDeliveryCode),
    masterMetadataBindingSource: binding.source,
    masterMetadataBindingWarning: '',
    masterMetadataConflicts: [],
    _verifiedMasterDeliveryStaffCode: verifiedMasterDeliveryCode,
    _verifiedMasterDeliveryStaffName: verifiedMasterDeliveryName
  };
}

function fieldMatches(value, needle) {
  if (!needle) return true;
  return text(value).toLowerCase().includes(text(needle).toLowerCase());
}

function deliveryMatches(order = {}, query = {}) {
  const delivery = text(query.delivery || query.deliveryStaffCode || query.deliveryStaff || query.nvgh);
  if (!delivery) return true;
  if (order.deliveryAssignmentVerified !== true) return false;
  const assignment = deliveryAssignmentFromOrder(order);
  return Boolean(assignment.code) && canonicalKey(assignment.code) === canonicalKey(delivery);
}

function canonicalDeliveryDateKey(row = {}) {
  return dateOnly(row.deliveryDate ?? row.deliveryDateKey ?? '');
}

function normalizeCanonicalOrder(row = {}, dateFilter = null) {
  const deliveryDateKey = canonicalDeliveryDateKey(row);
  const dateWarnings = [];
  if (!deliveryDateKey) dateWarnings.push('ORDER_MISSING_CANONICAL_DELIVERY_DATE');
  const requested = dateFilter && dateFilter.selectedDateKey ? dateFilter.selectedDateKey : '';
  const dateFilterMatched = requested ? deliveryDateKey === requested : true;
  if (requested && !dateFilterMatched) dateWarnings.push('ORDER_DELIVERY_DATE_MISMATCH');
  return {
    ...row,
    _canonicalPrimarySource: 'orders',
    id: text(row.id || row._id || row.orderId || row.code || row.orderCode || row.salesOrderCode),
    orderId: text(row.id || row._id || row.orderId || row.code || row.orderCode || row.salesOrderCode),
    code: text(row.code || row.orderCode || row.salesOrderCode || row.id || row._id),
    orderCode: text(row.orderCode || row.code || row.salesOrderCode || row.id || row._id),
    salesOrderCode: text(row.salesOrderCode || row.orderCode || row.code || row.id || row._id),
    deliveryDate: deliveryDateKey,
    deliveryDateDisplay: displayDateFromDateKey(deliveryDateKey),
    deliveryDateSource: deliveryDateKey ? 'orders.deliveryDate' : '',
    dateFilterMatched,
    dateWarnings,
    totalAmount: money(row.totalAmount ?? row.amount ?? row.total ?? row.finalAmount ?? row.orderAmount)
  };
}

async function listSalesOrders(query = {}, models = {}, options = {}) {
  const SalesOrder = models.SalesOrder;
  const limit = Math.max(1, Math.min(500, Number(query.limit || options.limit || 100)));
  const hasDeliveryFilter = Boolean(text(query.delivery || query.deliveryStaffCode || query.deliveryStaff || query.nvgh));
  const dateFilter = normalizeDeliveryDateInput(query.date || query.deliveryDate);
  const dbLimit = hasDeliveryFilter ? Math.min(2000, Math.max(limit * 5, 500)) : limit;
  const match = buildCanonicalSalesOrderMatch(query, { allowBroadDeliveryScan: Boolean(dateFilter.selectedDateKey) });
  let q = queryChain(SalesOrder, match);
  q = applyProjection(q, SALES_ORDER_HOT_PATH_PROJECTION);
  q = applySortLimit(q, { deliveryDate: -1, createdAt: -1 }, dbLimit, options.session);
  const rawRows = await executeLean(q);
  const normalizedRows = (Array.isArray(rawRows) ? rawRows : []).map((row) => normalizeCanonicalOrder(row, dateFilter));
  const dateFilteredRows = dateFilter.selectedDateKey
    ? normalizedRows.filter((row) => row.dateFilterMatched)
    : normalizedRows;
  const dateMismatchCount = normalizedRows.length - dateFilteredRows.length;
  const metadata = await loadMasterOrderMetadata(dateFilteredRows, models, options);
  const enriched = dateFilteredRows.map((row) => enrichOrderWithMasterMetadata(row, metadataForOrder(row, metadata.metadataByOrderKey)));
  const filtered = enriched.filter((row) => deliveryMatches(row, query)).slice(0, limit);
  const dateDiagnostics = buildDateFilterDiagnostics(query.date || query.deliveryDate);
  if (dateMismatchCount > 0) dateDiagnostics.warnings.push('ORDER_DELIVERY_DATE_MISMATCH_FILTERED');
  const missingDateCount = normalizedRows.filter((row) => Array.isArray(row.dateWarnings) && row.dateWarnings.includes('ORDER_MISSING_CANONICAL_DELIVERY_DATE')).length;
  if (missingDateCount > 0) dateDiagnostics.warnings.push('ORDER_MISSING_CANONICAL_DELIVERY_DATE');
  return {
    orders: filtered,
    diagnostics: {
      reader: 'deliveryTodayCanonicalOrderReader',
      primarySource: 'orders',
      orderSource: 'orders',
      masterOrdersRole: 'metadata-only',
      match,
      dbLimit,
      limit,
      queryCount: 1 + (metadata.queryExecuted ? 1 : 0),
      projection: 'sales-order-delivery-today-hot-path-v1',
      metadataProjection: 'master-order-delivery-metadata-v1',
      rawOrderCount: normalizedRows.length,
      dateFilteredOrderCount: dateFilteredRows.length,
      dateMismatchCount,
      missingCanonicalDeliveryDateCount: missingDateCount,
      returnedOrderCount: filtered.length,
      masterMetadataRows: metadata.masterRows.length,
      masterMetadataAppliedCount: enriched.filter((row) => row._masterOrdersMetadataApplied).length,
      masterMetadataUnboundCount: enriched.filter((row) => !row._masterOrdersMetadataApplied && row.deliveryAssignmentSource === 'none').length,
      masterMetadataConflictCount: enriched.filter((row) => row.masterMetadataBindingWarning).length,
      masterMetadataBindingSources: enriched.reduce((acc, row) => {
        const source = text(row.deliveryAssignmentSource || 'none') || 'none';
        acc[source] = Number(acc[source] || 0) + 1;
        return acc;
      }, {}),
      dateFilter: dateDiagnostics,
      warnings: Array.from(new Set([...(dateDiagnostics.warnings || [])]))
    }
  };
}

module.exports = {
  listSalesOrders,
  buildCanonicalSalesOrderMatch,
  buildMasterMetadataLookupFilter,
  loadMasterOrderMetadata,
  metadataForOrder,
  enrichOrderWithMasterMetadata,
  orderKeys,
  masterKeys,
  masterIdentityKeys,
  masterChildKeys,
  orderDirectlyReferencesMaster,
  masterReferencesOrderChild,
  resolveMasterBindingForOrder,
  buildMasterBindingIndexes,
  isActiveMaster,
  deliveryMatches,
  normalizeDeliveryDateInput,
  buildCanonicalDateCondition,
  canonicalDeliveryDateKey
};
