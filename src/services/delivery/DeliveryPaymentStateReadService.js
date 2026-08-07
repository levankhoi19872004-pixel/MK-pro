'use strict';

const Identity = require('./financial/deliveryFinancialIdentity');
const Money = require('./financial/deliveryMoneyContract');
const ReturnStateReader = require('./financial/deliveryReturnStateReader');
const LatestStateBatchReader = require('./DeliveryFinancialLatestStateBatchReader');

const FINANCIAL_CONTRACT_VERSION = 'delivery-financial-v1';
const DEFAULT_MAX_ORDERS = 1000;
const DEFAULT_MAX_PAYMENT_CANDIDATES = 50000;

const CLOSEOUT_VERSION_HOT_PATH_PROJECTION = [
  '_id', 'id', 'code', 'tenantId',
  'salesOrderId', 'salesOrderCode', 'orderId', 'orderCode',
  'originalCloseoutId', 'originalCloseoutCode',
  'closeoutVersion', 'sourceVersion', 'version', 'status', 'active', 'isLatest',
  'createdAt', 'updatedAt',
  'originalAmount', 'saleAmount', 'receivableAmount',
  'returnedAmount', 'returnAmount',
  'cashAmount', 'newCashAmount', 'cashCollectedAmount',
  'bankAmount', 'newBankAmount', 'rewardAmount', 'newRewardAmount',
  'offsetAmount', 'newOffsetAmount',
  'rewardOffsetContractVersion', 'rewardOffsetSemantics', 'rewardOffsetTotalAmount',
  'collectedAmount', 'newCollectedAmount',
  'rawFinalDebtAmount', 'rawDebtAmount', 'finalDebtAmount', 'debtAmount',
  'correctionId', 'correctionCode'
].join(' ');

const PAYMENT_ALLOCATION_HOT_PATH_PROJECTION = [
  '_id', 'id', 'allocationCode', 'tenantId',
  'orderId', 'orderCode', 'salesOrderId', 'salesOrderCode', 'sourceId', 'sourceCode',
  'status', 'active', 'sourceVersion', 'version', 'postedAt', 'updatedAt', 'createdAt',
  'receivableAmount', 'cashAmount', 'bankAmount', 'rewardAmount', 'offsetAmount',
  'returnAmount', 'debtAmount', 'normalizedDebtAmount', 'rawDebtAmount'
].join(' ');

const INACTIVE_STATUSES = new Set([
  'reversed', 'reverse', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'inactive'
]);

const VERSION_NUMBER_FIELDS = Object.freeze(['closeoutVersion', 'sourceVersion', 'version']);
const ALLOCATION_VERSION_FIELDS = Object.freeze(['sourceVersion', 'version']);
const RETURN_SNAPSHOT_FIELDS = Object.freeze(['returnAmount', 'returnedAmount']);
const STORED_DEBT_FIELDS = Object.freeze([
  'rawDebtAmount', 'rawFinalDebtAmount', 'normalizedDebtAmount', 'finalDebtAmount', 'debtAmount'
]);

function text(value = '') {
  return Identity.text(value);
}

function money(value) {
  const parsed = Money.parseMoney(value);
  return parsed.valid ? parsed.value : 0;
}

function hasOwn(source = {}, key = '') {
  return Money.hasOwnValue(source, key);
}

function firstDefinedMoney(source = {}, keys = []) {
  return Money.firstDefinedMoney(source, keys);
}

function orderBusinessIds(order = {}) {
  return Identity.rawIdentityValues(order);
}

function allocationKeysForOrder(order = {}) {
  return Identity.rawIdentityValues(order);
}

function closeoutOf(order = {}) {
  return order.deliveryCloseout && typeof order.deliveryCloseout === 'object'
    ? order.deliveryCloseout
    : {};
}

function embeddedConfirmedCloseoutVersion(order = {}) {
  const closeout = closeoutOf(order);
  const embeddedVersion = versionNumber(closeout, VERSION_NUMBER_FIELDS);
  if (embeddedVersion <= 0) return 0;
  const status = normalizedStatus(closeout);
  const confirmed = order.accountingConfirmed === true
    || ['accounting_confirmed', 'confirmed', 'posted', 'corrected_confirmed'].includes(status);
  return confirmed ? embeddedVersion : 0;
}

function closeoutMoneyBreakdown(closeout = {}) {
  return Money.readPaymentBreakdown(closeout, { sourceName: 'salesOrders.deliveryCloseout', diagnostics: [] });
}

function deliveryOperationalMoneyBreakdown(order = {}) {
  return Money.readPaymentBreakdown(order, { sourceName: 'orders.top-level', diagnostics: [] });
}

