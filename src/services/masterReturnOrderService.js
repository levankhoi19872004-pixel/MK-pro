'use strict';

const dateUtil = require('../utils/date.util');
const queryGuard = require('../utils/queryGuard.util');
const returnOrderRepository = require('../repositories/returnOrderRepository');
const masterReturnOrderRepository = require('../repositories/masterReturnOrderRepository');
const staffRules = require('../rules/staffRules');
const { makeId, normalizeText, toNumber } = require('../utils/common.util');
const { withMongoTransaction } = require('../utils/transaction.util');
const returnOrderService = require('./returnOrderService');
const ReturnStateMachine = require('../domain/lifecycle/ReturnStateMachine');
const { RETURN_STATES } = ReturnStateMachine;
const { pickDeliveryStaffCode, pickDeliveryStaffName } = require('../domain/staff/staffIdentity');
const MongoStore = require('../models');
const {
  pickReturnDeliveryStaffCode,
  pickReturnDeliveryStaffName,
  hydrateReturnOrderDeliveryStaff
} = require('./return-order/ReturnOrderDeliveryStaffHydrator');


const INACTIVE_RETURN_STATUSES = new Set([
  'cancelled',
  'canceled',
  'void',
  'voided',
  'deleted',
  'removed',
  'duplicate_cancelled',
  'cleared'
]);

function isInactiveStatus(row = {}) {
  const status = String(row.status || '').trim().toLowerCase();
  const returnStatus = String(row.returnStatus || '').trim().toLowerCase();
  const returnState = String(row.returnState || '').trim().toLowerCase();
  return INACTIVE_RETURN_STATUSES.has(status)
    || INACTIVE_RETURN_STATUSES.has(returnStatus)
    || INACTIVE_RETURN_STATUSES.has(returnState)
    || Boolean(row.deletedAt);
}

const GROUPABLE_RETURN_STATUSES = new Set([
  'active',
  'created',
  'pending',
  'has_return',
  'waiting_receive',
  'pending_warehouse_receive'
]);

const NON_GROUPABLE_RETURN_STATUSES = new Set([
  ...INACTIVE_RETURN_STATUSES,
  'grouped',
  'merged',
  'received',
  'warehouse_received',
  'accounting_confirmed',
  'posted_to_ar',
  'posted',
  'completed'
]);

function getReturnOrderValue(row = {}) {
  return toNumber(row.debtReduction ?? row.totalAmount ?? row.amount ?? row.totalValue);
}

function hasPositiveReturnValue(row = {}) {
  return getReturnOrderValue(row) > 0;
}

function groupableReturnOrderMongoFilter(extra = {}) {
  return {
    ...extra,
    status: { $nin: [...INACTIVE_RETURN_STATUSES] },
    returnStatus: { $nin: [...NON_GROUPABLE_RETURN_STATUSES] },
    warehouseReceiveStatus: { $nin: [...NON_GROUPABLE_RETURN_STATUSES] },
    returnState: {
      $nin: [
        RETURN_STATES.RECEIVED,
        RETURN_STATES.ACCOUNTING_CONFIRMED,
        RETURN_STATES.POSTED_TO_AR,
        RETURN_STATES.CANCELLED
      ]
    },
    $and: [
      {
        $or: [
          { masterReturnOrderId: { $exists: false } },
          { masterReturnOrderId: null },
          { masterReturnOrderId: '' }
        ]
      },
      {
        $or: [
          { masterReturnOrderCode: { $exists: false } },
          { masterReturnOrderCode: null },
          { masterReturnOrderCode: '' }
        ]
      },
      { returnMergeStatus: { $ne: 'merged' } }
    ]
  };
}

function hasPositiveReturnItemsOrValue(row = {}) {
  const itemAmount = (Array.isArray(row.items) ? row.items : []).reduce((sum, item) => {
    const qty = toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty);
    const price = toNumber(item.price ?? item.salePrice ?? item.unitPrice);
    const amount = qty > 0 && price > 0 ? qty * price : toNumber(item.returnAmount ?? item.amount);
    return sum + amount;
  }, 0);
  return itemAmount > 0 || hasPositiveReturnValue(row);
}

