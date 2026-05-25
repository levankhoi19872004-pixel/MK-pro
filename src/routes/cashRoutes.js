const express = require('express');
const router = express.Router();

const { readData, writeData } = require('../config/db');
const { addCash, listCash, getBalance } = require('../services/cashService');

router.get('/api/cash', async (req,res)=>{
  const data = await readData();
  res.json({ success:true, data:listCash(data) });
});

router.get('/api/cash/balance', async (req,res)=>{
  const data = await readData();
  res.json({ success:true, data:getBalance(data) });
});

router.post('/api/cash', async (req,res)=>{
  const data = await readData();
  const tx = addCash(data, req.body);
  await writeData(data);
  res.json({ success:true, data:tx });
});

module.exports = router;