function moneyBreakdownForOrder(order = {}) {
  const closeout = closeoutOf(order);
  const closeoutBreakdown = closeoutMoneyBreakdown(closeout);
  if (closeoutBreakdown.hasExplicitPayment) return closeoutBreakdown;
  return deliveryOperationalMoneyBreakdown(order);
}

function applyProjection(query, projection) {
  return query && projection && typeof query.select === 'function' ? query.select(projection) : query;
}

async function runLean(query) {
  return query && typeof query.lean === 'function' ? await query.lean() : await query;
}

function defaultModels() {
  return {
    DeliveryCloseoutVersion: require('../../models/DeliveryCloseoutVersion'),
    OrderPaymentAllocation: require('../../models/OrderPaymentAllocation'),
    ReturnOrder: require('../../models/ReturnOrder')
  };
}

function modelSetFromOptions(options = {}) {
  const provided = options.models || {};
  return {
    DeliveryCloseoutVersion: provided.DeliveryCloseoutVersion || require('../../models/DeliveryCloseoutVersion'),
    OrderPaymentAllocation: provided.OrderPaymentAllocation || require('../../models/OrderPaymentAllocation'),
    ReturnOrder: provided.ReturnOrder || require('../../models/ReturnOrder')
  };
}

function versionNumber(row = {}, fields = VERSION_NUMBER_FIELDS) {
  for (const field of fields) {
    const parsed = Money.parseMoney(row[field]);
    if (parsed.present && parsed.valid) return Math.max(0, parsed.value);
  }
  return 0;
}

function normalizedStatus(row = {}) {
  return text(row.status).toLowerCase();
}

function candidateIsEligible(row = {}) {
  if (!row || typeof row !== 'object') return false;
  if (row.active === false) return false;
  return !INACTIVE_STATUSES.has(normalizedStatus(row));
}

function candidateTimestamp(row = {}) {
  const raw = row.postedAt || row.updatedAt || row.createdAt || '';
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function sortCandidates(rows = [], fields = VERSION_NUMBER_FIELDS) {
  return [...rows].sort((left, right) => {
    const versionDelta = versionNumber(right, fields) - versionNumber(left, fields);
    if (versionDelta) return versionDelta;
    return candidateTimestamp(right) - candidateTimestamp(left);
  });
}

function attachIndex(map, rows = []) {
  Object.defineProperty(map, '_candidateIndex', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Identity.buildCandidateIndex(rows)
  });
  Object.defineProperty(map, '_rows', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: rows
  });
  return map;
}

function populateCompatibilityMap(rows = [], versionFields = VERSION_NUMBER_FIELDS) {
  const map = new Map();
  const sorted = sortCandidates(rows, versionFields);
  for (const row of sorted) {
    if (!candidateIsEligible(row)) continue;
    for (const entry of Identity.typedIdentityEntries(row)) {
      if (!map.has(entry.key)) map.set(entry.key, row);
      if (!map.has(entry.value)) map.set(entry.value, row);
    }
  }
  return attachIndex(map, rows);
}

function queryIdentityFilter(orders = []) {
  const ids = Array.from(new Set(orders.flatMap(Identity.rawIdentityValues)));
  const tenantIds = Array.from(new Set(orders.map(Identity.tenantIdOf).filter(Boolean)));
  return { ids, tenantIds };
}

function applyTenantFilter(filter = {}, tenantIds = []) {
  if (tenantIds.length === 1) filter.tenantId = tenantIds[0];
  else if (tenantIds.length > 1) filter.tenantId = { $in: tenantIds };
  return filter;
}

function dbNativeLatestStateEnabled(options = {}, model = null) {
  const explicit = options.dbNativeLatestState;
  const enabled = explicit === true || (explicit !== false && ['1', 'true', 'yes', 'on'].includes(text(process.env.PERF_DELIVERY_CANONICAL_FILTER_V1).toLowerCase()));
  return enabled && model && typeof model.aggregate === 'function';
}

function effectiveVersionsForOrders(orders = [], versionsByKey = new Map()) {
  const map = new Map();
  for (const order of orders || []) {
    const resolution = latestVersionResolution(order, versionsByKey);
    const effectiveVersion = Number(resolution.maxVersion || versionNumber(resolution.row || {}, VERSION_NUMBER_FIELDS) || 0);
    if (!effectiveVersion) continue;
    for (const raw of Identity.rawIdentityValues(order)) map.set(raw, effectiveVersion);
    for (const entry of Identity.typedIdentityEntries(order)) {
      map.set(entry.key, effectiveVersion);
      map.set(entry.value, effectiveVersion);
    }
  }
  return map;
}

