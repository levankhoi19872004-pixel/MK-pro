'use strict';

const InventoryPostingService = require('../posting/InventoryPostingService');
const ArPostingService = require('../posting/ArPostingService');
const ReturnStateMachine = require('./ReturnStateMachine');
const { RETURN_STATES } = ReturnStateMachine;

function getReturnOrderService() {
  // Lazy require để tránh vòng phụ thuộc:
  // delivery.engine -> ReturnLifecycleService -> returnOrderService -> delivery.engine.
  return require('../../services/returnOrderService');
}

function isDeliveryReturnPayload(body = {}) {
  const source = String(body.source || '').toLowerCase();
  const refType = String(body.refType || '').toLowerCase();
  return source.includes('delivery')
    || refType.includes('deliveryreturn')
    || refType.includes('canonicaldeliveryreturn');
}

async function createPendingReturn(body = {}, options = {}) {
  const returnOrderService = getReturnOrderService();

  // DeliveryEngine cần hỗ trợ cả case clear hàng trả về 0.
  // createPendingReturnOrder() hiện reject items rỗng, trong khi upsertDeliveryReturnOrder()
  // đã có logic clear phiếu tạm an toàn.
  if (isDeliveryReturnPayload(body) && typeof returnOrderService.upsertDeliveryReturnOrder === 'function') {
    return returnOrderService.upsertDeliveryReturnOrder(body, options);
  }

  return returnOrderService.createPendingReturnOrder(body, options);
}

async function confirmReceive(idOrCode, options = {}) {
  return getReturnOrderService().confirmReceiveReturnOrder(idOrCode, options);
}

async function postReturnStock(returnOrder = {}, options = {}) {
  return InventoryPostingService.postReturnIn(returnOrder, options);
}

async function postReturnAR(returnOrder = {}, options = {}) {
  ReturnStateMachine.assertCanPostAR(returnOrder);

  return ArPostingService.postReturn({
    ...returnOrder,
    accountingConfirmed: true,
    accountingStatus: RETURN_STATES.ACCOUNTING_CONFIRMED
  }, options);
}

async function confirmAccounting(returnOrder = {}, options = {}) {
  const returnOrderService = getReturnOrderService();

  if (typeof returnOrder === 'string') {
    return returnOrderService.confirmAccountingReturnOrder(returnOrder, {}, options);
  }

  const idOrCode = returnOrder.id || returnOrder.code;
  if (idOrCode && typeof returnOrderService.confirmAccountingReturnOrder === 'function') {
    return returnOrderService.confirmAccountingReturnOrder(idOrCode, returnOrder, options);
  }

  ReturnStateMachine.assertCanConfirmAccounting(returnOrder);
  const accountingConfirmed = {
    ...returnOrder,
    ...ReturnStateMachine.patchForState(returnOrder, RETURN_STATES.ACCOUNTING_CONFIRMED)
  };
  const arEntry = await postReturnAR(accountingConfirmed, options);
  returnOrder = accountingConfirmed;
  return { returnOrder, arEntry };
}

module.exports = {
  createPendingReturn,
  confirmReceive,
  confirmAccounting,
  postReturnStock,
  postReturnAR
};
