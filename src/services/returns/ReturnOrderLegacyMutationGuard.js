'use strict';

const {
  assertReturnMutationAllowed,
  loadReturnMutationContext,
  returnMutationErrorResult
} = require('../../domain/returns/ReturnMutationGuard');

function orderFrom(salesOrder = {}, returnOrder = {}) {
  return salesOrder && (salesOrder.id || salesOrder.code || salesOrder._id)
    ? salesOrder
    : {
      id: returnOrder.salesOrderId || returnOrder.orderId,
      code: returnOrder.salesOrderCode || returnOrder.orderCode,
      salesOrderId: returnOrder.salesOrderId || returnOrder.orderId,
      salesOrderCode: returnOrder.salesOrderCode || returnOrder.orderCode
    };
}

const OPERATIONS = {
  c: 'create_return',
  l: 'legacy_delivery_save_return',
  z: 'clear_return',
  u: 'update_return_items',
  x: 'cancel_return',
  r: 'restore_return'
};

async function guardLegacyReturnWrite(salesOrder = {}, returnOrder = {}, options = {}, operation = 'u', source = '') {
  try {
    const op = OPERATIONS[operation] || operation;
    const order = orderFrom(salesOrder, returnOrder);
    const context = await loadReturnMutationContext({ order, returnOrder, options });
    assertReturnMutationAllowed({
      order,
      returnOrder,
      latestCloseoutVersion: context.latestCloseoutVersion,
      allocation: context.allocation,
      accountingLock: context.accountingLock,
      warehouseLock: context.warehouseLock,
      source: source || op,
      operation: op
    });
    return null;
  } catch (err) {
    return returnMutationErrorResult(err);
  }
}

module.exports = { guardLegacyReturnWrite };