function assertCandidateCap(rows = [], options = {}, label = 'payment') {
  const max = Number.isFinite(Number(options.maxPaymentCandidates))
    ? Number(options.maxPaymentCandidates)
    : DEFAULT_MAX_PAYMENT_CANDIDATES;
  if (rows.length <= max) return;
  const err = new Error(`${label} candidate count vượt giới hạn ${max}`);
  err.code = 'CANONICAL_FINANCIAL_PAYMENT_CANDIDATE_LIMIT_EXCEEDED';
  err.candidateCount = rows.length;
  err.maxCandidates = max;
  throw err;
}

async function loadLatestVersionsForOrders(orders = [], options = {}) {
  Identity.assertOrderBatch(orders, { maxOrders: options.maxOrders || DEFAULT_MAX_ORDERS });
  if (!orders.length) return attachIndex(new Map(), []);
  const modelSet = modelSetFromOptions(options);
  const DeliveryCloseoutVersion = modelSet.DeliveryCloseoutVersion;
  if (!DeliveryCloseoutVersion || typeof DeliveryCloseoutVersion.find !== 'function') {
    const err = new Error('Thiếu DeliveryCloseoutVersion model cho canonical financial resolver');
    err.code = 'CANONICAL_FINANCIAL_VERSION_MODEL_UNAVAILABLE';
    throw err;
  }
  const { ids, tenantIds } = queryIdentityFilter(orders);
  const match = applyTenantFilter({
    $or: [
      { salesOrderId: { $in: ids } },
      { salesOrderCode: { $in: ids } },
      { orderId: { $in: ids } },
      { orderCode: { $in: ids } },
      { originalCloseoutId: { $in: ids } },
      { originalCloseoutCode: { $in: ids } }
    ]
  }, tenantIds);
  if (dbNativeLatestStateEnabled(options, DeliveryCloseoutVersion)) {
    const rows = await LatestStateBatchReader.loadLatestVersionRows(DeliveryCloseoutVersion, match, {
      ...options,
      projection: CLOSEOUT_VERSION_HOT_PATH_PROJECTION
    });
    const map = populateCompatibilityMap(rows || [], VERSION_NUMBER_FIELDS);
    Object.defineProperty(map, '_dbNativeLatestState', { enumerable: false, value: true });
    Object.defineProperty(map, '_candidateRowsRead', { enumerable: false, value: (rows || []).length });
    return map;
  }
  let query = DeliveryCloseoutVersion.find(match);
  query = applyProjection(query, CLOSEOUT_VERSION_HOT_PATH_PROJECTION);
  if (query && typeof query.sort === 'function') {
    query = query.sort({ closeoutVersion: -1, sourceVersion: -1, version: -1, createdAt: -1 });
  }
  if (options.session && query && typeof query.session === 'function') query = query.session(options.session);
  const rows = (await runLean(query)) || [];
  assertCandidateCap(rows, options, 'closeout version');
  return populateCompatibilityMap(rows, VERSION_NUMBER_FIELDS);
}

function mapCandidatesForOrder(order = {}, map = new Map()) {
  if (map && map._candidateIndex instanceof Map) {
    return Identity.candidatesForOrder(order, map._candidateIndex);
  }
  const unique = new Map();
  for (const entry of Identity.typedIdentityEntries(order)) {
    const value = map.get(entry.key) || map.get(entry.value);
    const values = Array.isArray(value) ? value : (value ? [value] : []);
    values.forEach((row, index) => {
      if (!Identity.tenantCompatible(order, row)) return;
      const key = Identity.candidateIdentityKey(row, index);
      if (!unique.has(key)) unique.set(key, row);
    });
  }
  return Array.from(unique.values());
}

function latestVersionResolution(order = {}, versionsByKey = new Map()) {
  const eligible = sortCandidates(
    mapCandidatesForOrder(order, versionsByKey).filter(candidateIsEligible),
    VERSION_NUMBER_FIELDS
  );
  if (!eligible.length) return { row: null, ambiguous: false, candidates: [] };
  const maxVersion = versionNumber(eligible[0], VERSION_NUMBER_FIELDS);
  const latest = eligible.filter((row) => versionNumber(row, VERSION_NUMBER_FIELDS) === maxVersion);
  const identities = new Set(latest.map((row, index) => Identity.candidateIdentityKey(row, index)));
  return {
    row: identities.size === 1 ? latest[0] : null,
    ambiguous: identities.size > 1,
    candidates: latest,
    maxVersion
  };
}

function latestVersionForOrder(order = {}, versionsByKey = new Map()) {
  return latestVersionResolution(order, versionsByKey).row;
}