function isGroupableReturnStatus(row = {}) {
  const status = String(row?.status || '').toLowerCase();
  const returnStatus = String(row?.returnStatus || '').toLowerCase();
  const warehouseReceiveStatus = String(row?.warehouseReceiveStatus || '').toLowerCase();

  if (NON_GROUPABLE_RETURN_STATUSES.has(status) || NON_GROUPABLE_RETURN_STATUSES.has(returnStatus) || NON_GROUPABLE_RETURN_STATUSES.has(warehouseReceiveStatus)) {
    return false;
  }

  return GROUPABLE_RETURN_STATUSES.has(status)
    || GROUPABLE_RETURN_STATUSES.has(returnStatus)
    || GROUPABLE_RETURN_STATUSES.has(warehouseReceiveStatus)
    || (!status && !returnStatus && !warehouseReceiveStatus);
}

function buildMasterReturnCode(existingRows = []) {
  const max = existingRows.reduce((result, row) => {
    const match = String(row.code || '').match(/(\d+)$/);
    return Math.max(result, match ? Number(match[1]) : 0);
  }, 0);
  return `DTH${String(max + 1).padStart(5, '0')}`;
}


function normalizeStaffCode(value = '') {
  return String(value || '').trim().toLocaleLowerCase('vi-VN');
}

