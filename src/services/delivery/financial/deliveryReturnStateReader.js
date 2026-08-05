'use strict';

const ReturnStateMachine = require('../../../domain/lifecycle/ReturnStateMachine');
const Identity = require('./deliveryFinancialIdentity');
const Money = require('./deliveryMoneyContract');

const RETURN_ORDER_PROJECTION = [
  '_id', 'id', 'code', 'tenantId',
  'salesOrderId', 'salesOrderCode', 'orderId', 'orderCode',
  'sourceOrderId', 'sourceOrderCode', 'deliveryOrderId', 'deliveryOrderCode',
  'status', 'returnStatus', 'returnState', 'warehouseReceiveStatus', 'accountingStatus',
  'arPosted', 'arPostedAt', 'deleted', 'isDeleted', 'deletedAt',
  'totalReturnAmount', 'returnAmount', 'totalAmount', 'amount', 'debtReduction',
  'items', 'returnItems', 'updatedAt', 'createdAt'
].join(' ');

const INCLUDED_STATES = new Set([
  ReturnStateMachine.RETURN_STATES.DRAFT,
  ReturnStateMachine.RETURN_STATES.WAITING_RECEIVE,
  ReturnStateMachine.RETURN_STATES.RECEIVED,
  ReturnStateMachine.RETURN_STATES.ACCOUNTING_CONFIRMED,
  ReturnStateMachine.RETURN_STATES.POSTED_TO_AR
]);

const RAW_INACTIVE_STATUSES = new Set(['reversed', 'reverse', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed']);

const DIRECT_AMOUNT_FIELDS = Object.freeze([
  'totalReturnAmount', 'returnAmount', 'totalAmount', 'amount', 'debtReduction'
]);
const ITEM_AMOUNT_FIELDS = Object.freeze([
  'returnAmount', 'amount', 'lineTotal', 'totalAmount', 'totalReturnAmount'
]);
const ITEM_QTY_FIELDS = Object.freeze([
  'returnQty', 'qtyReturn', 'returnQuantity', 'returnedQty', 'actualReturnQty',
  'quantity', 'qty'
]);
const ITEM_PRICE_FIELDS = Object.freeze([
  'unitPrice', 'salePrice', 'price', 'finalPrice', 'catalogSalePrice'
]);

function applyProjection(query, projection) {
  return query && typeof query.select === 'function' ? query.select(projection) : query;
}

async function runLean(query) {
  return query && typeof query.lean === 'function' ? await query.lean() : await query;
}

function isDeleted(row = {}) {
  return row.deleted === true || row.isDeleted === true || Boolean(row.deletedAt);
}

function itemRows(row = {}) {
  if (Array.isArray(row.items)) return row.items;
  if (Array.isArray(row.returnItems)) return row.returnItems;
  return [];
}

function returnItemAmount(item = {}, diagnostics = [], context = {}) {
  const explicit = Money.readFirstMoney(item, ITEM_AMOUNT_FIELDS, {
    diagnostics,
    sourceName: context.sourceName || 'returnOrders.items',
    component: 'returnItemAmount',
    nonNegative: true
  });
  if (explicit.present) return explicit.value;
  const qty = Money.readFirstMoney(item, ITEM_QTY_FIELDS, {
    diagnostics,
    sourceName: context.sourceName || 'returnOrders.items',
    component: 'returnQty',
    nonNegative: true
  });
  const price = Money.readFirstMoney(item, ITEM_PRICE_FIELDS, {
    diagnostics,
    sourceName: context.sourceName || 'returnOrders.items',
    component: 'returnUnitPrice',
    nonNegative: true
  });
  if (!qty.present || !price.present) return 0;
  return Math.round(qty.value * price.value);
}

function returnOrderAmount(row = {}, diagnostics = []) {
  // Explicit zero is authoritative and must not fall through to stale item rows.
  const direct = Money.readFirstMoney(row, DIRECT_AMOUNT_FIELDS, {
    diagnostics,
    sourceName: 'returnOrders',
    component: 'returnAmount',
    nonNegative: true
  });
  if (direct.present) return direct.value;
  return itemRows(row).reduce((sum, item, index) => sum + returnItemAmount(item, diagnostics, {
    sourceName: `returnOrders.items[${index}]`
  }), 0);
}

function rowIdentity(row = {}, index = 0) {
  const id = Identity.text(row._id || row.id || row.code);
  return id ? `return:${id}` : `anonymous:${index}`;
}

function resolveReturnStateForOrder(order = {}, rows = [], options = {}) {
  const diagnostics = [];
  const seen = new Set();
  const returnOrderIds = [];
  let returnAmount = 0;

  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const identity = rowIdentity(row, index);
    if (seen.has(identity)) {
      diagnostics.push({ code: 'DUPLICATE_RETURN_IDENTITY', returnIdentity: identity });
      return;
    }
    seen.add(identity);

    if (!Identity.tenantCompatible(order, row)) {
      diagnostics.push({ code: 'TENANT_MISMATCH_RETURN_EXCLUDED', returnIdentity: identity });
      return;
    }
    if (isDeleted(row)) return;
    const rawStatus = Identity.text(row.returnState || row.status || row.returnStatus || '').toLowerCase();
    if (RAW_INACTIVE_STATUSES.has(rawStatus)) return;

    const state = ReturnStateMachine.getReturnState(row);
    if (state === ReturnStateMachine.RETURN_STATES.CANCELLED) return;
    if (!INCLUDED_STATES.has(state)) {
      diagnostics.push({ code: 'UNKNOWN_RETURN_STATE_INCLUDED', state, returnIdentity: identity });
    }

    const amount = returnOrderAmount(row, diagnostics);
    if (amount < 0) {
      diagnostics.push({ code: 'NEGATIVE_INPUT_COMPONENT', source: 'returnOrders', component: 'returnAmount', value: amount });
      return;
    }
    if (amount <= 0 && options.includeZeroRows !== true) {
      // Zero rows remain valid but do not change the aggregate.
    }
    returnAmount += amount;
    returnOrderIds.push(Identity.text(row.id || row._id || row.code || identity));
  });

  return {
    returnAmount: Math.round(returnAmount),
    returnStateSource: 'returnOrders',
    returnOrderIds,
    diagnostics,
    integrityStatus: diagnostics.some((row) => row.code === 'INVALID_MONEY' || row.code === 'NEGATIVE_INPUT_COMPONENT')
      ? 'degraded'
      : (diagnostics.length ? 'warning' : 'ok')
  };
}