async function loadAllocationsForOrders(orders = [], options = {}) {
  Identity.assertOrderBatch(orders, { maxOrders: options.maxOrders || DEFAULT_MAX_ORDERS });
  if (!orders.length) return attachIndex(new Map(), []);
  const modelSet = modelSetFromOptions(options);
  const OrderPaymentAllocation = modelSet.OrderPaymentAllocation;
  if (!OrderPaymentAllocation || typeof OrderPaymentAllocation.find !== 'function') {
    const err = new Error('Thiếu OrderPaymentAllocation model cho canonical financial resolver');
    err.code = 'CANONICAL_FINANCIAL_ALLOCATION_MODEL_UNAVAILABLE';
    throw err;
  }
  const { ids, tenantIds } = queryIdentityFilter(orders);
  const filter = applyTenantFilter({
    status: { $nin: Array.from(INACTIVE_STATUSES) },
    $or: [
      { orderId: { $in: ids } },
      { orderCode: { $in: ids } },
      { salesOrderId: { $in: ids } },
      { salesOrderCode: { $in: ids } },
      { sourceId: { $in: ids } },
      { sourceCode: { $in: ids } }
    ]
  }, tenantIds);
  if (dbNativeLatestStateEnabled(options, OrderPaymentAllocation) && options.effectiveVersionsByIdentity instanceof Map) {
    const rows = await LatestStateBatchReader.loadAllocationRows(
      OrderPaymentAllocation,
      filter,
      orders,
      options.effectiveVersionsByIdentity,
      { ...options, projection: PAYMENT_ALLOCATION_HOT_PATH_PROJECTION }
    );
    const map = populateCompatibilityMap(rows || [], ALLOCATION_VERSION_FIELDS);
    Object.defineProperty(map, '_dbNativeLatestState', { enumerable: false, value: true });
    Object.defineProperty(map, '_candidateRowsRead', { enumerable: false, value: (rows || []).length });
    return map;
  }
  let query = OrderPaymentAllocation.find(filter);
  query = applyProjection(query, PAYMENT_ALLOCATION_HOT_PATH_PROJECTION);
  if (query && typeof query.sort === 'function') {
    query = query.sort({ sourceVersion: -1, version: -1, postedAt: -1, updatedAt: -1, createdAt: -1 });
  }
  if (options.session && query && typeof query.session === 'function') query = query.session(options.session);
  const rows = (await runLean(query)) || [];
  assertCandidateCap(rows, options, 'payment allocation');
  return populateCompatibilityMap(rows, ALLOCATION_VERSION_FIELDS);
}

function allocationResolutionForOrder(order = {}, allocationsByKey = new Map(), effectiveVersion = 0) {
  const candidates = sortCandidates(
    mapCandidatesForOrder(order, allocationsByKey).filter(candidateIsEligible),
    ALLOCATION_VERSION_FIELDS
  );
  if (!candidates.length) return { row: null, reason: 'ABSENT', candidates: [] };
  if (!effectiveVersion) {
    return { row: null, reason: 'VERSION_UNVERIFIED', candidates };
  }
  const exact = candidates.filter((row) => versionNumber(row, ALLOCATION_VERSION_FIELDS) === effectiveVersion);
  const identities = new Set(exact.map((row, index) => Identity.candidateIdentityKey(row, index)));
  if (identities.size > 1) return { row: null, reason: 'AMBIGUOUS', candidates: exact };
  if (exact.length === 1) return { row: exact[0], reason: 'CURRENT', candidates };
  const highest = versionNumber(candidates[0], ALLOCATION_VERSION_FIELDS);
  return { row: null, reason: highest < effectiveVersion ? 'STALE' : 'VERSION_MISMATCH', candidates };
}

function allocationForOrder(order = {}, allocationsByKey = new Map(), latestVersion = null) {
  const effectiveVersion = versionNumber(latestVersion || {}, VERSION_NUMBER_FIELDS);
  return allocationResolutionForOrder(order, allocationsByKey, effectiveVersion).row;
}

function allocationIsCurrentForVersion(allocation = null, latestVersion = null) {
  if (!candidateIsEligible(allocation)) return false;
  const effectiveVersion = versionNumber(latestVersion || {}, VERSION_NUMBER_FIELDS);
  const allocationVersion = versionNumber(allocation || {}, ALLOCATION_VERSION_FIELDS);
  return effectiveVersion > 0 && allocationVersion === effectiveVersion;
}