function escapeRegex(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactCodeRegex(value = '') {
  return new RegExp(`^${escapeRegex(String(value || '').trim())}$`, 'i');
}

function appendAndClauses(filter = {}, clauses = []) {
  const next = { ...filter };
  next.$and = [...(Array.isArray(filter.$and) ? filter.$and : []), ...clauses.filter(Boolean)];
  return next;
}

function returnOrderIdentityClause(row = {}) {
  const identities = [];
  const id = String(row.id || '').trim();
  const code = String(row.code || '').trim();
  if (id) identities.push({ id });
  if (code) identities.push({ code });
  const identityClause = identities.length === 1 ? identities[0] : { $or: identities };
  if (!String(row.updatedAt || '').trim()) return identityClause;
  return { $and: [identityClause, { updatedAt: row.updatedAt }] };
}

function isDuplicateKeyError(error) {
  return Number(error?.code) === 11000 || /E11000|duplicate key/i.test(String(error?.message || ''));
}

function unmergedReturnProjection() {
  return {
    id: 1,
    code: 1,
    customerId: 1,
    customerCode: 1,
    customerName: 1,
    date: 1,
    documentDate: 1,
    deliveryDate: 1,
    returnDate: 1,
    deliveryStaffId: 1,
    deliveryStaffCode: 1,
    deliveryStaffName: 1,
    deliveryCode: 1,
    deliveryName: 1,
    nvghCode: 1,
    nvghName: 1,
    salesOrderId: 1,
    salesOrderCode: 1,
    orderId: 1,
    orderCode: 1,
    sourceOrderId: 1,
    sourceOrderCode: 1,
    masterOrderId: 1,
    masterOrderCode: 1,
    status: 1,
    returnStatus: 1,
    returnState: 1,
    returnMergeStatus: 1,
    masterReturnOrderId: 1,
    masterReturnOrderCode: 1,
    warehouseStatus: 1,
    warehouseReceiveStatus: 1,
    totalQuantity: 1,
    totalAmount: 1,
    debtReduction: 1,
    amount: 1,
    note: 1,
    items: 1,
    createdAt: 1,
    updatedAt: 1
  };
}

async function resolveDeliveryStaff(body = {}) {
  const value = pickReturnDeliveryStaffCode(body) || pickDeliveryStaffCode(body);
  if (!value) return null;
  return staffRules.resolveDeliveryStaffByCode(value);
}

function toClient(masterReturnOrder, children = []) {
  const resolvedReturnDate = dateUtil.toDateOnly(
    masterReturnOrder.deliveryDate ||
    masterReturnOrder.returnDate ||
    masterReturnOrder.date ||
    masterReturnOrder.documentDate ||
    masterReturnOrder.createdAt
  );
  return {
    ...masterReturnOrder,
    id: masterReturnOrder.id || masterReturnOrder.code,
    code: masterReturnOrder.code || masterReturnOrder.id,
    returnDate: resolvedReturnDate,
    displayDate: resolvedReturnDate,
    children,
    returnOrderIds: Array.isArray(masterReturnOrder.returnOrderIds)
      ? masterReturnOrder.returnOrderIds
      : children.map((row) => row.id || row.code)
  };
}

function summarizeReturnOrders(returnOrders = []) {
  return {
    returnCount: returnOrders.length,
    totalQuantity: returnOrders.reduce((sum, row) => sum + toNumber(row.totalQuantity), 0),
    totalAmount: returnOrders.reduce((sum, row) => sum + toNumber(row.totalAmount ?? row.amount), 0),
    debtReduction: returnOrders.reduce((sum, row) => sum + toNumber(row.debtReduction ?? row.totalAmount ?? row.amount), 0)
  };
}

async function getChildren(masterReturnOrder = {}, options = {}) {
  const ids = Array.isArray(masterReturnOrder.returnOrderIds) ? masterReturnOrder.returnOrderIds.map(String).filter(Boolean) : [];
  if (!ids.length) return [];
  return returnOrderRepository.findAll({
    $or: [
      { id: { $in: ids } },
      { code: { $in: ids } }
    ]
  }, {
    sort: { createdAt: 1 },
    limit: Math.max(ids.length, 1),
    session: options.session
  });
}


async function getChildrenForMasterRows(masterRows = []) {
  const rows = Array.isArray(masterRows) ? masterRows : [];
  const childIds = [...new Set(rows.flatMap((row) => Array.isArray(row.returnOrderIds) ? row.returnOrderIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  if (!childIds.length) return rows.map((row) => toClient(row, []));

  const children = await returnOrderRepository.findAll({
    $or: [
      { id: { $in: childIds } },
      { code: { $in: childIds } }
    ]
  }, {
    sort: { createdAt: 1 },
    limit: Math.max(childIds.length, 1)
  });
  const childByIdentity = new Map();
  for (const child of children) {
    for (const identity of [child.id, child.code].map((value) => String(value || '').trim()).filter(Boolean)) {
      childByIdentity.set(identity, child);
    }
  }
  return rows.map((row) => {
    const rowChildren = (Array.isArray(row.returnOrderIds) ? row.returnOrderIds : [])
      .map((identity) => childByIdentity.get(String(identity || '').trim()))
      .filter(Boolean);
    return toClient(row, rowChildren);
  });
}

async function listUnmergedReturnOrders(query = {}) {
  const rawQuery = String(query.q || query.keyword || query.search || '').trim();
  const q = normalizeText(rawQuery);
  const deliveryCode = String(query.deliveryStaffCode || query.delivery || query.deliveryStaff || '').trim();
  const dateFrom = dateUtil.toDateOnly(query.dateFrom || query.date || query.returnDate);
  const dateTo = dateUtil.toDateOnly(query.dateTo || query.date || query.returnDate);
  const requestedLimit = Math.max(1, Math.min(Number.parseInt(query.limit, 10) || 500, 500));
  let filter = groupableReturnOrderMongoFilter();
  const clauses = [];

  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lte = dateTo;
    clauses.push({
      $or: [
        { deliveryDate: range },
        { returnDate: range },
        { date: range },
        { documentDate: range }
      ]
    });
  }

  if (deliveryCode) {
    const rx = exactCodeRegex(deliveryCode);
    clauses.push({
      $or: [
        { deliveryStaffCode: rx },
        { deliveryCode: rx },
        { nvghCode: rx },
        {
          $and: [
            { $or: [{ deliveryStaffCode: { $exists: false } }, { deliveryStaffCode: null }, { deliveryStaffCode: '' }] },
            { $or: [{ deliveryCode: { $exists: false } }, { deliveryCode: null }, { deliveryCode: '' }] },
            { $or: [{ nvghCode: { $exists: false } }, { nvghCode: null }, { nvghCode: '' }] }
          ]
        }
      ]
    });
  }

  if (rawQuery) {
    const rx = queryGuard.buildRegex(rawQuery);
    clauses.push({
      $or: [
        { code: rx },
        { customerCode: rx },
        { customerName: rx },
        { salesOrderCode: rx },
        { orderCode: rx },
        { note: rx }
      ]
    });
  }

  filter = appendAndClauses(filter, clauses);
  const rows = await returnOrderRepository.findAll(filter, {
    sort: { createdAt: -1, code: -1 },
    limit: requestedLimit,
    projection: unmergedReturnProjection()
  });
  const hydratedRows = await hydrateReturnOrderDeliveryStaff(rows);
  const deliveryKey = normalizeStaffCode(deliveryCode);

  return hydratedRows
    .filter((row) => !isInactiveStatus(row))
    .filter((row) => isGroupableReturnStatus(row))
    .filter((row) => hasPositiveReturnValue(row))
    .filter((row) => (row.returnMergeStatus || 'unmerged') !== 'merged' && !row.masterReturnOrderId && !row.masterReturnOrderCode)
    .filter((row) => !deliveryKey || normalizeStaffCode(pickReturnDeliveryStaffCode(row)) === deliveryKey)
    .filter((row) => !q || [row.code, row.customerCode, row.customerName, row.salesOrderCode, row.orderCode, row.note]
      .some((value) => normalizeText(value).includes(q)))
    .map((row) => ({
      ...row,
      returnDate: dateUtil.toDateOnly(row.deliveryDate || row.returnDate || row.date || row.documentDate || row.createdAt),
      displayDate: dateUtil.toDateOnly(row.deliveryDate || row.returnDate || row.date || row.documentDate || row.createdAt)
    }));
}

async function listMasterReturnOrders(query = {}) {
  const guardedQuery = queryGuard.normalizeQueryDateRange(query, { defaultToday: true });
  const page = queryGuard.getPagination(guardedQuery);
  const q = normalizeText(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
  const dateFrom = dateUtil.toDateOnly(guardedQuery.dateFrom);
  const dateTo = dateUtil.toDateOnly(guardedQuery.dateTo);
  const delivery = normalizeText(guardedQuery.delivery || guardedQuery.deliveryStaff);
  const excludeInactive = String(guardedQuery.excludeInactive ?? '0') !== '0';

  const filter = {};
  if (dateFrom || dateTo) {
    const range = {};
    if (dateFrom) range.$gte = dateFrom;
    if (dateTo) range.$lte = dateTo;
    filter.$or = [{ returnDate: range }, { date: range }];
  }
  if (excludeInactive) filter.status = { $nin: [...INACTIVE_RETURN_STATUSES] };
  if (delivery || q) {
    const clauses = [];
    if (delivery) {
      const rx = queryGuard.buildRegex(guardedQuery.delivery || guardedQuery.deliveryStaff);
      clauses.push({ $or: [{ deliveryStaffCode: rx }, { deliveryStaffName: rx }] });
    }
    if (q) {
      const rx = queryGuard.buildRegex(guardedQuery.q || guardedQuery.keyword || guardedQuery.search);
      clauses.push({ $or: [{ code: rx }, { deliveryStaffCode: rx }, { deliveryStaffName: rx }, { routeName: rx }, { note: rx }] });
    }
    if (clauses.length) filter.$and = clauses;
  }

  const rows = await masterReturnOrderRepository.findAll(filter, {
    sort: { createdAt: -1, code: -1 },
    skip: page.skip,
    limit: page.limit
  });
  return getChildrenForMasterRows(rows);
}

async function getMasterReturnOrder(id) {
  const masterReturnOrder = await masterReturnOrderRepository.findByIdOrCode(id);
  if (!masterReturnOrder) return { error: 'Không tìm thấy đơn tổng trả hàng', status: 404 };
  const children = await getChildren(masterReturnOrder);
  return { masterReturnOrder: toClient(masterReturnOrder, children) };
}

async function createMasterReturnOrder(body = {}) {
  const rawReturnOrderIds = (Array.isArray(body.returnOrderIds) ? body.returnOrderIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const returnOrderIds = [...new Set(rawReturnOrderIds)];
  if (!returnOrderIds.length) return { error: 'Chưa chọn phiếu trả hàng để gộp', status: 400 };
  if (returnOrderIds.length !== rawReturnOrderIds.length) {
    return { error: 'Danh sách phiếu trả hàng có ID trùng', status: 400 };
  }

  let childFilter = groupableReturnOrderMongoFilter();
  childFilter = appendAndClauses(childFilter, [
    { $or: [{ id: { $in: returnOrderIds } }, { code: { $in: returnOrderIds } }] }
  ]);
  const rawChildren = await returnOrderRepository.findAll(childFilter, {
    limit: Math.max(returnOrderIds.length, 1),
    projection: unmergedReturnProjection()
  });
  if (rawChildren.length !== returnOrderIds.length) {
    return { error: 'Một số phiếu trả hàng không tồn tại, đã bị gộp hoặc không còn đủ điều kiện', status: 409 };
  }

  const children = await hydrateReturnOrderDeliveryStaff(rawChildren);
  if (children.some((row) => isInactiveStatus(row))) return { error: 'Có phiếu trả hàng đã hủy/xóa', status: 400 };
  if (children.some((row) => !isGroupableReturnStatus(row))) {
    return { error: 'Chỉ được gộp phiếu trả hàng có trạng thái đã phát sinh/chờ kho nhận', status: 400 };
  }
  if (children.some((row) => !hasPositiveReturnValue(row))) {
    return { error: 'Không được gộp phiếu trả hàng có giá trị bằng 0', status: 400 };
  }
  if (children.some((row) => row.masterReturnOrderId || row.masterReturnOrderCode || (row.returnMergeStatus || 'unmerged') === 'merged')) {
    return { error: 'Có phiếu trả hàng đã được gộp trước đó', status: 409 };
  }

  const childCodes = children.map((row) => pickReturnDeliveryStaffCode(row));
  if (childCodes.some((code) => !String(code || '').trim())) {
    return { error: 'Có phiếu trả hàng chưa xác định mã NVGH, không thể gộp an toàn', status: 400 };
  }
  const distinctChildCodes = [...new Set(childCodes.map(normalizeStaffCode))];
  if (distinctChildCodes.length !== 1) {
    const incompatibleCodes = [...new Set(childCodes.map((code) => String(code || '').trim()).filter(Boolean))];
    return { error: `Một đơn tổng trả chỉ được chứa phiếu của cùng một NVGH. Đang có: ${incompatibleCodes.join(', ')}`, status: 400 };
  }

  const canonicalChild = children[0] || {};
  const canonicalChildCode = pickReturnDeliveryStaffCode(canonicalChild);
  const requestedDeliveryCode = pickReturnDeliveryStaffCode(body) || pickDeliveryStaffCode(body);
  if (requestedDeliveryCode && normalizeStaffCode(requestedDeliveryCode) !== normalizeStaffCode(canonicalChildCode)) {
    return { error: `NVGH trên form (${requestedDeliveryCode}) không khớp NVGH của phiếu trả (${canonicalChildCode})`, status: 400 };
  }

  const deliveryStaff = await resolveDeliveryStaff({ deliveryStaffCode: requestedDeliveryCode || canonicalChildCode });
  if (requestedDeliveryCode && !deliveryStaff) {
    return { error: `Mã NVGH ${requestedDeliveryCode} không tồn tại trong danh sách tài khoản`, status: 400 };
  }
  const deliveryStaffCode = String(
    pickDeliveryStaffCode(deliveryStaff) ||
    requestedDeliveryCode ||
    canonicalChildCode
  ).trim();
  const deliveryStaffName = String(
    pickDeliveryStaffName(deliveryStaff) ||
    pickReturnDeliveryStaffName(canonicalChild) ||
    pickReturnDeliveryStaffName(body)
  ).trim();

  const returnDate = dateUtil.toDateOnly(body.returnDate || body.date || dateUtil.todayVN());
  if (!returnDate) return { error: 'Thiếu ngày tạo đơn tổng trả', status: 400 };
  const summary = summarizeReturnOrders(children);
  const claimIdentityClauses = children.map(returnOrderIdentityClause).filter(Boolean);
  const maxCodeAttempts = 3;
  let lastDuplicateError = null;

  for (let attempt = 0; attempt < maxCodeAttempts; attempt += 1) {
    const existing = await masterReturnOrderRepository.findAll({}, {
      projection: { code: 1 },
      sort: { code: -1 },
      limit: 10000
    });
    const masterReturnOrder = {
      // Header-only aggregate. Product lines remain exclusively on returnOrders.
      id: makeId('MRO'),
      code: buildMasterReturnCode(existing),
      date: dateUtil.toDateOnly(body.date || returnDate),
      returnDate,
      deliveryStaffId: deliveryStaff?.id || canonicalChild.deliveryStaffId || '',
      deliveryStaffCode,
      deliveryStaffName,
      returnOrderIds: children.map((row) => row.id || row.code),
      status: 'pending',
      warehouseStatus: 'pending',
      warehouseReceiveStatus: 'pending',
      accountingStatus: 'pending',
      note: String(body.note || '').trim(),
      source: body.source || 'master_return_order_route',
      ...summary,
      createdAt: dateUtil.nowIso(),
      updatedAt: dateUtil.nowIso()
    };

    try {
      await withMongoTransaction(async (session) => {
        const now = dateUtil.nowIso();
        const baseClaimFilter = groupableReturnOrderMongoFilter();
        const claimFilter = appendAndClauses(baseClaimFilter, [
          { $or: claimIdentityClauses }
        ]);
        const claimResult = await MongoStore.returnOrders.updateMany(
          claimFilter,
          {
            $set: {
              ...ReturnStateMachine.patchForState({}, RETURN_STATES.WAITING_RECEIVE),
              masterReturnOrderId: masterReturnOrder.id,
              masterReturnOrderCode: masterReturnOrder.code,
              returnMergeStatus: 'merged',
              warehouseStatus: 'pending',
              stateChangedAt: now,
              updatedAt: now
            }
          },
          { session }
        );

        const claimedCount = Number(
          claimResult.matchedCount ??
          claimResult.nMatched ??
          claimResult.result?.nMatched ??
          claimResult.modifiedCount ??
          0
        );
        if (claimedCount !== children.length) {
          const error = new Error('Một hoặc nhiều phiếu trả hàng đã thay đổi hoặc được gộp bởi thao tác khác');
          error.code = 'RETURN_ORDER_ALREADY_CLAIMED';
          error.status = 409;
          throw error;
        }

        await masterReturnOrderRepository.upsert(masterReturnOrder, { session });
      });

      const updatedChildren = await getChildren(masterReturnOrder);
      return { masterReturnOrder: toClient(masterReturnOrder, updatedChildren) };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      lastDuplicateError = error;
    }
  }

  const conflict = new Error('Không thể cấp mã đơn tổng trả duy nhất sau nhiều lần thử');
  conflict.code = 'MASTER_RETURN_CODE_CONFLICT';
  conflict.status = 409;
  conflict.cause = lastDuplicateError;
  throw conflict;
}

async function updateMasterReturnOrder(id, body = {}) {
  const current = await masterReturnOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn tổng trả hàng', status: 404 };
  if (isInactiveStatus(current)) return { error: 'Đơn tổng trả hàng đã hủy/xóa, không thể cập nhật', status: 400 };

  const rawChildren = await getChildren(current);
  const children = await hydrateReturnOrderDeliveryStaff(rawChildren);
  const childCodes = [...new Set(children
    .map((row) => pickReturnDeliveryStaffCode(row))
    .map((code) => String(code || '').trim())
    .filter(Boolean))];
  if (childCodes.length > 1) {
    return { error: `Đơn tổng trả đang chứa nhiều NVGH (${childCodes.join(', ')}), không được đổi thông tin NVGH`, status: 409 };
  }

  const requestedCode = pickReturnDeliveryStaffCode(body) || pickDeliveryStaffCode(body);
  const canonicalChildCode = childCodes[0] || pickReturnDeliveryStaffCode(current);
  if (requestedCode && canonicalChildCode && normalizeStaffCode(requestedCode) !== normalizeStaffCode(canonicalChildCode)) {
    return { error: `Không được đổi NVGH của đơn tổng trả khác với NVGH phiếu con (${canonicalChildCode})`, status: 400 };
  }

  const deliveryStaff = await resolveDeliveryStaff({ deliveryStaffCode: requestedCode || canonicalChildCode });
  if (requestedCode && !deliveryStaff) {
    return { error: `Mã NVGH ${requestedCode} không tồn tại trong danh sách tài khoản`, status: 400 };
  }
  const updatedDeliveryCode = String(
    pickDeliveryStaffCode(deliveryStaff) ||
    requestedCode ||
    canonicalChildCode ||
    pickReturnDeliveryStaffCode(current)
  ).trim();
  const updatedDeliveryName = String(
    pickDeliveryStaffName(deliveryStaff) ||
    pickReturnDeliveryStaffName(children[0] || {}) ||
    pickReturnDeliveryStaffName(body) ||
    pickReturnDeliveryStaffName(current)
  ).trim();

  const updated = {
    ...current,
    ...body,
    returnDate: dateUtil.toDateOnly(body.returnDate || body.date || current.returnDate || current.date || dateUtil.todayVN()),
    date: dateUtil.toDateOnly(body.date || current.date || body.returnDate || current.returnDate || dateUtil.todayVN()),
    deliveryStaffId: deliveryStaff?.id || current.deliveryStaffId || '',
    deliveryStaffCode: updatedDeliveryCode,
    deliveryStaffName: updatedDeliveryName,
    note: String(body.note ?? current.note ?? '').trim(),
    status: String(body.status === 'received' || body.status === 'posted' ? current.status : (body.status || current.status || 'pending')).trim(),
    warehouseStatus: String(body.warehouseStatus || current.warehouseStatus || current.warehouseReceiveStatus || 'pending').trim(),
    warehouseReceiveStatus: String(body.warehouseReceiveStatus || current.warehouseReceiveStatus || current.warehouseStatus || 'pending').trim(),
    accountingStatus: String(body.accountingStatus || current.accountingStatus || 'pending').trim(),
    ...summarizeReturnOrders(children),
    updatedAt: dateUtil.nowIso()
  };

  await withMongoTransaction(async (session) => {
    await masterReturnOrderRepository.upsert(updated, { session });
    for (const child of rawChildren) {
      await returnOrderRepository.upsert({
        ...child,
        warehouseStatus: updated.warehouseStatus,
        warehouseReceiveStatus: updated.warehouseReceiveStatus,
        updatedAt: dateUtil.nowIso()
      }, { session });
    }
  });
  return { masterReturnOrder: toClient(updated, children) };
}


async function confirmReceiveMasterReturnOrder(id, body = {}) {
  return withMongoTransaction(async (session) => {
    const current = await masterReturnOrderRepository.findByIdOrCode(id, { session });
    if (!current) return { error: 'Không tìm thấy đơn tổng trả hàng', status: 404 };
    if (isInactiveStatus(current)) {
      return { error: 'Đơn tổng trả hàng đã hủy/xóa, không thể nhập kho', status: 400 };
    }
    if (String(current.warehouseStatus || current.warehouseReceiveStatus || current.status || '').toLowerCase() === 'posted' || String(current.status || '').toLowerCase() === 'received') {
      const children = await getChildren(current, { session });
      return { masterReturnOrder: toClient(current, children), alreadyReceived: true };
    }

    const children = await getChildren(current, { session });
    if (!children.length) return { error: 'Đơn tổng trả hàng chưa có phiếu trả hàng con', status: 400 };
    if (children.length !== (current.returnOrderIds || []).length) {
      const error = new Error('Thiếu phiếu trả hàng con trong đơn tổng');
      error.code = 'MASTER_RETURN_CHILD_MISSING';
      error.status = 409;
      throw error;
    }

    for (const child of children) {
      const result = await returnOrderService.confirmReceiveReturnOrder(child.id || child.code, {
        session,
        receivedBy: body.receivedBy
      });
      if (result?.error) {
        const error = new Error(result.error);
        error.code = result.code || 'MASTER_RETURN_CHILD_FAILED';
        error.status = result.status || 400;
        throw error;
      }
    }

    const receivedChildren = await getChildren(current, { session });
    const now = dateUtil.nowIso();
    const received = {
      ...current,
      status: 'received',
      warehouseStatus: 'posted',
      warehouseReceiveStatus: 'received',
      stockReceiveStatus: 'posted',
      stockPosted: true,
      receivedAt: now,
      stockPostedAt: now,
      receivedBy: String(body.receivedBy || '').trim(),
      stockPostedBy: String(body.receivedBy || '').trim(),
      updatedAt: now,
      ...summarizeReturnOrders(receivedChildren)
    };

    await masterReturnOrderRepository.upsert(received, { session });
    const finalChildren = [];
    for (const child of receivedChildren) {
      const updatedChild = {
        ...child,
        ...ReturnStateMachine.patchForState(child, RETURN_STATES.RECEIVED),
        returnState: RETURN_STATES.RECEIVED,
        warehouseStatus: 'posted',
        stockReceiveStatus: 'posted',
        stockPosted: true,
        stockPostedAt: child.stockPostedAt || now,
        returnMergeStatus: 'merged',
        masterReturnOrderId: received.id,
        masterReturnOrderCode: received.code,
        updatedAt: now
      };
      await returnOrderRepository.upsert(updatedChild, { session });
      finalChildren.push(updatedChild);
    }

    return {
      masterReturnOrder: toClient(received, finalChildren),
      alreadyReceived: false
    };
  });
}

async function cancelMasterReturnOrder(id, body = {}) {
  const current = await masterReturnOrderRepository.findByIdOrCode(id);
  if (!current) return { error: 'Không tìm thấy đơn tổng trả hàng', status: 404 };
  const warehouseStatus = String(current.warehouseStatus || current.warehouseReceiveStatus || current.status || '').toLowerCase();
  const accountingStatus = String(current.accountingStatus || '').toLowerCase();
  if (['posted', 'received', 'confirmed', 'completed'].includes(warehouseStatus) || accountingStatus === 'confirmed' || current.stockPosted) {
    return { error: 'Đơn tổng trả hàng đã nhập kho hoặc đã xác nhận kế toán, không được hủy gộp trực tiếp. Muốn sửa phải tạo phiếu điều chỉnh/đảo kho riêng.', status: 400 };
  }
  const children = await getChildren(current);
  const cancelled = {
    ...current,
    status: 'cancelled',
    cancelReason: String(body.reason || body.cancelReason || '').trim(),
    cancelledAt: dateUtil.nowIso(),
    updatedAt: dateUtil.nowIso()
  };
  await withMongoTransaction(async (session) => {
    for (const child of children) {
      const now = dateUtil.nowIso();
      await returnOrderRepository.upsert({
        ...child,
        ...ReturnStateMachine.patchForState(child, RETURN_STATES.WAITING_RECEIVE),
        returnState: RETURN_STATES.WAITING_RECEIVE,
        masterReturnOrderId: '',
        masterReturnOrderCode: '',
        returnMergeStatus: 'unmerged',
        warehouseStatus: 'pending',
        updatedAt: now
      }, { session });
    }
    await masterReturnOrderRepository.upsert(cancelled, { session });
  });
  return { masterReturnOrder: toClient(cancelled, []) };
}

module.exports = {
  listUnmergedReturnOrders,
  listMasterReturnOrders,
  getMasterReturnOrder,
  createMasterReturnOrder,
  updateMasterReturnOrder,
  confirmReceiveMasterReturnOrder,
  cancelMasterReturnOrder
};
