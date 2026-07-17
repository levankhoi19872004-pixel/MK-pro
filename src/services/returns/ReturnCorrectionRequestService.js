'use strict';

const crypto = require('node:crypto');
const AdminCorrectionRequest = require('../../models/AdminCorrectionRequest');
const StockTransaction = require('../../models/StockTransaction');
const DeliveryCloseoutVersion = require('../../models/DeliveryCloseoutVersion');
const returnOrderRepository = require('../../repositories/returnOrderRepository');
const orderRepository = require('../../repositories/orderRepository');
const auditService = require('../auditService');
const dateUtil = require('../../utils/date.util');
const { makeId, toNumber } = require('../../utils/common.util');
const { withMongoTransaction } = require('../../utils/transaction.util');
const InventoryPostingService = require('../../domain/posting/InventoryPostingService');
const OrderPaymentAllocationService = require('../accounting/OrderPaymentAllocationService');
const {
  loadReturnMutationContext,
  resolveReturnWarehouseLockState
} = require('../../domain/returns/ReturnMutationGuard');

const STATUSES = Object.freeze({
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  APPLYING: 'applying',
  WAITING_WAREHOUSE_RECHECK: 'waiting_warehouse_recheck',
  WAITING_STOCK_REPOST: 'waiting_stock_repost',
  WAITING_ACCOUNTING_FINALIZE: 'waiting_accounting_finalize',
  APPLIED: 'applied',
  REJECTED: 'rejected',
  FAILED: 'failed'
});

const STATE_MACHINE = Object.freeze({
  pending_approval: ['approved', 'rejected'],
  approved: ['applying'],
  applying: ['waiting_warehouse_recheck', 'failed'],
  waiting_warehouse_recheck: ['waiting_stock_repost'],
  waiting_stock_repost: ['waiting_accounting_finalize'],
  waiting_accounting_finalize: ['applied'],
  applied: [],
  rejected: [],
  failed: ['applying']
});

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

function actorRole(actor = {}) {
  return text(actor.role || actor.roleCode).toLowerCase();
}

function assertRole(actor = {}, allowed = [], action = 'return correction') {
  const role = actorRole(actor);
  if (!allowed.includes(role)) {
    const err = new Error('Bạn không có quyền thực hiện bước điều chỉnh hàng trả này.');
    err.status = 403;
    err.code = 'RETURN_CORRECTION_FORBIDDEN';
    err.data = { action, role, allowed };
    throw err;
  }
}

function sameActor(left = {}, right = {}) {
  const l = actorSnapshot(left);
  const r = actorSnapshot(right);
  return Boolean((l.id && l.id === r.id) || (l.username && l.username === r.username));
}

function assertTransition(current, next) {
  const allowed = STATE_MACHINE[text(current)] || [];
  if (!allowed.includes(text(next))) {
    const err = new Error(`Không thể chuyển yêu cầu điều chỉnh hàng trả từ ${current} sang ${next}.`);
    err.status = 409;
    err.code = 'INVALID_RETURN_CORRECTION_TRANSITION';
    err.data = { current, next, allowed };
    throw err;
  }
}

function money(value) {
  const n = Number(toNumber(value));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function itemQty(item = {}) {
  return toNumber(item.returnQty ?? item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.quantity ?? item.qty);
}

function itemPrice(item = {}) {
  return toNumber(item.price ?? item.salePrice ?? item.unitPrice);
}

function normalizeItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const qty = itemQty(item);
    const price = itemPrice(item);
    const amount = money(item.returnAmount ?? item.amount ?? (qty * price));
    return {
      ...item,
      productCode: text(item.productCode || item.code || item.productId),
      productName: text(item.productName || item.name),
      returnQty: qty,
      qtyReturn: qty,
      returnQuantity: qty,
      returnedQty: qty,
      quantity: qty,
      qty,
      price,
      salePrice: price,
      unitPrice: price,
      returnAmount: amount,
      amount
    };
  }).filter((item) => item.productCode || item.productName || item.returnQty);
}

function summarizeItems(items = []) {
  const normalized = normalizeItems(items);
  return {
    items: normalized,
    totalQuantity: normalized.reduce((sum, item) => sum + toNumber(item.returnQty), 0),
    totalAmount: normalized.reduce((sum, item) => sum + money(item.returnAmount ?? item.amount), 0)
  };
}

