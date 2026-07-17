'use strict';

const {
  assertReturnMutationAllowed,
  loadReturnMutationContext
} = require('../../domain/returns/ReturnMutationGuard');

async function assertEngineReturnMutationAllowed(engine, order, body = {}, options = {}, matchReturnOrder = null) {
  const currentReturns = await engine.findReturnOrdersFor([order], options);
  const returnOrder = typeof matchReturnOrder === 'function'
    ? currentReturns.find((ret) => matchReturnOrder(ret, order)) || null
    : null;
  const context = await loadReturnMutationContext({ order, returnOrder, options });
  assertReturnMutationAllowed({
    order,
    returnOrder,
    latestCloseoutVersion: context.latestCloseoutVersion,
    allocation: context.allocation,
    accountingLock: context.accountingLock,
    warehouseLock: context.warehouseLock,
    source: body.source || 'DeliveryEngine.saveReturn',
    operation: 'delivery_save_return'
  });
}

module.exports = { assertEngineReturnMutationAllowed };
