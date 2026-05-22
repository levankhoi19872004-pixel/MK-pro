const { Pool } = require('pg');
const { defaultData, normalizeData } = require('../data/defaultData');
const { syncAccountsToStaff } = require('../utils/accounts');
const { rebuildMasterOrders, rebuildDebts } = require('../services/orderDebtService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Dự phòng khi chạy local/chưa gắn DATABASE_URL: API vẫn sống để kiểm tra login/health.
let memoryData = defaultData();

function getMemoryData() {
  return normalizeData(memoryData);
}

function setMemoryData(data) {
  memoryData = normalizeData(data);
  return memoryData;
}

async function readKhoData() {
  if (!process.env.DATABASE_URL) {
    return normalizeData(memoryData);
  }

  const result = await pool.query(`SELECT data FROM kho_data ORDER BY id ASC LIMIT 1`);
  if (result.rows.length === 0) return defaultData();
  return normalizeData(result.rows[0].data);
}

async function initDB() {
  if (!process.env.DATABASE_URL) {
    console.warn('Chua co DATABASE_URL');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kho_data (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);

  const check = await pool.query(`SELECT id, data FROM kho_data ORDER BY id ASC LIMIT 1`);

  if (check.rows.length === 0) {
    await pool.query(`INSERT INTO kho_data (data) VALUES ($1)`, [JSON.stringify(defaultData())]);
  } else {
    const fixed = normalizeData(check.rows[0].data);

    syncAccountsToStaff(fixed);
    fixed.masterOrders = rebuildMasterOrders(fixed.orders, fixed.masterOrders);
    fixed.debts = rebuildDebts(fixed);

    await pool.query(`UPDATE kho_data SET data=$1 WHERE id=$2`, [
      JSON.stringify(fixed),
      check.rows[0].id
    ]);
  }

  console.log('DB READY');
}

async function getKhoRow() {
  const result = await pool.query(`SELECT id, data FROM kho_data ORDER BY id ASC LIMIT 1`);
  return result.rows[0] || null;
}

async function saveKhoData(data, id) {
  if (!process.env.DATABASE_URL) {
    memoryData = normalizeData(data);
    return { success: true, data: memoryData };
  }

  if (id) {
    await pool.query(`UPDATE kho_data SET data=$1 WHERE id=$2`, [JSON.stringify(data), id]);
    return { success: true, data };
  }

  const existing = await pool.query(`SELECT id FROM kho_data ORDER BY id ASC LIMIT 1`);

  if (existing.rows.length === 0) {
    await pool.query(`INSERT INTO kho_data (data) VALUES ($1)`, [JSON.stringify(data)]);
  } else {
    await pool.query(`UPDATE kho_data SET data=$1 WHERE id=$2`, [
      JSON.stringify(data),
      existing.rows[0].id
    ]);
  }

  return { success: true, data };
}

module.exports = {
  pool,
  initDB,
  readKhoData,
  getKhoRow,
  saveKhoData,
  getMemoryData,
  setMemoryData
};