function latestVersionFinalState(latestVersion = null) {
  if (!latestVersion) return null;
  return {
    ...latestVersion,
    // Correction versions store final-state values. Keep the explicit field order
    // visible here because older regression contracts verify that deltas are never
    // replayed as current cash/bank/reward.
    cashAmount: latestVersion.cashAmount ?? latestVersion.newCashAmount ?? latestVersion.cashCollectedAmount,
    bankAmount: latestVersion.bankAmount ?? latestVersion.newBankAmount,
    rewardAmount: latestVersion.rewardAmount ?? latestVersion.newRewardAmount,
    offsetAmount: latestVersion.offsetAmount ?? latestVersion.newOffsetAmount,
    rewardOffsetContractVersion: latestVersion.rewardOffsetContractVersion,
    rewardOffsetSemantics: latestVersion.rewardOffsetSemantics,
    rewardOffsetTotalAmount: latestVersion.rewardOffsetTotalAmount,
    collectedAmount: latestVersion.collectedAmount ?? latestVersion.newCollectedAmount,
    receivableAmount: latestVersion.receivableAmount ?? latestVersion.originalAmount ?? latestVersion.saleAmount
  };
}

function legacyPaymentSource(order = {}, diagnostics = []) {
  const closeout = closeoutOf(order);
  const closeoutBreakdown = Money.readPaymentBreakdown(closeout, {
    diagnostics,
    sourceName: 'salesOrders.deliveryCloseout'
  });
  if (closeoutBreakdown.hasExplicitPayment) {
    return {
      source: closeout,
      sourceName: 'salesOrders.deliveryCloseout',
      breakdown: closeoutBreakdown,
      isLegacyFallback: true
    };
  }
  return {
    source: order,
    sourceName: 'orders.top-level',
    breakdown: Money.readPaymentBreakdown(order, { diagnostics, sourceName: 'orders.top-level' }),
    isLegacyFallback: true
  };
}

function readReceivableWithFallback(primary = {}, primaryName = '', order = {}, diagnostics = []) {
  const primaryValue = Money.readReceivableAmount(primary, {
    diagnostics,
    sourceName: primaryName
  });
  if (primaryValue.present) return primaryValue.value;
  const closeout = closeoutOf(order);
  const closeoutValue = Money.readReceivableAmount(closeout, {
    diagnostics,
    sourceName: 'salesOrders.deliveryCloseout'
  });
  if (closeoutValue.present) return closeoutValue.value;
  return Money.readReceivableAmount(order, {
    diagnostics,
    sourceName: 'orders.top-level'
  }).value;
}

function stateIdentityKeys(state = {}) {
  return Array.from(new Set([
    ...Identity.typedIdentityEntries(state).map((entry) => entry.key),
    ...Identity.rawIdentityValues(state)
  ]));
}

function normalizeReturnStateInput(order = {}, returnInput = null) {
  if (!returnInput) return ReturnStateReader.resolveReturnStateForOrder(order, []);
  if (returnInput.returnAmount !== undefined && returnInput.returnStateSource) return returnInput;
  if (returnInput instanceof Map) return ReturnStateReader.returnStateForOrder(order, returnInput);
  if (returnInput.statesByIdentity instanceof Map) {
    return ReturnStateReader.returnStateForOrder(order, returnInput.statesByIdentity);
  }
  return ReturnStateReader.resolveReturnStateForOrder(order, []);
}

function snapshotDifferenceDiagnostics(source = {}, sourceName = '', canonical = {}, diagnostics = []) {
  const returnSnapshot = Money.readFirstMoney(source, RETURN_SNAPSHOT_FIELDS, {
    diagnostics,
    sourceName,
    component: 'returnSnapshotAmount',
    nonNegative: true
  });
  if (returnSnapshot.present && returnSnapshot.value !== canonical.returnAmount) {
    diagnostics.push({
      code: 'RETURN_SNAPSHOT_DIFF', source: sourceName,
      snapshotAmount: returnSnapshot.value, canonicalAmount: canonical.returnAmount,
      differenceAmount: returnSnapshot.value - canonical.returnAmount
    });
  }
  const storedDebt = Money.readFirstMoney(source, STORED_DEBT_FIELDS, {
    diagnostics,
    sourceName,
    component: 'storedDebtAmount'
  });
  if (storedDebt.present && Math.abs(storedDebt.value - canonical.debtRaw) > canonical.zeroTolerance) {
    diagnostics.push({
      code: 'STORED_DEBT_DIFF', source: sourceName,
      storedDebtAmount: storedDebt.value, canonicalDebtRaw: canonical.debtRaw,
      differenceAmount: storedDebt.value - canonical.debtRaw
    });
  }
}

