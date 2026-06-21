'use strict';

const crypto = require('node:crypto');
const MobileSyncOperation = require('../../models/MobileSyncOperation');
const SalesOrderCommandService = require('../sales-order/SalesOrderCommandService');
const { createMobileSalesService } = require('./sales.service');
const DebtCollectionService = require('../DebtCollectionService');
const FieldOperationService = require('../field/FieldOperationService');
const dateUtil = require('../../utils/date.util');
const { makeId } = require('../../utils/common.util');
const { tenantIdOf, scopeTenant } = require('../../utils/tenant.util');
const { DeliveryEngine } = require('../../engines/delivery.engine');
const SalesOrder = require('../../models/SalesOrder');
const MasterOrder = require('../../models/MasterOrder');
const ReturnOrder = require('../../models/ReturnOrder');
const StockTransaction = require('../../models/StockTransaction');
const ArLedger = require('../../models/ArLedger');
const User = require('../../models/User');
const { withMongoTransaction } = require('../../utils/transaction.util');

const deliveryEngine = new DeliveryEngine({ SalesOrder, MasterOrder, ReturnOrder, StockTransaction, ArLedger, User });


function text(value) {
  return String(value || '').trim();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value || {}))).digest('hex');
}

function actorCode(actor = {}) {
  return text(actor.staffCode || actor.salesStaffCode || actor.deliveryStaffCode || actor.code || actor.username);
}

function bindSalesPayload(payload = {}, actor = {}) {
  const role = text(actor.role).toLowerCase();
  if (role !== 'sales') return { ...payload };
  const staffCode = text(actor.salesStaffCode || actor.salesmanCode || actor.nvbhCode || actor.code || actor.staffCode);
  const staffName = text(actor.salesStaffName || actor.salesmanName || actor.nvbhName || actor.fullName || actor.name);
  return {
    ...payload,
    salesStaffCode: staffCode,
    salesStaffName: staffName,
    salesmanCode: staffCode,
    salesmanName: staffName,
    nvbhCode: staffCode,
    nvbhName: staffName,
    staffCode: '',
    staffName: '',
    source: payload.source || 'mobile_offline_sync',
    orderSource: 'NVBH'
  };
}

function bindDeliveryPayload(payload = {}, actor = {}) {
  const role = text(actor.role).toLowerCase();
  if (role !== 'delivery') return { ...payload };
  const staffCode = text(actor.staffCode || actor.deliveryStaffCode || actor.code);
  const staffName = text(actor.fullName || actor.deliveryStaffName || actor.name);
  return {
    ...payload,
    deliveryStaffCode: staffCode,
    deliveryStaffName: staffName,
    staffCode,
    staffName,
    actorDeliveryStaffCode: staffCode,
    actorStaffCode: staffCode,
    enforceDeliveryOwnership: true
  };
}

async function dispatch(operation, context) {
  const payload = operation.payload || {};
  switch (text(operation.type || operation.operationType)) {
    case 'sales_order_create': {
      const boundPayload = bindSalesPayload({
        ...payload,
        idempotencyKey: payload.idempotencyKey || operation.operationId
      }, context.actor);
      if (context.mobileSalesService && typeof context.mobileSalesService.createSalesOrder === 'function') {
        const result = await context.mobileSalesService.createSalesOrder({
          body: boundPayload,
          mobileUser: context.actor
        });
        if (Number(result?.statusCode || 200) >= 400 || result?.body?.ok === false) {
          throw Object.assign(new Error(result?.body?.message || 'Không tạo được đơn offline'), {
            status: result?.statusCode || 400,
            code: result?.body?.code || 'MOBILE_OFFLINE_SALES_CREATE_FAILED'
          });
        }
        return result?.body || result;
      }
      // Compatibility fallback for direct service consumers that do not provide mobile ctx.
      return SalesOrderCommandService.createOrder(boundPayload, context.actor);
    }
    case 'debt_collection_submit':
      return DebtCollectionService.submitDebtCollection({
        body: { ...payload, idempotencyKey: payload.idempotencyKey || operation.operationId },
        mobileUser: context.actor
      });
    case 'delivery_return_save':
      return withMongoTransaction((session) => deliveryEngine.saveReturn(
        bindDeliveryPayload(payload, context.actor),
        { session }
      ));
    case 'delivery_payment_save':
      return withMongoTransaction((session) => deliveryEngine.savePayment(
        bindDeliveryPayload(payload, context.actor),
        { session }
      ));
    case 'delivery_confirm':
      return withMongoTransaction((session) => deliveryEngine.confirm(
        bindDeliveryPayload(payload, context.actor),
        { session }
      ));
    case 'visit_check_in':
      return FieldOperationService.checkIn(payload.planId, payload.stopId, {
        ...payload,
        idempotencyKey: payload.idempotencyKey || operation.operationId
      }, context);
    case 'visit_complete':
      return FieldOperationService.complete(payload.executionId, {
        ...payload,
        idempotencyKey: payload.idempotencyKey || operation.operationId
      }, context);
    default:
      throw Object.assign(new Error(`Loại đồng bộ không được hỗ trợ: ${operation.type}`), {
        status: 400,
        code: 'UNSUPPORTED_SYNC_OPERATION'
      });
  }
}

