'use strict';

function clean(value = '') {
  return String(value ?? '').trim();
}

class CloseoutValidationError extends Error {
  constructor(payload = {}) {
    super(clean(payload.message) || clean(payload.code) || 'Closeout validation failed');
    this.name = 'CloseoutValidationError';
    this.status = payload.status || 400;
    this.code = clean(payload.code) || 'CLOSEOUT_VALIDATION_FAILED';
    this.data = payload.data || payload;
  }
}

function validateCloseoutContext(context = {}, helpers = {}) {
  const command = context.command || {};
  if (!Array.isArray(command.selectedOrderIds) || !command.selectedOrderIds.length) {
    throw new CloseoutValidationError({
      code: 'ORDER_SELECTION_REQUIRED',
      message: 'Vui lòng chọn ít nhất một đơn để chốt sổ.',
      status: 400
    });
  }

  if (!Array.isArray(context.orders) || !context.orders.length) {
    throw new CloseoutValidationError({
      code: 'ORDER_SELECTION_NOT_FOUND',
      message: `Không tìm thấy đơn đã chọn trong ngày ${command.date || ''} để kế toán xác nhận`,
      status: 404
    });
  }

  if (typeof helpers.validateSelectedOrderScope === 'function') {
    const scopeError = helpers.validateSelectedOrderScope(context.orders, command.body || {}, command.selectedOrderIds);
    if (scopeError) throw new CloseoutValidationError(scopeError);
  }

  if (typeof helpers.assertReturnOrdersInventoryReady === 'function') {
    helpers.assertReturnOrdersInventoryReady(context.returnOrders || []);
  }

  return true;
}

module.exports = {
  CloseoutValidationError,
  validateCloseoutContext,
  _internal: { clean }
};
