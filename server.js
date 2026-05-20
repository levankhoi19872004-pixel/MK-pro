const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors());
app.use(express.json({ limit: '200mb' }));

const PORT = process.env.PORT || 10000;
const SECRET = 'kho_pro_secret_key';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== INIT DATABASE =====
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kho_data (
      id SERIAL PRIMARY KEY,
      data JSONB
    )
  `);

  const check = await pool.query(`SELECT * FROM kho_data LIMIT 1`);

  if (check.rows.length === 0) {
    await pool.query(
      `INSERT INTO kho_data (data) VALUES ($1)`,
      [JSON.stringify({
        products: [],
        orders: [],
        customers: [],
        staff: [],
        receipts: [],
        masterOrders: [],
        shortageReports: []
      })]
    );
  }

  console.log("✅ DB READY");
}

initDB();

// ===== AUTH =====
const users = [
  { username: 'admin', password: '123456', role: 'admin', name: 'Admin' }
];

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });

  const token = jwt.sign(user, SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token lỗi' });
  }
}

// ===== GET DATA =====
app.get('/api/data', auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT data FROM kho_data LIMIT 1`);
    res.json(result.rows[0].data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi lấy dữ liệu' });
  }
});

// ===== SAVE DATA =====
app.post('/api/data', auth, async (req, res) => {
  try {
    const data = req.body;

    const sizeMB = JSON.stringify(data).length / 1024 / 1024;
    if (sizeMB > 80) {
      return res.status(400).json({ error: 'Dữ liệu quá lớn' });
    }

    await pool.query(`UPDATE kho_data SET data=$1 WHERE id=1`, [data]);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi lưu dữ liệu' });
  }
});

// ===== HEALTH =====
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ===== START =====
app.listen(PORT, () => {
  console.log('🚀 Server chạy cổng ' + PORT);
});