const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors());
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

const PORT = process.env.PORT || 10000;
const SECRET = 'kho_pro_secret_key';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ===== TẠO BẢNG =====
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      sku TEXT UNIQUE,
      name TEXT,
      pack INT,
      qty INT DEFAULT 0,
      cost NUMERIC,
      sale NUMERIC
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_code TEXT,
      date TIMESTAMP,
      customer_code TEXT,
      staff_code TEXT,
      total NUMERIC
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_code TEXT,
      sku TEXT,
      name TEXT,
      qty INT,
      price NUMERIC
    )
  `);
}
initDB();

// ===== USER =====
const users = [
  { username: 'admin', password: '123456', role: 'admin', name: 'Admin' }
];

// ===== AUTH =====
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

// ===== LOGIN =====
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });

  const token = jwt.sign(user, SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

// ===== API CŨ (GIỮ LẠI CHO FRONTEND) =====
app.get('/api/data', auth, async (req, res) => {
  const products = await pool.query('SELECT * FROM products');
  const customers = await pool.query('SELECT * FROM customers');
  const staff = await pool.query('SELECT * FROM staff');
  const orders = await pool.query('SELECT * FROM orders');

  res.json({
    products: products.rows,
    customers: customers.rows,
    staff: staff.rows,
    orders: orders.rows
  });
});

// ===== LƯU DẠNG CŨ (CHO FRONTEND HIỆN TẠI) =====
app.post('/api/data', auth, async (req, res) => {
  try {
    const data = req.body;

    // clear bảng
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM customers');
    await pool.query('DELETE FROM staff');
    await pool.query('DELETE FROM orders');
    await pool.query('DELETE FROM order_items');

    // insert lại
    for (let p of data.products || []) {
      await pool.query(
        `INSERT INTO products (sku,name,pack,qty,cost,sale)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [p.sku, p.name, p.pack, p.qty, p.cost, p.sale]
      );
    }

    for (let c of data.customers || []) {
      await pool.query(
        `INSERT INTO customers (code,name)
         VALUES ($1,$2)`,
        [c.code, c.name]
      );
    }

    for (let s of data.staff || []) {
      await pool.query(
        `INSERT INTO staff (code,name)
         VALUES ($1,$2)`,
        [s.code, s.name]
      );
    }

    for (let o of data.orders || []) {
      await pool.query(
        `INSERT INTO orders (order_code,date,customer_code,staff_code,total)
         VALUES ($1,$2,$3,$4,$5)`,
        [o.id, o.date, o.customerCode, o.staffCode, o.total]
      );

      for (let i of o.items || []) {
        await pool.query(
          `INSERT INTO order_items (order_code,sku,name,qty,price)
           VALUES ($1,$2,$3,$4,$5)`,
          [o.id, i.sku, i.name, i.qty, i.price]
        );
      }
    }

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi lưu dữ liệu' });
  }
});

// ===== API MỚI (CHUẨN) =====
app.post('/api/orders', auth, async (req, res) => {
  const { order, items } = req.body;

  try {
    await pool.query(
      `INSERT INTO orders (order_code, date, customer_code, staff_code, total)
       VALUES ($1,$2,$3,$4,$5)`,
      [order.id, order.date, order.customerCode, order.staffCode, order.total]
    );

    for (let item of items) {
      await pool.query(
        `INSERT INTO order_items (order_code, sku, name, qty, price)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, item.sku, item.name, item.qty, item.price]
      );

      await pool.query(
        `UPDATE products SET qty = qty - $1 WHERE sku = $2`,
        [item.qty, item.sku]
      );
    }

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Lỗi tạo đơn' });
  }
});

// ===== TEST =====
app.get('/', (req, res) => {
  res.send('API kho TABLE + DATA đang chạy 🚀');
});

// ===== START =====
app.listen(PORT, () => {
  console.log('Server chạy cổng ' + PORT);
});