async function processOperation(operation = {}, context = {}) {
  const tenantId = tenantIdOf({ tenantId: context.tenantId });
  const actor = context.actor || {};
  const deviceId = text(context.deviceId || operation.deviceId);
  const operationId = text(operation.operationId || operation.id);
  const operationType = text(operation.type || operation.operationType);
  if (!deviceId || !operationId || !operationType) {
    throw Object.assign(new Error('Thiếu deviceId, operationId hoặc operationType'), { status: 400 });
  }

  const payloadHash = stableHash(operation.payload);
  const filter = scopeTenant({ deviceId, operationId }, tenantId);
  const now = dateUtil.nowIso();
  const maxAttempts = Math.max(1, Math.min(Number(operation.maxAttempts || 8), 20));
  let existed = await MobileSyncOperation.findOne(filter).lean();

  if (existed && existed.payloadHash !== payloadHash) {
    return {
      operationId,
      status: 'conflict',
      code: 'IDEMPOTENCY_PAYLOAD_MISMATCH',
      message: 'operationId đã được dùng với nội dung khác'
    };
  }

  if (existed && ['completed', 'conflict'].includes(existed.status)) {
    return {
      operationId,
      status: existed.status,
      response: existed.response,
      error: existed.error,
      replayed: true
    };
  }

  if (existed && Number(existed.attempts || 0) >= Number(existed.maxAttempts || maxAttempts)) {
    return {
      operationId,
      status: 'failed',
      error: existed.error || 'Đã vượt số lần thử đồng bộ',
      replayed: true,
      exhausted: true
    };
  }

  if (existed) {
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const claim = await MobileSyncOperation.findOneAndUpdate({
      ...filter,
      payloadHash,
      $or: [
        { status: 'failed' },
        { status: 'processing', updatedAt: { $lt: staleBefore } }
      ]
    }, {
      $set: { status: 'processing', error: '', updatedAt: now },
      $inc: { attempts: 1 }
    }, { new: true }).lean();
    if (!claim) {
      return {
        operationId,
        status: existed.status || 'processing',
        response: existed.response || {},
        error: existed.error || '',
        replayed: true
      };
    }
    existed = claim;
  } else {
    try {
      await MobileSyncOperation.create([{
        id: makeId('MSO'),
        tenantId,
        deviceId,
        operationId,
        operationType,
        actorCode: actorCode(actor),
        clientCreatedAt: text(operation.clientCreatedAt),
        payloadHash,
        status: 'processing',
        attempts: 1,
        maxAttempts,
        response: {},
        error: '',
        createdAt: now,
        completedAt: '',
        updatedAt: now
      }]);
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await MobileSyncOperation.findOne(filter).lean();
        return {
          operationId,
          status: duplicate?.status || 'processing',
          response: duplicate?.response || {},
          error: duplicate?.error || '',
          replayed: true
        };
      }
      throw error;
    }
  }

  try {
    const response = await dispatch({ ...operation, operationId, type: operationType }, {
      tenantId,
      actor,
      deviceId
    });
    if (response && response.error) {
      throw Object.assign(new Error(response.error), { status: response.status || 400, code: response.code });
    }
    await MobileSyncOperation.updateOne(filter, {
      $set: {
        status: 'completed',
        response: response || {},
        error: '',
        completedAt: dateUtil.nowIso(),
        updatedAt: dateUtil.nowIso()
      }
    });
    return { operationId, status: 'completed', response };
  } catch (error) {
    const status = error.status === 409 ? 'conflict' : 'failed';
    await MobileSyncOperation.updateOne(filter, {
      $set: {
        status,
        error: text(error.message).slice(0, 2000),
        completedAt: dateUtil.nowIso(),
        updatedAt: dateUtil.nowIso()
      }
    });
    return {
      operationId,
      status,
      code: error.code,
      message: error.message
    };
  }
}

async function syncBatch(input = {}, context = {}) {
  const operations = Array.isArray(input.operations) ? input.operations : [];
  if (!operations.length) throw Object.assign(new Error('Danh sách đồng bộ trống'), { status: 400 });
  if (operations.length > 100) throw Object.assign(new Error('Mỗi lần chỉ đồng bộ tối đa 100 thao tác'), { status: 413 });
  const deviceId = text(input.deviceId || context.deviceId);
  if (!deviceId) throw Object.assign(new Error('Thiếu mã thiết bị'), { status: 400 });

  const results = [];
  for (const operation of operations) {
    results.push(await processOperation({ ...operation, deviceId }, { ...context, deviceId }));
  }

  return {
    deviceId,
    serverTime: dateUtil.nowIso(),
    results,
    summary: {
      total: results.length,
      completed: results.filter((row) => row.status === 'completed').length,
      failed: results.filter((row) => row.status === 'failed').length,
      conflicts: results.filter((row) => row.status === 'conflict').length,
      replayed: results.filter((row) => row.replayed).length
    }
  };
}

function createMobileSyncService(ctx) {
  if (!ctx || typeof ctx !== 'object') throw new Error('Mobile sync service requires ctx');
  const mobileSalesService = createMobileSalesService(ctx);
  return {
    syncBatch(input = {}, context = {}) {
      return syncBatch(input, { ...context, mobileSalesService });
    },
    processOperation(operation = {}, context = {}) {
      return processOperation(operation, { ...context, mobileSalesService });
    }
  };
}

module.exports = {
  createMobileSyncService,
  syncBatch,
  processOperation,
  dispatch,
  stableHash,
  canonicalize,
  bindSalesPayload
};