function buildCanonicalDeliveryFinancialState(order = {}, loadedContext = {}, options = {}) {
  const diagnostics = [];
  const versionResolution = loadedContext.versionResolution
    || latestVersionResolution(order, loadedContext.versionsByKey || new Map());
  if (versionResolution.ambiguous) {
    diagnostics.push({ code: 'DUPLICATE_PAYMENT_IDENTITY', source: 'deliveryCloseoutVersions', version: versionResolution.maxVersion });
  }
  const latestVersion = versionResolution.row;
  const externalVersion = versionNumber(latestVersion || {}, VERSION_NUMBER_FIELDS);
  const embeddedVersion = externalVersion > 0 ? 0 : embeddedConfirmedCloseoutVersion(order);
  const effectiveVersion = externalVersion || embeddedVersion;
  if (embeddedVersion > 0) {
    diagnostics.push({ code: 'EMBEDDED_CLOSEOUT_VERSION_AUTHORITY', source: 'salesOrders.deliveryCloseout', version: embeddedVersion });
  }
  const allocationResolution = loadedContext.allocationResolution
    || allocationResolutionForOrder(order, loadedContext.allocationsByKey || new Map(), effectiveVersion);
  if (allocationResolution.reason === 'STALE') diagnostics.push({ code: 'ALLOCATION_STALE' });
  if (allocationResolution.reason === 'VERSION_MISMATCH') diagnostics.push({ code: 'ALLOCATION_VERSION_MISMATCH' });
  if (allocationResolution.reason === 'VERSION_UNVERIFIED') diagnostics.push({ code: 'ALLOCATION_VERSION_UNVERIFIED' });
  if (allocationResolution.reason === 'AMBIGUOUS') diagnostics.push({ code: 'DUPLICATE_PAYMENT_IDENTITY', source: 'orderPaymentAllocations' });

  const postedAllocation = allocationResolution.row;
  let paymentSource;
  let paymentStateSource;
  let isLegacyFallback = false;

  if (postedAllocation) {
    paymentSource = postedAllocation;
    paymentStateSource = 'orderPaymentAllocations.current';
  } else if (latestVersion) {
    paymentSource = latestVersionFinalState(latestVersion);
    paymentStateSource = 'deliveryCloseoutVersions.latest';
  } else {
    const legacy = legacyPaymentSource(order, diagnostics);
    paymentSource = legacy.source;
    paymentStateSource = legacy.sourceName;
    isLegacyFallback = legacy.isLegacyFallback;
  }

  const breakdown = Money.readPaymentBreakdown(paymentSource, {
    diagnostics,
    sourceName: paymentStateSource
  });
  const receivableAmount = readReceivableWithFallback(
    paymentSource,
    paymentStateSource,
    order,
    diagnostics
  );
  const returnState = normalizeReturnStateInput(order, loadedContext.returnState || loadedContext.returnStatesByIdentity);
  diagnostics.push(...(returnState.diagnostics || []));

  const debt = Money.calculateDebt({
    receivableAmount,
    cashAmount: breakdown.cashAmount,
    bankAmount: breakdown.bankAmount,
    rewardAmount: breakdown.rewardAmount,
    offsetAmount: breakdown.offsetAmount,
    handledRewardOffsetAmount: breakdown.handledRewardOffsetAmount,
    returnAmount: returnState.returnAmount
  }, { zeroTolerance: options.zeroTolerance });

  if (debt.totalHandledAmount > receivableAmount) {
    diagnostics.push({
      code: 'TOTAL_HANDLED_EXCEEDS_RECEIVABLE',
      receivableAmount,
      totalHandledAmount: debt.totalHandledAmount,
      differenceAmount: debt.totalHandledAmount - receivableAmount
    });
  }
  snapshotDifferenceDiagnostics(paymentSource, paymentStateSource, {
    returnAmount: returnState.returnAmount,
    debtRaw: debt.debtRaw,
    zeroTolerance: debt.zeroTolerance
  }, diagnostics);

  const integrityStatus = diagnostics.some((row) => [
    'INVALID_MONEY', 'NEGATIVE_INPUT_COMPONENT', 'DUPLICATE_PAYMENT_IDENTITY',
    'AMBIGUOUS_LEGACY_REWARD_OFFSET', 'REWARD_OFFSET_CONTRACT_INCONSISTENT'
  ].includes(row.code))
    ? 'degraded'
    : (diagnostics.length ? 'warning' : 'ok');

  const state = {
    orderId: text(order.id || order._id || paymentSource.orderId || paymentSource.salesOrderId),
    orderCode: text(order.code || order.orderCode || order.salesOrderCode || paymentSource.orderCode || paymentSource.salesOrderCode),
    receivableAmount,
    cashAmount: breakdown.cashAmount,
    bankAmount: breakdown.bankAmount,
    rewardAmount: breakdown.rewardAmount,
    offsetAmount: breakdown.offsetAmount,
    handledRewardOffsetAmount: breakdown.handledRewardOffsetAmount,
    rewardOffsetClassification: breakdown.rewardOffsetClassification,
    rewardOffsetSemantic: breakdown.rewardOffsetSemantic,
    rewardOffsetEvidence: breakdown.rewardOffsetEvidence,
    rewardOffsetAmbiguous: breakdown.rewardOffsetAmbiguous,
    totalCollectedAmount: debt.totalCollectedAmount,
    collectedAmount: debt.totalCollectedAmount,
    returnAmount: returnState.returnAmount,
    totalHandledAmount: debt.totalHandledAmount,
    debtRaw: debt.debtRaw,
    debtAmount: debt.debtAmount,
    openDebtAmount: debt.openDebtAmount,
    overpaidAmount: debt.overpaidAmount,
    paymentVersion: postedAllocation
      ? versionNumber(postedAllocation, ALLOCATION_VERSION_FIELDS)
      : effectiveVersion,
    paymentStateSource,
    returnStateSource: returnState.returnStateSource || 'returnOrders',
    isLegacyFallback,
    financialContractVersion: FINANCIAL_CONTRACT_VERSION,
    integrityStatus,
    diagnostics,

    // Backward-compatible metadata used by existing readers until Gate 3 migration.
    source: { paymentState: paymentStateSource, returnState: returnState.returnStateSource || 'returnOrders' },
    latestCorrectionVersion: externalVersion,
    effectivePaymentVersion: effectiveVersion,
    paymentVersionAuthority: postedAllocation && embeddedVersion > 0 ? 'salesOrders.deliveryCloseout.version' : (externalVersion > 0 ? 'deliveryCloseoutVersions.latest' : ''),
    paymentAllocationCode: text(postedAllocation && (postedAllocation.allocationCode || postedAllocation.code || postedAllocation.id)),
    stalePaymentAllocationIgnored: allocationResolution.reason === 'STALE',
    latestVersion,
    rawPostedAllocation: allocationResolution.candidates && allocationResolution.candidates[0] || null,
    postedAllocation,
    returnOrderIds: returnState.returnOrderIds || [],
    zeroTolerance: debt.zeroTolerance,
    zeroToleranceApplied: debt.zeroToleranceApplied
  };
  return state;
}

