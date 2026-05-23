const express = require('express');
const router = express.Router();

const auth = require('../middlewares/auth');
const { defaultData, normalizeData } = require('../data/defaultData');
const { pool, saveKhoData, getMemoryData, setMemoryData } = require('../config/db');
const { syncAccountsToStaff } = require('../utils/accounts');
const { rebuildMasterOrders, rebuildDebts } = require('../services/orderDebtService');
const { rebuildPaymentsFromOrders } = require('../services/paymentService');

router.get('/api/data', auth, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      const data = normalizeData(getMemoryData());
      syncAccountsToStaff(data);
      data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
      data.debts = rebuildDebts(data);
      setMemoryData(data);
      return res.json(data);
    }

    const result = await pool.query(`SELECT data FROM kho_data ORDER BY id ASC LIMIT 1`);

    if (result.rows.length === 0) {
      const data = defaultData();

      await pool.query(
        `INSERT INTO kho_data (data) VALUES ($1)`,
        [JSON.stringify(data)]
      );

      return res.json(data);
    }

    const data = normalizeData(result.rows[0].data);

    syncAccountsToStaff(data);
    data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
    data.debts = rebuildDebts(data);

    res.json(data);
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({
      error: 'Không lấy được dữ liệu',
      detail: err.message
    });
  }
});

router.post('/api/data', auth, async (req, res) => {
  try {
    const data = normalizeData(req.body);

    syncAccountsToStaff(data);
    data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
    data.payments = rebuildPaymentsFromOrders(data);
    data.debts = rebuildDebts(data);

    await saveKhoData(data);

    res.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/data error:', err);
    res.status(500).json({
      error: 'Không lưu được dữ liệu',
      detail: err.message
    });
  }
});

module.exports = router;
