'use strict';

const { canMutateSalesOrder, normalizeExpectedVersion } = require('../domain/orders/salesOrderMutationPolicy');

function actorFromRequest(req = {}) {
  return req.user || req.mobileUser || null;
}

function expectedVersionFromRequest(req = {}) {
  const body = req.body || {};
  const headerValue = req.headers && (req.headers['if-match'] || req.headers['x-order-version']);
  return normalizeExpectedVersion(body.expectedVersion ?? body.sourceVersion ?? headerValue);
}

async function defaultFindOrder(id) {
  // Lazy-load repository so the pure policy/middleware harness can run without a Mongo driver.
  // Runtime behavior is unchanged once a real request reaches this boundary.
  const orderRepository = require('../repositories/orderRepository');
  return orderRepository.findByIdOrCode(id);
}

function createSalesOrderMutationMiddleware(command, dependencies = {}) {
  const findOrder = dependencies.findOrder || defaultFindOrder;
  const policy = dependencies.policy || canMutateSalesOrder;

  return async function salesOrderMutationBoundary(req, res, next) {
    try {
      const actor = actorFromRequest(req);
      const expectedVersion = expectedVersionFromRequest(req);
      const order = await findOrder(req.params && req.params.id);
      const result = policy({ actor, order, command, expectedVersion });
      if (!result.allowed) {
        return res.status(result.status).json({
          ok: false,
          success: false,
          code: result.code,
          message: result.message
        });
      }
      req.salesOrderMutation = { actor, order, command, expectedVersion, decision: result };
      return next();
    } catch (error) {
      const status = Number(error.status || error.statusCode || 500);
      return res.status(status).json({
        ok: false,
        success: false,
        code: error.code || 'ORDER_MUTATION_BOUNDARY_ERROR',
        message: status >= 500 && process.env.NODE_ENV === 'production'
          ? 'Không kiểm tra được quyền thay đổi đơn bán'
          : (error.message || 'Không kiểm tra được quyền thay đổi đơn bán')
      });
    }
  };
}

function requireSalesOrderMutation(command) {
  return createSalesOrderMutationMiddleware(command);
}

module.exports = {
  requireSalesOrderMutation,
  createSalesOrderMutationMiddleware,
  actorFromRequest,
  expectedVersionFromRequest,
  defaultFindOrder
};
