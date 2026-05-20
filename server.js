const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

// Kết nối database từ Render
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Tạo bảng nếu chưa có
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name TEXT,
      phone TEXT,
      address TEXT,
      items JSONB,
      total INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Database ready");
}

initDB();

// Test API
app.get("/", (req, res) => {
  res.send("API kho Minh Khai (DB) đang chạy");
});

// Lưu đơn hàng
app.post("/api/orders", async (req, res) => {
  const { customer_name, phone, address, items, total } = req.body;

  const result = await pool.query(
    `INSERT INTO orders (customer_name, phone, address, items, total)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [customer_name, phone, address, items, total]
  );

  res.json(result.rows[0]);
});

// Lấy danh sách đơn
app.get("/api/orders", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM orders ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

// Xoá đơn
app.delete("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  await pool.query("DELETE FROM orders WHERE id=$1", [id]);
  res.json({ message: "Deleted" });
});

// Sửa đơn
app.put("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  const { customer_name, phone, address, items, total } = req.body;

  await pool.query(
    `UPDATE orders 
     SET customer_name=$1, phone=$2, address=$3, items=$4, total=$5
     WHERE id=$6`,
    [customer_name, phone, address, items, total, id]
  );

  res.json({ message: "Updated" });
});

// chạy server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server chạy cổng " + PORT);
});