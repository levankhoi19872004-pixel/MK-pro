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

function orderDeleteDebugPayload(order = {}, extra = {}) {
  return {
    ref: extra.ref || '',
    orderId: order.id || '',
    orderCode: order.code || order.orderCode || order.salesOrderCode || '',
    status: order.status || '',
    lifecycleStatus: order.lifecycleStatus || '',
    deliveryStatus: order.deliveryStatus || '',
    accountingStatus: order.accountingStatus || '',
    stockPosted: Boolean(order.stockPosted),
    masterOrderId: order.masterOrderId || '',
    masterOrderCode: order.masterOrderCode || '',
    decision: extra.decision || '',
    actorCode: extra.actorCode || ''
  };
}

function logDeleteDebug(stage, payload = {}) {
  if (process.env.DEBUG_SALES_ORDER_DELETE !== '1') return;
  // Không log thông tin khách hàng/số tiền; chỉ log khóa kỹ thuật để trace lỗi xóa.
  console.info(`[SALES_ORDER_DELETE_${stage}]`, payload);
}

async function deleteSalesOrder(idOrCode, command = {}) {
  const order = await orderRepository.findByIdOrCode(idOrCode);

  if (!order) {
    logDeleteDebug('NOT_FOUND', { ref: String(idOrCode || '').trim() });
    return {
      error: 'Không tìm thấy đơn bán theo mã đã gửi. Hãy thử tải lại danh sách rồi xóa lại.',
      status: 404,
      code: 'ORDER_NOT_FOUND'
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

  const actor = actorFromCommand(command);
  logDeleteDebug('RESOLVED', orderDeleteDebugPayload(order, { ref: String(idOrCode || '').trim(), actorCode: actor.actorCode }));
  const earlyDecision = decideSalesOrderDeletion(order, {}, { ...command, ...actor });
  if (earlyDecision.mode === 'ALREADY_DELETED') {
    return {
      hardDeleted: false,
      alreadyDeleted: true,
      mode: earlyDecision.mode,
      message: earlyDecision.message,
      salesOrder: order
    };
  }
  if (!earlyDecision.allowed && ['ORDER_ALREADY_MERGED'].includes(earlyDecision.code)) {
    return {
      error: earlyDecision.message,
      status: earlyDecision.status || 400,
      code: earlyDecision.code
    };
  }

  const commandId = command.idempotencyKey || makeId('SOD');
  const deletedOrderCode = order.code || order.id || String(idOrCode);
  let finalDecision = null;

  await tx.withMongoTransaction(async (session) => {
    // Phase36D revised: chỉ hydrate dependency context một lần trong transaction.
    // Các guard nhẹ ALREADY_DELETED/ORDER_ALREADY_MERGED đã chạy trước đó để tránh mở transaction không cần thiết.
    const relatedInTx = await deletionRepository.loadSalesOrderDeletionContext(order, { session });
    const decisionInTx = decideSalesOrderDeletion(order, relatedInTx, { ...command, ...actor });
    finalDecision = decisionInTx;
    logDeleteDebug('DECISION', orderDeleteDebugPayload(order, {
      ref: String(idOrCode || '').trim(),
      actorCode: actor.actorCode,
      decision: decisionInTx.code || decisionInTx.mode || ''
    }));

    if (!decisionInTx.allowed) {
      const err = new Error(decisionInTx.message || 'Không thể xóa đơn bán');
      err.status = decisionInTx.status || 400;
      err.code = decisionInTx.code;
      throw err;
    }

    if (decisionInTx.mode === 'ALREADY_DELETED') return;

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

    const removeResult = await orderRepository.removeResolved(order, idOrCode, { session });
    const deletedCount = Number(removeResult?.deletedCount || removeResult?.n || 0);
    if (deletedCount !== 1) {
      const err = new Error('Không xóa được đơn bán do khóa định danh không khớp. Hãy tải lại danh sách rồi thử lại.');
      err.status = 409;
      err.code = 'ORDER_DELETE_IDENTITY_MISMATCH';
      throw err;
    }
  });

  return {
    hardDeleted: true,
    mode: finalDecision?.mode,
    message: finalDecision?.message || `Đã xóa đơn ${deletedOrderCode}`,
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
