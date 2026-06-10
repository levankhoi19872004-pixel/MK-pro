'use strict';

const ArLedger = require('../models/ArLedger');
const StockTransaction = require('../models/StockTransaction');
const eventLogService = require('../services/eventLogService');

async function validateAR({ minAbsDiff = 1000 } = {}) {
  const rows = await ArLedger.aggregate([
    { $match: { status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] } } },
    { $group: { _id: '$customerCode', debit: { $sum: { $ifNull: ['$debit', 0] } }, credit: { $sum: { $ifNull: ['$credit', 0] } } } },
    { $project: { debit: 1, credit: 1, balance: { $subtract: ['$debit', '$credit'] } } },
    { $match: { balance: { $lt: -Math.abs(minAbsDiff) } } }
  ]);
  if (rows.length) await eventLogService.recordEvent({ eventType: 'LEDGER_VALIDATION_WARNING', source: 'ledger_validator', sourceType: 'AR', payload: { rows } });
  return rows;
}

async function validateInventory() {
  const rows = await StockTransaction.aggregate([
    { $match: { status: { $nin: ['void', 'cancelled', 'canceled', 'deleted'] } } },
    { $group: { _id: { productCode: '$productCode', warehouseCode: { $ifNull: ['$warehouseCode', '$warehouseId'] } }, onHand: { $sum: { $ifNull: ['$quantity', '$qty'] } } } },
    { $match: { onHand: { $lt: 0 } } }
  ]);
  if (rows.length) await eventLogService.recordEvent({ eventType: 'LEDGER_VALIDATION_WARNING', source: 'ledger_validator', sourceType: 'INVENTORY', payload: { rows } });
  return rows;
}

async function runLedgerValidation(options = {}) {
  const [arWarnings, inventoryWarnings] = await Promise.all([validateAR(options), validateInventory(options)]);
  return { arWarnings, inventoryWarnings };
}

module.exports = { validateAR, validateInventory, runLedgerValidation };
