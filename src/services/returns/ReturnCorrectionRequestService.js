'use strict';

const crypto = require('node:crypto');
const AdminCorrectionRequest = require('../../models/AdminCorrectionRequest');
const returnOrderRepository = require('../../repositories/returnOrderRepository');
const orderRepository = require('../../repositories/orderRepository');
const auditService = require('../auditService');
const dateUtil = require('../../utils/date.util');
const {
  loadReturnMutationContext,
  resolveReturnWarehouseLockState
} = require('../../domain/returns/ReturnMutationGuard');

function text(value) {
  return String(value == null ? '' : value).trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value || {}));
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function actorSnapshot(actor = {}) {
  return {
    id: text(actor.id || actor._id),
    username: text(actor.username || actor.email || actor.code || actor.staffCode || actor.role),
    name: text(actor.name || actor.fullName || actor.displayName || actor.username),
    role: text(actor.role)
  };
}

function staleRequestError(returnOrder = {}, expected = {}) {
  const err = new Error('Phiếu trả đã thay đổi. Vui lòng tải lại trước khi tạo yêu cầu điều chỉnh.');
  err.status = 409;
  err.code = 'STALE_RETURN_CORRECTION_REQUEST';
  err.data = {
    code: err.code,
    returnOrderId: text(returnOrder.id || returnOrder._id),
    returnOrderCode: text(returnOrder.code),
    expectedVersion: text(expected.expectedVersion),
    expectedUpdatedAt: text(expected.expectedUpdatedAt),
    currentVersion: text(returnOrder.version || returnOrder.__v),
    currentUpdatedAt: text(returnOrder.updatedAt)
  };
  return err;
}

function assertExpectedVersion(returnOrder = {}, body = {}) {
  const expectedVersion = text(body.expectedVersion || body.version || body.expectedReturnOrderVersion);
  const expectedUpdatedAt = text(body.expectedUpdatedAt || body.updatedAt || body.expectedReturnOrderUpdatedAt);
  const currentVersion = text(returnOrder.version || returnOrder.__v);
  const currentUpdatedAt = text(returnOrder.updatedAt);
  if (expectedVersion && currentVersion && expectedVersion !== currentVersion) {
    throw staleRequestError(returnOrder, { expectedVersion, expectedUpdatedAt });
  }
  if (expectedUpdatedAt && currentUpdatedAt && expectedUpdatedAt !== currentUpdatedAt) {
    throw staleRequestError(returnOrder, { expectedVersion, expectedUpdatedAt });
  }
}

async function createRequest({ returnOrderId = '', body = {}, actor = {} } = {}, options = {}) {
  const returnOrder = await returnOrderRepository.findByIdOrCode(returnOrderId || body.returnOrderId || body.returnOrderCode);
  if (!returnOrder) {
    const err = new Error('Không tìm thấy phiếu trả hàng.');
    err.status = 404;
    err.code = 'RETURN_ORDER_NOT_FOUND';
    throw err;
  }

  assertExpectedVersion(returnOrder, body);

  const orderKey = text(returnOrder.salesOrderId || returnOrder.orderId || returnOrder.salesOrderCode || returnOrder.orderCode);
  const order = orderKey ? (await orderRepository.findByIdOrCode(orderKey)) : null;
  const context = await loadReturnMutationContext({ order: order || returnOrder, returnOrder, options });
  const warehouseLock = context.warehouseLock || resolveReturnWarehouseLockState(returnOrder);
  const now = options.now || dateUtil.nowIso();
  const requestedBy = actorSnapshot(actor);
  const requestedPatch = {
    correctedReturnItems: Array.isArray(body.correctedReturnItems) ? body.correctedReturnItems : [],
    returnAdjustmentItems: Array.isArray(body.returnAdjustmentItems) ? body.returnAdjustmentItems : [],
    reason: text(body.reason),
    note: text(body.note)
  };
  const idempotencyKey = text(body.idempotencyKey)
    || `RETURN_CORRECTION_REQUEST:${text(returnOrder.id || returnOrder._id || returnOrder.code)}:${text(body.expectedUpdatedAt || returnOrder.updatedAt)}:${shortHash(stableJson(requestedPatch))}`;
  const existing = await AdminCorrectionRequest.findOne({ idempotencyKey }).lean();
  if (existing) return { request: existing, idempotent: true };

  const requestId = text(body.id || `RCR-${text(returnOrder.code || returnOrder.id || returnOrder._id)}-${Date.now()}-${shortHash(idempotencyKey)}`);
  const request = {
    id: requestId,
    correctionCode: text(body.correctionCode || requestId),
    entityType: 'returnOrder',
    entityId: text(returnOrder.id || returnOrder._id),
    entityCode: text(returnOrder.code),
    correctionType: 'RETURN_ORDER_POST_CLOSEOUT_CORRECTION_REQUEST',
    riskLevel: warehouseLock.stockPosted || warehouseLock.inventoryPosted ? 'high' : 'medium',
    status: text(body.status || 'pending_approval'),
    reason: text(body.reason || 'Yêu cầu điều chỉnh hàng trả sau chốt kế toán'),
    requestedBy,
    requestedAt: now,
    beforeSnapshot: {
      returnOrderId: text(returnOrder.id || returnOrder._id),
      returnOrderCode: text(returnOrder.code),
      updatedAt: text(returnOrder.updatedAt),
      version: text(returnOrder.version || returnOrder.__v),
      items: Array.isArray(returnOrder.items) ? returnOrder.items : [],
      totalAmount: returnOrder.totalAmount,
      totalQuantity: returnOrder.totalQuantity,
      stockPosted: Boolean(warehouseLock.stockPosted),
      inventoryPosted: Boolean(warehouseLock.inventoryPosted)
    },
    proposedPatch: requestedPatch,
    affectedReports: ['deliveryCloseoutVersions', 'orderPaymentAllocations', 'returnOrders'],
    idempotencyKey,
    version: 1,
    deleted: false,
    metadata: {
      phase: 'Phase260B',
      workflow: 'controlled_return_correction_request',
      immutableSourceReturnOrder: true,
      accountingLocked: Boolean(context.accountingLock && context.accountingLock.locked),
      accountingLock: context.accountingLock,
      warehouseLock,
      reversalRequired: Boolean(warehouseLock.stockPosted || warehouseLock.inventoryPosted),
      allowedApplyRoles: ['admin', 'accountant', 'manager'],
      deliveryMayApproveOrApply: false
    },
    createdAt: now,
    updatedAt: now
  };

  await AdminCorrectionRequest.findOneAndUpdate(
    { idempotencyKey },
    { $setOnInsert: request },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await auditService.log('return_correction_request_created', {
    refType: 'returnOrder',
    refId: request.entityId,
    refCode: request.entityCode,
    before: request.beforeSnapshot,
    after: request,
    note: request.reason
  });

  return { request, idempotent: false };
}

module.exports = {
  createRequest
};