function resolvePaymentStateForOrder(order = {}, versionsByKey = new Map(), allocationsByKey = new Map(), returnStatesByIdentity = null, options = {}) {
  // Compatibility: callers may pass options as the fourth argument.
  if (returnStatesByIdentity && !(returnStatesByIdentity instanceof Map)
      && !returnStatesByIdentity.statesByIdentity
      && returnStatesByIdentity.returnAmount === undefined) {
    options = returnStatesByIdentity;
    returnStatesByIdentity = null;
  }
  return buildCanonicalDeliveryFinancialState(order, {
    versionsByKey,
    allocationsByKey,
    returnStatesByIdentity
  }, options);
}

function stateForOrder(order = {}, statesByIdentity = new Map()) {
  for (const entry of Identity.typedIdentityEntries(order)) {
    const state = statesByIdentity.get(entry.key);
    if (state) return state;
  }
  for (const raw of Identity.rawIdentityValues(order)) {
    const state = statesByIdentity.get(raw);
    if (state) return state;
  }
  return resolvePaymentStateForOrder(order);
}

async function loadCanonicalReturnStatesForOrders(orders = [], options = {}) {
  return ReturnStateReader.loadCanonicalReturnStatesForOrders(orders, {
    ...options,
    models: modelSetFromOptions(options)
  });
}

async function resolvePaymentStatesForOrders(orders = [], options = {}) {
  Identity.assertOrderBatch(orders, { maxOrders: options.maxOrders || DEFAULT_MAX_ORDERS });
  if (!orders.length) {
    return {
      states: [],
      statesByIdentity: new Map(),
      versionsByKey: attachIndex(new Map(), []),
      allocationsByKey: attachIndex(new Map(), []),
      returnStatesByIdentity: new Map(),
      returnResult: ReturnStateReader.buildReturnStatesForOrders([], [])
    };
  }
  const models = modelSetFromOptions(options);
  const sharedOptions = { ...options, models };
  // Gate 2 keeps existing non-endpoint consumers backward compatible. Canonical
  // endpoint integration in Gate 3 must opt in explicitly so writer-adjacent readers
  // do not gain an unexpected returnOrders query or change behavior in this gate.
  const includeReturnState = options.includeReturnState === true;
  let versionsByKey;
  let allocationsByKey;
  let returnResult;
  if (options.dbNativeLatestState === true) {
    [versionsByKey, returnResult] = await Promise.all([
      loadLatestVersionsForOrders(orders, sharedOptions),
      includeReturnState
        ? ReturnStateReader.loadCanonicalReturnStatesForOrders(orders, sharedOptions)
        : Promise.resolve(ReturnStateReader.buildReturnStatesForOrders(orders, [], sharedOptions))
    ]);
    allocationsByKey = await loadAllocationsForOrders(orders, {
      ...sharedOptions,
      effectiveVersionsByIdentity: effectiveVersionsForOrders(orders, versionsByKey)
    });
  } else {
    [versionsByKey, allocationsByKey, returnResult] = await Promise.all([
      loadLatestVersionsForOrders(orders, sharedOptions),
      loadAllocationsForOrders(orders, sharedOptions),
      includeReturnState
        ? ReturnStateReader.loadCanonicalReturnStatesForOrders(orders, sharedOptions)
        : Promise.resolve(ReturnStateReader.buildReturnStatesForOrders(orders, [], sharedOptions))
    ]);
  }

  const states = orders.map((order) => buildCanonicalDeliveryFinancialState(order, {
    versionsByKey,
    allocationsByKey,
    returnStatesByIdentity: returnResult.statesByIdentity
  }, options));
  const statesByIdentity = new Map();
  states.forEach((state, index) => {
    const order = orders[index];
    for (const entry of Identity.typedIdentityEntries(order)) statesByIdentity.set(entry.key, state);
    for (const raw of Identity.rawIdentityValues(order)) statesByIdentity.set(raw, state);
    for (const key of stateIdentityKeys(state)) statesByIdentity.set(key, state);
  });
  return {
    states,
    statesByIdentity,
    versionsByKey,
    allocationsByKey,
    returnStatesByIdentity: returnResult.statesByIdentity,
    returnResult
  };
}

