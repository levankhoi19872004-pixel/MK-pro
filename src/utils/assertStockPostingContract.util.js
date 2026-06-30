'use strict';

function clean(value = '') {
  return String(value ?? '').trim();
}

function upper(value = '') {
  return clean(value).toUpperCase();
}

function qty(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function validateStockPostingContract(movement = {}) {
  const errors = [];
  const direction = upper(movement.direction);
  const quantity = Math.abs(qty(movement.quantity ?? movement.qty ?? movement.inQty ?? movement.outQty));
  if (!['IN', 'OUT'].includes(direction)) errors.push({ code: 'STOCK_MOVEMENT_INVALID_DIRECTION', field: 'direction', actual: movement.direction });
  if (quantity <= 0) errors.push({ code: 'STOCK_MOVEMENT_INVALID_QUANTITY', field: 'quantity', actual: movement.quantity ?? movement.qty });
  for (const field of ['productCode', 'warehouseCode', 'sourceType', 'sourceId', 'idempotencyKey']) {
    if (!clean(movement[field])) errors.push({ code: 'STOCK_MOVEMENT_MISSING_REQUIRED_FIELD', field });
  }
  if (movement.isDeleted === true || clean(movement.deletedAt)) errors.push({ code: 'STOCK_MOVEMENT_DELETED_ROW', field: 'isDeleted/deletedAt' });
  return {
    ok: errors.length === 0,
    errors,
    movementId: clean(movement.id || movement.code || movement._id || '(unknown)')
  };
}

function assertStockPostingContract(movement = {}) {
  const result = validateStockPostingContract(movement);
  if (!result.ok) {
    const err = new Error(`Invalid stock movement ${result.movementId}: ${result.errors.map((item) => item.code).join(', ')}`);
    err.code = 'INVALID_STOCK_POSTING_CONTRACT';
    err.severity = 'P0';
    err.validation = result;
    throw err;
  }
  return movement;
}

module.exports = { validateStockPostingContract, assertStockPostingContract };
