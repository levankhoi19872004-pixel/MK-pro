const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();

// 🚀 FIX LỖI DỮ LIỆU LỚN
app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

const PORT = process.env.PORT || 10000;
const SECRET = 'kho_pro_secret_key';

// ===== KẾT NỐI DATABASE =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== TẠO TABLE =====
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kho_data (
      id SERIAL PRIMARY KEY,
      data JSONB
    )
  `);

  const res = await pool.query('SELECT * FROM kho_data LIMIT 1');
  if (res.rows.length === 0) {
    await pool.query(
      'INSERT INTO kho_data (data) VALUES ($1)',
      [JSON.stringify({
        products: [],
        receipts: [],
        orders: [],
        customers: [],
        staff: [],
        masterOrders: [],
        shortageReports: []
      })]
    );
  }
}
initDB();

// ===== USER DEMO =====
const users = [
  { username: 'admin', password: '123456', role: 'admin', name: 'Admin' },
  { username: 'nv01', password: '123456', role: 'staff', name: 'Nhân viên 1' }
];

// ===== AUTH =====
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token lỗi' });
  }
}

// ===== LOGIN =====
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = users.find(
    u => u.username === username && u.password === password
  );

  if (!user) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });

  const token = jwt.sign(user, SECRET, { expiresIn: '7d' });

  res.json({ token, user });
});

// ===== LOGOUT =====
app.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

// ===== GET DATA =====
app.get('/api/data', auth, async (req, res) => {
  const result = await pool.query('SELECT data FROM kho_data LIMIT 1');
  res.json(result.rows[0].data);
});

// ===== SAVE DATA =====
app.post('/api/data', auth, async (req, res) => {
  try {
    const data = req.body;

    // 🚀 CHẶN DỮ LIỆU QUÁ LỚN
    const sizeMB = Buffer.byteLength(JSON.stringify(data)) / (1024 * 1024);

    if (sizeMB > 150) {
      return res.status(400).json({ error: 'Dữ liệu quá lớn (>150MB)' });
    }

    await pool.query('UPDATE kho_data SET data=$1 WHERE id=1', [data]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi lưu dữ liệu' });
  }
});

// ===== TEST =====
app.get('/', (req, res) => {
  res.send('API kho PRO đang chạy 🚀');
});

// ===== START =====
app.listen(PORT, () => {
  console.log('Server chạy cổng ' + PORT);
});