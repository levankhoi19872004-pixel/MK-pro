'use strict';

const tx = require('../../utils/transaction.util');
const dateUtil = require('../../utils/date.util');
const { makeId } = require('../../utils/common.util');

const orderRepository = require('../../repositories/orderRepository');
const deletionRepository = require('../../repositories/salesOrderDeletion.repository');
const tombstoneRepository = require('../../repositories/salesOrderTombstone.repository');

const InventoryPostingService = require('../posting/InventoryPostingService');
const ArPostingService = require('../posting/ArPostingService');

const returnOrderService = require('../../services/returnOrderService');
const auditService = require('../../services/auditService');

const {
  decideSalesOrderDeletion,
  isStockPosted
} = require('./salesOrderDeletion.policy');

function actorFromCommand(command = {}) {
  return {
    actorCode: String(command.actorCode || command.user?.code || command.user?.staffCode || '').trim(),
    actorName: String(command.actorName || command.user?.name || command.user?.fullName || command.userName || '').trim()
  };
}

function buildVoidPatch(order = {}, command = {}, decision = {}) {
  const now = dateUtil.nowIso();

  return {
    status: 'void',
    deliveryStatus: 'void',
    lifecycleStatus: 'void',
    deleted: true,
    isDeleted: true,
    deletedAt: now,
    deleteReason: String(command.reason || command.deleteReason || '').trim(),
    deleteMode: decision.mode,
    stockPosted: decision.reverseStock ? false : Boolean(order.stockPosted),
    stockReversedAt: decision.reverseStock ? now : order.stockReversedAt,
    arReversedAt: decision.reverseAr ? now : order.arReversedAt,
    updatedAt: now
  };
}

async function writeAudit(order = {}, before = {}, after = {}, decision = {}, command = {}, options = {}) {
  if (!auditService || typeof auditService.log !== 'function') return null;

  return auditService.log('sales_order_delete', {
    refType: 'SALES_ORDER',
    refId: order.id || order._id || order.code,
    refCode: order.code || order.id,
    before,
    after,
    note: String(command.reason || command.deleteReason || '').trim(),
    userName: command.actorName || command.userName || '',
    meta: {
      mode: decision.mode,
      source: command.source || 'web'
    }
  }, options);
}

async function deleteSalesOrder(idOrCode, command = {}) {
  const order = await orderRepository.findByIdOrCode(idOrCode);
  if (!order) {
    return {
      error: 'Không tìm thấy đơn bán',
      status: 404
    };
  }

  if (command.ownerFilter) {
    const owned = await orderRepository.findAll({
      $and: [
        { $or: [{ id: order.id }, { code: order.code }, { _id: order._id }] },
        command.ownerFilter
      ]
    }, { limit: 1 });

    if (!owned.length) {
      return {
        error: 'Không có quyền xóa đơn này',
        status: 403
      };
    }
  }

  const related = await deletionRepository.loadSalesOrderDeletionContext(order);
  const actor = actorFromCommand(command);
  const decision = decideSalesOrderDeletion(order, related, { ...command, ...actor });

  if (!decision.allowed) {
    return {
      error: decision.message,
      status: decision.status || 400,
      code: decision.code
    };
  }

  if (decision.mode === 'NOOP_ALREADY_DELETED') {
    return {
      hardDeleted: false,
      alreadyDeleted: true,
      mode: decision.mode,
      message: decision.message,
      salesOrder: order
    };
  }

  let resultOrder = order;
  let tombstone = null;
  const commandId = command.idempotencyKey || makeId('SOD');

  await tx.withMongoTransaction(async (session) => {
    const relatedInTx = await deletionRepository.loadSalesOrderDeletionContext(order, { session });

    if (decision.cancelReturnDraft) {
      const cancelResult = await returnOrderService.cancelReturnDraftForSalesOrder(order, { session });
      if (cancelResult && cancelResult.error) {
        const err = new Error(cancelResult.error);
        err.status = cancelResult.status || 400;
        throw err;
      }
    }

    if (decision.reverseStock && isStockPosted(order)) {
      await InventoryPostingService.reverseMovement(order, {
        type: 'SALE',
        reverseType: 'SALE_REVERSAL',
        direction: 'OUT',
        refType: 'SALES_ORDER',
        refId: order.id || order._id || order.code,
        refCode: order.code || order.id,
        date: dateUtil.todayVN(),
        note: `Đảo xuất kho do xóa đơn bán ${order.code || order.id}`,
        commandId
      }, { session });
    }

    if (decision.reverseAr) {
      await ArPostingService.reverseSale(order, { session, commandId });
    }

    if (decision.archiveTombstone) {
      tombstone = await tombstoneRepository.createSalesOrderTombstone(
        order,
        decision,
        { ...command, ...actor },
        relatedInTx,
        { session }
      );
    }

    if (decision.hardDelete) {
      await orderRepository.remove(order.id || order.code || idOrCode, { session });

      resultOrder = {
        ...order,
        status: 'deleted',
        deliveryStatus: 'deleted',
        deleted: true,
        isDeleted: true,
        deletedAt: dateUtil.nowIso(),
        deleteReason: String(command.reason || command.deleteReason || '').trim(),
        deleteMode: decision.mode
      };
    } else {
      const patch = buildVoidPatch(order, { ...command, ...actor }, decision);
      const patched = await orderRepository.patchByIdentity(order.id || order.code || idOrCode, patch, { session });
      resultOrder = patched || { ...order, ...patch };
    }

    await writeAudit(order, order, resultOrder, decision, { ...command, ...actor }, { session });
  });

  return {
    hardDeleted: Boolean(decision.hardDelete),
    mode: decision.mode,
    message: decision.message,
    tombstoneId: tombstone?.id || '',
    salesOrder: resultOrder
  };
}

module.exports = {
  deleteSalesOrder
};