function buildRowsIndex(rows = []) {
  return Identity.buildCandidateIndex(rows);
}

function returnRowsForOrder(order = {}, rowsIndex = new Map()) {
  return Identity.candidatesForOrder(order, rowsIndex);
}

function buildReturnStatesForOrders(orders = [], rows = [], options = {}) {
  const rowsIndex = buildRowsIndex(rows);
  const states = orders.map((order) => resolveReturnStateForOrder(order, returnRowsForOrder(order, rowsIndex), options));
  const statesByIdentity = new Map();
  orders.forEach((order, index) => {
    const state = states[index];
    for (const entry of Identity.typedIdentityEntries(order)) statesByIdentity.set(entry.key, state);
    for (const raw of Identity.rawIdentityValues(order)) statesByIdentity.set(raw, state);
  });
  return { states, statesByIdentity, rowsIndex, rows };
}

async function loadCanonicalReturnStatesForOrders(orders = [], options = {}) {
  Identity.assertOrderBatch(orders, options);
  if (!orders.length) return buildReturnStatesForOrders([], [], options);
  const modelSet = options.models || {};
  const ReturnOrder = modelSet.ReturnOrder;
  if (!ReturnOrder || typeof ReturnOrder.find !== 'function') {
    const err = new Error('Thiếu ReturnOrder model cho canonical financial resolver');
    err.code = 'CANONICAL_FINANCIAL_RETURN_MODEL_UNAVAILABLE';
    throw err;
  }

  const rawIds = Array.from(new Set(orders.flatMap(Identity.rawIdentityValues)));
  const tenantIds = Array.from(new Set(orders.map(Identity.tenantIdOf).filter(Boolean)));
  const filter = {
    $or: [
      { salesOrderId: { $in: rawIds } },
      { salesOrderCode: { $in: rawIds } },
      { orderId: { $in: rawIds } },
      { orderCode: { $in: rawIds } },
      { sourceOrderId: { $in: rawIds } },
      { sourceOrderCode: { $in: rawIds } },
      { deliveryOrderId: { $in: rawIds } },
      { deliveryOrderCode: { $in: rawIds } }
    ]
  };
  if (tenantIds.length === 1) filter.tenantId = tenantIds[0];
  else if (tenantIds.length > 1) filter.tenantId = { $in: tenantIds };

  let query = ReturnOrder.find(filter);
  query = applyProjection(query, RETURN_ORDER_PROJECTION);
  if (query && typeof query.sort === 'function') query = query.sort({ updatedAt: -1, createdAt: -1 });
  if (options.session && query && typeof query.session === 'function') query = query.session(options.session);
  const rows = await runLean(query);
  const maxCandidates = Number.isFinite(Number(options.maxReturnCandidates))
    ? Number(options.maxReturnCandidates)
    : 50000;
  if ((rows || []).length > maxCandidates) {
    const err = new Error(`Return candidate count vượt giới hạn ${maxCandidates}`);
    err.code = 'CANONICAL_FINANCIAL_RETURN_CANDIDATE_LIMIT_EXCEEDED';
    err.candidateCount = rows.length;
    throw err;
  }
  return buildReturnStatesForOrders(orders, rows || [], options);
}

function returnStateForOrder(order = {}, statesByIdentity = new Map()) {
  for (const entry of Identity.typedIdentityEntries(order)) {
    const state = statesByIdentity.get(entry.key);
    if (state) return state;
  }
  for (const raw of Identity.rawIdentityValues(order)) {
    const state = statesByIdentity.get(raw);
    if (state) return state;
  }
  return resolveReturnStateForOrder(order, []);
}

module.exports = {
  RETURN_ORDER_PROJECTION,
  INCLUDED_STATES,
  RAW_INACTIVE_STATUSES,
  DIRECT_AMOUNT_FIELDS,
  ITEM_AMOUNT_FIELDS,
  ITEM_QTY_FIELDS,
  ITEM_PRICE_FIELDS,
  returnItemAmount,
  returnOrderAmount,
  resolveReturnStateForOrder,
  buildRowsIndex,
  returnRowsForOrder,
  buildReturnStatesForOrders,
  loadCanonicalReturnStatesForOrders,
  returnStateForOrder,
  _private: { isDeleted, itemRows, rowIdentity, applyProjection, runLean }
};