function proposedItems(request = {}, fallback = []) {
  const patch = request.proposedPatch || {};
  if (Array.isArray(patch.correctedReturnItems) && patch.correctedReturnItems.length) return patch.correctedReturnItems;
  if (Array.isArray(patch.returnAdjustmentItems) && patch.returnAdjustmentItems.length) return patch.returnAdjustmentItems;
  return fallback;
}

function responseShape(request = {}, extra = {}) {
  return {
    ok: true,
    requestId: text(request.id || request.correctionCode),
    status: text(request.status),
    currentStep: text(request.status),
    oldReturnOrderVersion: request.metadata && request.metadata.oldReturnOrderVersion,
    newReturnOrderVersion: request.metadata && request.metadata.newReturnOrderVersion,
    nextRequiredAction: nextActionForStatus(request.status),
    request,
    ...extra
  };
}

function nextActionForStatus(status) {
  switch (text(status)) {
    case STATUSES.PENDING_APPROVAL: return 'approve_or_reject';
    case STATUSES.APPROVED: return 'apply';
    case STATUSES.WAITING_WAREHOUSE_RECHECK: return 'warehouse_recheck';
    case STATUSES.WAITING_STOCK_REPOST: return 'stock_repost';
    case STATUSES.WAITING_ACCOUNTING_FINALIZE: return 'accounting_finalize';
    case STATUSES.FAILED: return 'retry_or_resume';
    default: return '';
  }
}

function requestQuery(id) {
  const key = text(id);
  return { $or: [{ id: key }, { correctionCode: key }] };
}

async function findRequest(id, options = {}) {
  const query = AdminCorrectionRequest.findOne({ ...requestQuery(id), deleted: { $ne: true } });
  if (options.session) query.session(options.session);
  return query.lean();
}

async function updateRequest(id, patch = {}, options = {}) {
  const query = AdminCorrectionRequest.findOneAndUpdate(
    requestQuery(id),
    { $set: { ...patch, updatedAt: options.now || dateUtil.nowIso() }, $inc: { version: 1 } },
    { new: true, session: options.session }
  );
  return query.lean();
}

function correctionVersionIdentity(returnOrder = {}, request = {}) {
  const root = text(returnOrder.rootReturnOrderId || returnOrder.id || returnOrder._id || returnOrder.code);
  const req = text(request.id || request.correctionCode);
  const token = shortHash(`${root}:${req}`);
  return {
    id: `RO-CORR-${token}`,
    code: `${text(returnOrder.code || returnOrder.id || 'RO')}-CORR-${token}`
  };
}

async function createCorrectionVersion(returnOrder = {}, request = {}, options = {}) {
  const identity = correctionVersionIdentity(returnOrder, request);
  const existing = await returnOrderRepository.findByIdOrCode(identity.id, options)
    || await returnOrderRepository.findByIdOrCode(identity.code, options);
  if (existing) return { returnOrder: existing, idempotent: true };
  const summary = summarizeItems(proposedItems(request, returnOrder.items));
  const now = options.now || dateUtil.nowIso();
  const previousVersion = Number(returnOrder.version || returnOrder.__v || 1) || 1;
  const nextVersion = previousVersion + 1;
  const corrected = {
    ...returnOrder,
    _id: undefined,
    id: identity.id,
    code: identity.code,
    rootReturnOrderId: text(returnOrder.rootReturnOrderId || returnOrder.id || returnOrder._id || returnOrder.code),
    previousVersionId: text(returnOrder.id || returnOrder._id),
    previousVersionCode: text(returnOrder.code),
    supersedesReturnOrderId: text(returnOrder.id || returnOrder._id),
    supersedesReturnOrderCode: text(returnOrder.code),
    supersededByReturnOrderId: '',
    supersededByReturnOrderCode: '',
    correctionRequestId: text(request.id),
    correctionRequestCode: text(request.correctionCode),
    correctionReason: text(request.reason),
    createdFromCorrection: true,
    version: nextVersion,
    isCurrentVersion: false,
    active: false,
    items: summary.items,
    returnItems: summary.items,
    totalQuantity: summary.totalQuantity,
    totalAmount: summary.totalAmount,
    totalReturnAmount: summary.totalAmount,
    amount: summary.totalAmount,
    debtReduction: summary.totalAmount,
    status: 'waiting_receive',
    returnStatus: 'waiting_receive',
    returnState: 'waiting_receive',
    warehouseReceiveStatus: 'waiting_receive',
    warehouseStatus: 'pending',
    warehouseCheckStatus: 'pending',
    warehouseConfirmed: false,
    warehouseChecked: false,
    warehouseCheckedAt: '',
    warehouseCheckedBy: '',
    warehouseCheckedByName: '',
    stockInStatus: 'pending',
    inventoryPosted: false,
    stockPosted: false,
    stockTransactionId: '',
    stockTransactionIds: [],
    inventoryTransactionId: '',
    accountingStatus: 'pending',
    accountingConfirmed: false,
    createdAt: now,
    updatedAt: now
  };
  await returnOrderRepository.upsert(corrected, options);
  return { returnOrder: corrected, idempotent: false };
}

