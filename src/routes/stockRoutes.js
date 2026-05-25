const express = require('express');
const router = express.Router();

const { readData } = require('../config/db');
const { calculateInventory } = require('../services/inventoryService');

function cleanCode(value) {
  return String(value || '').trim().toUpperCase();
}

router.get('/api/stock/balance', async (req, res) => {
  try {
    const data = await readData();
    const rows = calculateInventory(data, req.query);
    res.json({ success: true, total: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/api/stock/ledger', async (req, res) => {
  try {
    const data = await readData();
    const productCode = cleanCode(req.query.productCode);
    const warehouseCode = cleanCode(req.query.warehouseCode);
    const documentType = cleanCode(req.query.documentType);

    const rows = (data.postings || [])
      .filter(row => row.isCancelled !== true)
      .filter(row => !productCode || cleanCode(row.productCode) === productCode)
      .filter(row => !warehouseCode || cleanCode(row.warehouseCode) === warehouseCode)
      .filter(row => !documentType || cleanCode(row.documentType) === documentType)
      .sort((a, b) => new Date(b.occurredAt || b.createdAt) - new Date(a.occurredAt || a.createdAt));

    res.json({ success: true, total: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
