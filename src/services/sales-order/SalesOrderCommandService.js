'use strict';

const legacy = require('../orderLegacy.service');
const orderRepository = require('../../repositories/orderRepository');
const { canMutateSalesOrder } = require('../../domain/orders/salesOrderMutationPolicy');

async function authorizeCommand(command, idOrCode, body = {}, context = {}) {
  const order = context.order || await orderRepository.findByIdOrCode(idOrCode);
  const decision = canMutateSalesOrder({
    actor: context.actor || context.user || {},
    order,
    command,
    expectedVersion: context.expectedVersion ?? body.expectedVersion ?? body.sourceVersion
  });
  if (!decision.allowed) {
    return { error: decision.message, status: decision.status, code: decision.code };
  }
  return { order, decision };
}

async function updateOrder(idOrCode, body = {}, context = {}) {
  const authorization = await authorizeCommand('update', idOrCode, body, context);
  if (authorization.error) return authorization;
  return legacy.updateOrder(idOrCode, body);
}

async function cancelOrder(idOrCode, body = {}, context = {}) {
  const authorization = await authorizeCommand('cancel', idOrCode, body, context);
  if (authorization.error) return authorization;
  return legacy.cancelOrder(idOrCode, body);
}

async function deleteOrder(idOrCode, body = {}, context = {}) {
  const authorization = await authorizeCommand('delete', idOrCode, body, context);
  if (authorization.error) return authorization;
  return legacy.deleteOrder(idOrCode, body);
}

module.exports = {
  createOrder: legacy.createOrder,
  updateOrder,
  updateVatInvoiceSetting: legacy.updateVatInvoiceSetting,
  cancelOrder,
  deleteOrder,
  syncMasterOrderSummary: legacy.syncMasterOrderSummary,
  authorizeCommand
};