async function resolvePaymentStateForOneOrder(order = {}, options = {}) {
  const result = await resolvePaymentStatesForOrders([order], options);
  return result.states[0];
}

function returnRowsForOrder(order = {}, returnResult = {}) {
  const rowsIndex = returnResult && returnResult.rowsIndex ? returnResult.rowsIndex : returnResult;
  return ReturnStateReader.returnRowsForOrder(order, rowsIndex instanceof Map ? rowsIndex : new Map());
}

function applyDeliveryFinancialCompatibility(row = {}, state = {}, profile = 'default') {
  const financial = { ...state };
  const amounts = {
    ...(row.amounts && typeof row.amounts === 'object' ? row.amounts : {}),
    receivable: state.receivableAmount,
    totalReceivable: state.receivableAmount,
    cash: state.cashAmount,
    cashAmount: state.cashAmount,
    bank: state.bankAmount,
    bankAmount: state.bankAmount,
    reward: state.rewardAmount,
    rewardAmount: state.rewardAmount,
    offset: state.offsetAmount,
    offsetAmount: state.offsetAmount,
    returnAmount: state.returnAmount,
    debt: state.debtAmount,
    debtAmount: state.debtAmount,
    openDebtAmount: state.openDebtAmount,
    processed: state.totalHandledAmount
  };
  return {
    ...row,
    financial,
    amounts,
    receivableAmount: state.receivableAmount,
    totalReceivable: state.receivableAmount,
    cashAmount: state.cashAmount,
    cashCollected: state.cashAmount,
    bankAmount: state.bankAmount,
    bankCollected: state.bankAmount,
    transferAmount: state.bankAmount,
    rewardAmount: state.rewardAmount,
    bonusAmount: state.rewardAmount,
    displayRewardAmount: state.rewardAmount,
    offsetAmount: state.offsetAmount,
    returnAmount: state.returnAmount,
    returnedAmount: state.returnAmount,
    debtRaw: state.debtRaw,
    debtAmount: state.debtAmount,
    debt: state.debtAmount,
    remainingAmount: state.openDebtAmount,
    financialCompatibilityProfile: profile
  };
}

module.exports = {
  FINANCIAL_CONTRACT_VERSION,
  DEFAULT_MAX_ORDERS,
  resolvePaymentStatesForOrders,
  resolvePaymentStateForOneOrder,
  resolvePaymentStateForOrder,
  buildCanonicalDeliveryFinancialState,
  loadCanonicalReturnStatesForOrders,
  returnRowsForOrder,
  applyDeliveryFinancialCompatibility,
  stateForOrder,
  loadLatestVersionsForOrders,
  latestVersionForOrder,
  loadAllocationsForOrders,
  allocationForOrder,
  allocationIsCurrentForVersion,
  moneyBreakdownForOrder,
  orderBusinessIds,
  allocationKeysForOrder,
  _private: {
    money,
    text,
    hasOwn,
    firstDefinedMoney,
    closeoutMoneyBreakdown,
    deliveryOperationalMoneyBreakdown,
    versionNumber,
    candidateIsEligible,
    latestVersionResolution,
    allocationResolutionForOrder,
    latestVersionFinalState,
    populateCompatibilityMap,
    stateIdentityKeys,
    Money,
    Identity,
    ReturnStateReader,
    LatestStateBatchReader,
    effectiveVersionsForOrders,
    dbNativeLatestStateEnabled
  }
};
