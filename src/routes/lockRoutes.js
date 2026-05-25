const express = require('express');
const router = express.Router();

const { readData, writeData } = require('../config/db');
const { setLockDate, getLockDate } = require('../services/lockService');

router.get('/api/lock', async (req, res) => {
  const data = await readData();
  res.json({ success: true, lockDate: getLockDate(data) });
});

router.post('/api/lock', async (req, res) => {
  const { date } = req.body;
  const data = await readData();
  const lockDate = setLockDate(data, date);
  await writeData(data);

  res.json({ success: true, lockDate });
});

module.exports = router;