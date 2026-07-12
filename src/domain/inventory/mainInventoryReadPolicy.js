'use strict';

const { STOCK_WAREHOUSE_CODE } = require('../../constants/business.constants');

function mainWarehouseCode() {
  return String(STOCK_WAREHOUSE_CODE || 'MAIN').trim().toUpperCase();
}

function mainInventoryFilter(filter = {}) {
  const base = filter && typeof filter === 'object' && !Array.isArray(filter) ? { ...filter } : {};
  base.warehouseCode = mainWarehouseCode();
  return base;
}

function isMainWarehouseRow(row = {}) {
  return String(row.warehouseCode || '').trim().toUpperCase() === mainWarehouseCode();
}

module.exports = {
  mainWarehouseCode,
  mainInventoryFilter,
  isMainWarehouseRow
};
