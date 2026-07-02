'use strict';

const inventoryStockService = require('../services/inventoryStock.service');
const asyncHandler = require('../middlewares/asyncHandler');
const { toNumber, formatCaseLooseQty } = require('../utils/common.util');
const { buildSourceNote } = require('../services/source-contracts/SourceNoteBuilder');

function toInventoryItem(row = {}) {
  const availableQty = toNumber(row.availableQty ?? row.quantity ?? row.qty ?? row.onHand);
  const onHand = toNumber(row.onHand ?? row.quantity ?? row.qty ?? availableQty);
  const reservedQty = toNumber(row.reservedQty);
  const conversionRate = Math.max(1, toNumber(row.conversionRate || row.packingQty || row.unitsPerCase || 1));

  return {
    productId: row.productId || '',
    productCode: row.productCode || '',
    productName: row.productName || '',
    warehouseCode: inventoryStockService.stockWarehouseCode(),
    warehouseName: inventoryStockService.stockWarehouseName(),
    availableQty,
    onHand,
    reservedQty,
    qty: availableQty,
    quantity: availableQty,
    stockDisplay: row.stockDisplay || formatCaseLooseQty(availableQty, conversionRate),
    conversionRate,
    updatedAt: row.updatedAt || row.lastTransactionAt || ''
  };
}

const current = asyncHandler(async (req, res) => {
  const result = await inventoryStockService.getInventorySummary(req.query || {});
  const items = (result.stock || []).map(toInventoryItem);

  res.json({
    ok: true,
    inventorySource: 'inventories',
    source: 'inventoryStock.service',
    sourceNote: buildSourceNote('inventory-current', { filters: req.query || {}, user: req.user || {} }),
    items,
    summary: result.summary || {
      totalRows: items.length,
      totalQuantity: items.reduce((sum, row) => sum + toNumber(row.availableQty), 0),
      outOfStock: items.filter((row) => toNumber(row.availableQty) <= 0).length,
      lowStock: 0,
      negativeStockCount: items.filter((row) => toNumber(row.availableQty) < 0).length
    }
  });
});

const check = asyncHandler(async (req, res) => {
  const result = await inventoryStockService.checkAvailableForItems(req.body?.items || []);

  res.status(result.enough ? 200 : 409).json({
    ok: result.enough,
    enough: result.enough,
    shortages: result.shortages,
    rows: result.rows,
    inventorySource: 'inventories',
    source: 'inventoryStock.service',
    sourceNote: buildSourceNote('inventory-current', { filters: req.body || {}, user: req.user || {}, sourceWarnings: result.enough ? [] : ['Có shortage khi check tồn'] })
  });
});

module.exports = {
  current,
  check
};
