const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 KẾT NỐI DATABASE
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// =======================
// 🧱 TẠO TABLE (auto)
// =======================
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT,
      price NUMERIC,
      stock INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      staff_id INTEGER,
      total NUMERIC,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER,
      product_id INTEGER,
      quantity INTEGER,
      price NUMERIC
    );
  `);

  console.log("✅ Database ready");
}

// =======================
// 📦 PRODUCTS
// =======================

// lấy danh sách sản phẩm
app.get("/api/products", async (req, res) => {
  const result = await pool.query("SELECT * FROM products");
  res.json(result.rows);
});

// thêm sản phẩm
app.post("/api/products", async (req, res) => {
  const { name, price, stock } = req.body;
  const result = await pool.query(
    "INSERT INTO products (name, price, stock) VALUES ($1,$2,$3) RETURNING *",
    [name, price, stock]
  );
  res.json(result.rows[0]);
});

// =======================
// 📥 NHẬP KHO
// =======================
app.post("/api/import", async (req, res) => {
  const { product_id, quantity } = req.body;

  await pool.query(
    "UPDATE products SET stock = stock + $1 WHERE id = $2",
    [quantity, product_id]
  );

  res.json({ message: "Nhập kho thành công" });
});

// =======================
// 🧾 ĐƠN HÀNG
// =======================

// tạo đơn hàng
app.post("/api/orders", async (req, res) => {
  const { customer_id, staff_id, items } = req.body;

  let total = 0;

  for (let item of items) {
    total += item.price * item.quantity;
  }

  const order = await pool.query(
    "INSERT INTO orders (customer_id, staff_id, total) VALUES ($1,$2,$3) RETURNING *",
    [customer_id, staff_id, total]
  );

  const orderId = order.rows[0].id;

  for (let item of items) {
    await pool.query(
      "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1,$2,$3,$4)",
      [orderId, item.product_id, item.quantity, item.price]
    );

    // trừ tồn kho
    await pool.query(
      "UPDATE products SET stock = stock - $1 WHERE id = $2",
      [item.quantity, item.product_id]
    );
  }

  res.json({ message: "Tạo đơn thành công" });
});

// lấy danh sách đơn
app.get("/api/orders", async (req, res) => {
  const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
  res.json(result.rows);
});

// =======================
// 👥 KHÁCH HÀNG
// =======================
app.get("/api/customers", async (req, res) => {
  const result = await pool.query("SELECT * FROM customers");
  res.json(result.rows);
});

app.post("/api/customers", async (req, res) => {
  const { name } = req.body;
  const result = await pool.query(
    "INSERT INTO customers (name) VALUES ($1) RETURNING *",
    [name]
  );
  res.json(result.rows[0]);
});

// =======================
// 👨‍💼 NHÂN VIÊN
// =======================
app.get("/api/staff", async (req, res) => {
  const result = await pool.query("SELECT * FROM staff");
  res.json(result.rows);
});

app.post("/api/staff", async (req, res) => {
  const { name } = req.body;
  const result = await pool.query(
    "INSERT INTO staff (name) VALUES ($1) RETURNING *",
    [name]
  );
  res.json(result.rows[0]);
});

// =======================
// 🚀 START SERVER
// =======================
const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  console.log("🚀 Server chạy cổng", PORT);
  await initDB();
});