async function reverseStockIfNeeded(returnOrder = {}, request = {}, options = {}) {
  const warehouseLock = resolveReturnWarehouseLockState(returnOrder);
  if (!warehouseLock.stockPosted && !warehouseLock.inventoryPosted) return { required: false, transactions: [] };
  const reversalRefId = `RETURN-CORRECTION:${text(returnOrder.id || returnOrder.code)}:${text(request.id || request.correctionCode)}:REVERSE_STOCK`;
  const existing = await StockTransaction.find({ refId: reversalRefId }).session(options.session || null).lean();
  if (existing.length) return { required: true, transactions: existing, idempotent: true };
  const txIds = Array.isArray(returnOrder.stockTransactionIds) ? returnOrder.stockTransactionIds.filter(Boolean) : [];
  if (returnOrder.stockTransactionId) txIds.push(returnOrder.stockTransactionId);
  const originalTransactions = txIds.length
    ? await StockTransaction.find({ $or: [{ id: { $in: txIds } }, { code: { $in: txIds } }, { _id: { $in: txIds.filter((id) => /^[a-f0-9]{24}$/i.test(String(id))) } }] }).session(options.session || null).lean()
    : [];
  const reversed = await InventoryPostingService.reverseMovement({
    ...returnOrder,
    id: reversalRefId,
    code: text(request.correctionCode || request.id),
    items: Array.isArray(returnOrder.items) ? returnOrder.items : []
  }, {
    type: 'RETURN',
    reverseType: 'RETURN_CORRECTION_REVERSAL',
    direction: 'IN',
    refType: 'RETURN_ORDER_CORRECTION',
    refId: reversalRefId,
    refCode: text(request.correctionCode || request.id),
    reversedFrom: txIds.join(','),
    originalMovementId: txIds[0] || '',
    note: `Đảo nhập kho phiếu trả ${returnOrder.code || returnOrder.id || ''} theo ${request.correctionCode || request.id}`.trim()
  }, options);
  return { required: true, transactions: reversed, originalTransactions };
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
  const returnOrder = await returnOrderRepository.findByIdOrCode(returnOrderId || body.returnOrderId || body.returnOrderCode, options);
  if (!returnOrder) {
    const err = new Error('Không tìm thấy phiếu trả hàng.');
    err.status = 404;
    err.code = 'RETURN_ORDER_NOT_FOUND';
    throw err;
  }

  assertExpectedVersion(returnOrder, body);

  const orderKey = text(returnOrder.salesOrderId || returnOrder.orderId || returnOrder.salesOrderCode || returnOrder.orderCode);
  const order = orderKey ? (await orderRepository.findByIdOrCode(orderKey, options)) : null;
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
  const existingQuery = AdminCorrectionRequest.findOne({ idempotencyKey });
  if (options.session) existingQuery.session(options.session);
  const existing = await existingQuery.lean();
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
    status: STATUSES.PENDING_APPROVAL,
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
      phase: 'Phase260B-R1',
      workflow: 'controlled_return_correction_reversal',
      stateMachine: STATE_MACHINE,
      expectedVersion: text(body.expectedVersion || body.version || body.expectedReturnOrderVersion || returnOrder.version || returnOrder.__v),
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
    { upsert: true, new: true, setDefaultsOnInsert: true, session: options.session }
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

async function approveRequest(id, body = {}, actor = {}) {
  assertRole(actor, ['admin', 'accountant'], 'approve');
  return withMongoTransaction(async (session) => {
    const request = await findRequest(id, { session });
    if (!request) {
      const err = new Error('Không tìm thấy yêu cầu điều chỉnh hàng trả.');
      err.status = 404;
      err.code = 'RETURN_CORRECTION_REQUEST_NOT_FOUND';
      throw err;
    }
    assertTransition(request.status, STATUSES.APPROVED);
    if (!body.emergencyOverride && sameActor(actor, request.requestedBy)) {
      const err = new Error('Người tạo yêu cầu không được tự duyệt điều chỉnh hàng trả.');
      err.status = 403;
      err.code = 'RETURN_CORRECTION_SEPARATION_OF_DUTIES';
      throw err;
    }
    const approved = await updateRequest(request.id || request.correctionCode, {
      status: STATUSES.APPROVED,
      approvedBy: actorSnapshot(actor),
      approvedAt: dateUtil.nowIso(),
      metadata: {
        ...(request.metadata || {}),
        approvalNote: text(body.note),
        emergencyOverride: Boolean(body.emergencyOverride),
        currentStep: STATUSES.APPROVED
      }
    }, { session });
    await auditService.log('return_correction_request_approved', {
      refType: 'returnOrder',
      refId: approved.entityId,
      refCode: approved.entityCode,
      after: approved,
      actor,
      note: body.note
    });
    return responseShape(approved);
  });
}

async function rejectRequest(id, body = {}, actor = {}) {
  assertRole(actor, ['admin', 'accountant'], 'reject');
  const reason = text(body.reason || body.rejectReason);
  if (!reason) {
    const err = new Error('Cần nhập lý do từ chối yêu cầu điều chỉnh hàng trả.');
    err.status = 400;
    err.code = 'RETURN_CORRECTION_REJECT_REASON_REQUIRED';
    throw err;
  }
  return withMongoTransaction(async (session) => {
    const request = await findRequest(id, { session });
    if (!request) {
      const err = new Error('Không tìm thấy yêu cầu điều chỉnh hàng trả.');
      err.status = 404;
      err.code = 'RETURN_CORRECTION_REQUEST_NOT_FOUND';
      throw err;
    }
    assertTransition(request.status, STATUSES.REJECTED);
    const rejected = await updateRequest(request.id || request.correctionCode, {
      status: STATUSES.REJECTED,
      rejectedBy: actorSnapshot(actor),
      rejectedAt: dateUtil.nowIso(),
      rejectReason: reason,
      metadata: { ...(request.metadata || {}), currentStep: STATUSES.REJECTED }
    }, { session });
    await auditService.log('return_correction_request_rejected', {
      refType: 'returnOrder',
      refId: rejected.entityId,
      refCode: rejected.entityCode,
      after: rejected,
      actor,
      note: reason
    });
    return responseShape(rejected);
  });
}

async function applyRequest(id, body = {}, actor = {}) {
  assertRole(actor, ['admin', 'accountant'], 'apply');
  try {
    return await withMongoTransaction(async (session) => {
      const request = await findRequest(id, { session });
      if (!request) {
        const err = new Error('Không tìm thấy yêu cầu điều chỉnh hàng trả.');
        err.status = 404;
        err.code = 'RETURN_CORRECTION_REQUEST_NOT_FOUND';
        throw err;
      }
      if (request.status === STATUSES.WAITING_WAREHOUSE_RECHECK) return responseShape(request);
      if (request.status === STATUSES.FAILED) {
        // Controlled retry resumes from apply.
      } else {
        assertTransition(request.status, STATUSES.APPLYING);
      }
      const current = await returnOrderRepository.findByIdOrCode(request.entityId || request.entityCode, { session });
      if (!current) {
        const err = new Error('Không tìm thấy phiếu trả hàng gốc.');
        err.status = 404;
        err.code = 'RETURN_ORDER_NOT_FOUND';
        throw err;
      }
      assertExpectedVersion(current, {
        expectedVersion: request.metadata && request.metadata.expectedVersion,
        expectedUpdatedAt: request.beforeSnapshot && request.beforeSnapshot.updatedAt
      });
      await updateRequest(request.id || request.correctionCode, {
        status: STATUSES.APPLYING,
        metadata: { ...(request.metadata || {}), currentStep: STATUSES.APPLYING }
      }, { session });
      const reversal = await reverseStockIfNeeded(current, request, { session });
      const versionResult = await createCorrectionVersion(current, request, { session });
      const newVersion = versionResult.returnOrder;
      const applied = await updateRequest(request.id || request.correctionCode, {
        status: STATUSES.WAITING_WAREHOUSE_RECHECK,
        appliedBy: actorSnapshot(actor),
        metadata: {
          ...(request.metadata || {}),
          currentStep: STATUSES.WAITING_WAREHOUSE_RECHECK,
          oldReturnOrderVersion: {
            id: text(current.id || current._id),
            code: text(current.code),
            version: text(current.version || current.__v),
            itemsUnchanged: true
          },
          newReturnOrderVersion: {
            id: text(newVersion.id || newVersion._id),
            code: text(newVersion.code),
            version: text(newVersion.version),
            warehouseReset: true
          },
          stockReversal: {
            required: Boolean(reversal.required),
            transactionIds: (reversal.transactions || []).map((row) => text(row.id || row.code || row._id)).filter(Boolean),
            idempotent: Boolean(reversal.idempotent)
          }
        }
      }, { session });
      await auditService.log('return_correction_request_applied_waiting_warehouse', {
        refType: 'returnOrder',
        refId: current.id || current._id,
        refCode: current.code,
        before: current,
        after: newVersion,
        actor,
        note: request.reason
      });
      return responseShape(applied, { newReturnOrder: newVersion, stockReversal: reversal });
    });
  } catch (error) {
    const request = await findRequest(id).catch(() => null);
    if (request && request.status !== STATUSES.FAILED) {
      await updateRequest(request.id || request.correctionCode, {
        status: STATUSES.FAILED,
        metadata: { ...(request.metadata || {}), failedStep: 'apply', errorCode: error.code || error.name, errorMessage: error.message }
      }).catch(() => null);
    }
    throw error;
  }
}

async function warehouseRecheck(id, body = {}, actor = {}) {
  assertRole(actor, ['admin', 'warehouse'], 'warehouse_recheck');
  return withMongoTransaction(async (session) => {
    const request = await findRequest(id, { session });
    if (!request) {
      const err = new Error('Không tìm thấy yêu cầu điều chỉnh hàng trả.');
      err.status = 404;
      throw err;
    }
    assertTransition(request.status, STATUSES.WAITING_STOCK_REPOST);
    const newVersionId = request.metadata && request.metadata.newReturnOrderVersion && request.metadata.newReturnOrderVersion.id;
    const current = await returnOrderRepository.findByIdOrCode(newVersionId, { session });
    if (!current) {
      const err = new Error('Không tìm thấy version phiếu trả cần thủ kho kiểm lại.');
      err.status = 404;
      err.code = 'RETURN_CORRECTION_VERSION_NOT_FOUND';
      throw err;
    }
    const now = dateUtil.nowIso();
    const checked = {
      ...current,
      warehouseCheckStatus: text(body.warehouseCheckStatus || 'matched'),
      warehouseConfirmed: true,
      warehouseChecked: true,
      warehouseCheckedAt: now,
      warehouseCheckedBy: text(actor.code || actor.username || actor.id),
      warehouseCheckedByName: text(actor.name || actor.fullName || actor.username),
      stockInStatus: 'ready',
      updatedAt: now
    };
    await returnOrderRepository.upsert(checked, { session });
    const next = await updateRequest(request.id || request.correctionCode, {
      status: STATUSES.WAITING_STOCK_REPOST,
      metadata: { ...(request.metadata || {}), currentStep: STATUSES.WAITING_STOCK_REPOST, warehouseRecheckedAt: now }
    }, { session });
    return responseShape(next, { newReturnOrder: checked });
  });
}

async function stockRepost(id, body = {}, actor = {}) {
  assertRole(actor, ['admin', 'warehouse'], 'stock_repost');
  return withMongoTransaction(async (session) => {
    const request = await findRequest(id, { session });
    if (!request) {
      const err = new Error('Không tìm thấy yêu cầu điều chỉnh hàng trả.');
      err.status = 404;
      throw err;
    }
    assertTransition(request.status, STATUSES.WAITING_ACCOUNTING_FINALIZE);
    const newVersionId = request.metadata && request.metadata.newReturnOrderVersion && request.metadata.newReturnOrderVersion.id;
    const current = await returnOrderRepository.findByIdOrCode(newVersionId, { session });
    if (!current) {
      const err = new Error('Không tìm thấy version phiếu trả cần nhập kho lại.');
      err.status = 404;
      throw err;
    }
    const posted = await InventoryPostingService.postReturnIn(current, { session });
    const txIds = (posted || []).map((row) => text(row.id || row.code || row._id)).filter(Boolean);
    const now = dateUtil.nowIso();
    const stocked = {
      ...current,
      stockInStatus: 'posted',
      stockPosted: true,
      stockPostedAt: now,
      stockPostedBy: text(actor.code || actor.username || actor.id),
      stockPostedByName: text(actor.name || actor.fullName || actor.username),
      stockTransactionId: txIds[0] || current.stockTransactionId || '',
      stockTransactionIds: txIds.length ? txIds : (Array.isArray(current.stockTransactionIds) ? current.stockTransactionIds : []),
      updatedAt: now
    };
    await returnOrderRepository.upsert(stocked, { session });
    const next = await updateRequest(request.id || request.correctionCode, {
      status: STATUSES.WAITING_ACCOUNTING_FINALIZE,
      metadata: { ...(request.metadata || {}), currentStep: STATUSES.WAITING_ACCOUNTING_FINALIZE, correctedStockTransactionIds: stocked.stockTransactionIds }
    }, { session });
    return responseShape(next, { newReturnOrder: stocked, stockTransactions: posted });
  });
}

async function accountingFinalize(id, body = {}, actor = {}) {
  assertRole(actor, ['admin', 'accountant'], 'accounting_finalize');
  return withMongoTransaction(async (session) => {
    const request = await findRequest(id, { session });
    if (!request) {
      const err = new Error('Không tìm thấy yêu cầu điều chỉnh hàng trả.');
      err.status = 404;
      throw err;
    }
    assertTransition(request.status, STATUSES.APPLIED);
    const newVersionId = request.metadata && request.metadata.newReturnOrderVersion && request.metadata.newReturnOrderVersion.id;
    const newVersion = await returnOrderRepository.findByIdOrCode(newVersionId, { session });
    if (!newVersion || newVersion.stockPosted !== true) {
      const err = new Error('Phiếu trả version mới chưa nhập kho, chưa thể finalize kế toán.');
      err.status = 409;
      err.code = 'RETURN_CORRECTION_STOCK_REPOST_REQUIRED';
      throw err;
    }
    const orderKey = text(newVersion.salesOrderId || newVersion.orderId || newVersion.salesOrderCode || newVersion.orderCode);
    const order = orderKey ? await orderRepository.findByIdOrCode(orderKey, { session }) : {};
    const latest = await DeliveryCloseoutVersion.findOne({
      $or: [
        { salesOrderId: order.id || newVersion.salesOrderId },
        { salesOrderCode: order.code || newVersion.salesOrderCode },
        { orderId: order.id || newVersion.orderId },
        { orderCode: order.code || newVersion.orderCode }
      ].filter((row) => Object.values(row)[0])
    }).sort({ closeoutVersion: -1, createdAt: -1 }).session(session).lean();
    const now = dateUtil.nowIso();
    const closeoutVersion = Number(latest && (latest.closeoutVersion || latest.version || 0)) + 1;
    const closeout = {
      ...(latest || {}),
      _id: undefined,
      id: makeId('DCOV'),
      code: makeId('DCOV'),
      closeoutVersion,
      sourceVersion: closeoutVersion,
      status: 'corrected_confirmed',
      salesOrderId: text(order.id || newVersion.salesOrderId || newVersion.orderId),
      salesOrderCode: text(order.code || newVersion.salesOrderCode || newVersion.orderCode),
      orderId: text(order.id || newVersion.orderId || newVersion.salesOrderId),
      orderCode: text(order.code || newVersion.orderCode || newVersion.salesOrderCode),
      customerCode: text(order.customerCode || newVersion.customerCode),
      customerName: text(order.customerName || newVersion.customerName),
      returnAmount: money(newVersion.totalAmount ?? newVersion.amount),
      returnedAmount: money(newVersion.totalAmount ?? newVersion.amount),
      correctionId: text(request.id),
      correctionCode: text(request.correctionCode),
      sourceType: 'RETURN_CORRECTION',
      idempotencyKey: `RETURN-CORRECTION:${text(newVersion.rootReturnOrderId || newVersion.id)}:${text(request.id)}:FINALIZE_CLOSEOUT`,
      reason: text(body.reason || request.reason),
      createdBy: text(actor.username || actor.code || actor.name || 'accountant'),
      createdAt: now,
      updatedAt: now,
      metadata: {
        ...(latest && latest.metadata ? latest.metadata : {}),
        returnCorrectionRequestId: text(request.id),
        oldReturnOrderVersion: request.metadata && request.metadata.oldReturnOrderVersion,
        newReturnOrderVersion: request.metadata && request.metadata.newReturnOrderVersion
      }
    };
    await DeliveryCloseoutVersion.findOneAndUpdate(
      { idempotencyKey: closeout.idempotencyKey },
      { $setOnInsert: closeout },
      { upsert: true, new: true, session }
    );
    const allocationResult = await OrderPaymentAllocationService.buildAndPostFromCloseout(order || {}, closeout, {
      session,
      actor: text(actor.username || actor.code || actor.name || 'accountant'),
      sourceType: 'return_correction_closeout'
    });
    const oldVersionId = request.metadata && request.metadata.oldReturnOrderVersion && request.metadata.oldReturnOrderVersion.id;
    const oldVersion = oldVersionId ? await returnOrderRepository.findByIdOrCode(oldVersionId, { session }) : null;
    if (oldVersion) {
      await returnOrderRepository.upsert({
        ...oldVersion,
        isCurrentVersion: false,
        active: false,
        supersededByReturnOrderId: text(newVersion.id || newVersion._id),
        supersededByReturnOrderCode: text(newVersion.code),
        updatedAt: now
      }, { session });
    }
    const currentVersion = {
      ...newVersion,
      isCurrentVersion: true,
      active: true,
      accountingStatus: 'accounting_confirmed',
      accountingConfirmed: true,
      accountingConfirmedAt: now,
      accountingConfirmedBy: text(actor.username || actor.code || actor.name || 'accountant'),
      updatedAt: now
    };
    await returnOrderRepository.upsert(currentVersion, { session });
    const final = await updateRequest(request.id || request.correctionCode, {
      status: STATUSES.APPLIED,
      appliedAt: now,
      appliedBy: actorSnapshot(actor),
      affectedReports: ['deliveryCloseoutVersions', 'orderPaymentAllocations', 'returnOrders'],
      metadata: {
        ...(request.metadata || {}),
        currentStep: STATUSES.APPLIED,
        closeoutCorrectionVersion: { id: closeout.id, code: closeout.code, version: closeoutVersion },
        allocation: allocationResult && allocationResult.allocation
          ? { allocationCode: allocationResult.allocation.allocationCode, idempotencyKey: allocationResult.allocation.idempotencyKey }
          : null
      }
    }, { session });
    return responseShape(final, { closeoutCorrectionVersion: closeout, allocation: allocationResult && allocationResult.allocation, newReturnOrder: currentVersion });
  });
}

module.exports = {
  STATUSES,
  STATE_MACHINE,
  createRequest,
  getRequest: findRequest,
  approveRequest,
  rejectRequest,
  applyRequest,
  warehouseRecheck,
  stockRepost,
  accountingFinalize,
  _private: {
    assertTransition,
    createCorrectionVersion,
    reverseStockIfNeeded,
    normalizeItems,
    summarizeItems
  }
};
