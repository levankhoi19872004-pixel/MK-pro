'use strict';

const tx = require('../../utils/transaction.util');
const dateUtil = require('../../utils/date.util');
const { makeId } = require('../../utils/common.util');

const orderRepository = require('../../repositories/orderRepository');
const deletionRepository = require('../../repositories/salesOrderDeletion.repository');

const InventoryPostingService = require('../posting/InventoryPostingService');
const returnOrderService = require('../../services/returnOrderService');
const internalSaleAllocationService = require('../../services/internalSaleAllocation.service');

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
        {
          $or: [
            { id: order.id },
            { code: order.code },
            { _id: order._id }
          ]
        },
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

  if (decision.mode === 'ALREADY_DELETED') {
    return {
      hardDeleted: false,
      alreadyDeleted: true,
      mode: decision.mode,
      message: decision.message,
      salesOrder: order
    };
  }

  const commandId = command.idempotencyKey || makeId('SOD');
  const deletedOrderCode = order.code || order.id || String(idOrCode);

  await tx.withMongoTransaction(async (session) => {
    const relatedInTx = await deletionRepository.loadSalesOrderDeletionContext(order, { session });
    const decisionInTx = decideSalesOrderDeletion(order, relatedInTx, { ...command, ...actor });

    if (!decisionInTx.allowed) {
      const err = new Error(decisionInTx.message || 'Không thể xóa đơn bán');
      err.status = decisionInTx.status || 400;
      throw err;
    }

    if (decisionInTx.reverseStock && isStockPosted(order)) {
      await InventoryPostingService.reverseMovement(order, {
        type: 'SALE',
        reverseType: 'SALE_REVERSAL',
        direction: 'OUT',
        refType: 'SALES_ORDER',
        refId: order.id || order._id || order.code,
        refCode: order.code || order.id,
        date: dateUtil.todayVN(),
        note: `Đảo tồn do xóa đơn bán ${order.code || order.id}`,
        commandId
      }, { session });
    }

    if (relatedInTx.hasReturnDraft) {
      const cancelResult = await returnOrderService.cancelReturnDraftForSalesOrder(order, { session });
      if (cancelResult && cancelResult.error) {
        const err = new Error(cancelResult.error);
        err.status = cancelResult.status || 400;
        throw err;
      }
    }

    await internalSaleAllocationService.releaseForDeletedOrder(order, actor, { session });

    await orderRepository.remove(order.id || order.code || idOrCode, { session });
  });

  return {
    hardDeleted: true,
    mode: decision.mode,
    message: decision.message || `Đã xóa đơn ${deletedOrderCode}`,
    salesOrder: {
      id: order.id,
      code: deletedOrderCode,
      deleted: true
    }
  };
}

module.exports = {
  deleteSalesOrder
};
