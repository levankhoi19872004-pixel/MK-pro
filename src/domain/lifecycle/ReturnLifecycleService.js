'use strict';

const InventoryPostingService = require('../posting/InventoryPostingService');
const ArPostingService = require('../posting/ArPostingService');

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
  return ArPostingService.postReturn({
    ...returnOrder,
    accountingConfirmed: true,
    accountingStatus: 'confirmed'
  }, options);
}

async function confirmAccounting(returnOrder = {}, options = {}) {
  const arEntry = await postReturnAR(returnOrder, options);
  return { returnOrder, arEntry };
}

module.exports = {
  createPendingReturn,
  confirmReceive,
  confirmAccounting,
  postReturnStock,
  postReturnAR
};
