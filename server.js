const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kho_data (
      id INTEGER PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    INSERT INTO kho_data (id, data)
    VALUES (1, '{"products":[],"receipts":[],"orders":[],"customers":[],"staff":[],"masterOrders":[]}')
    ON CONFLICT (id) DO NOTHING
  `);

  console.log("Database ready");
}

initDB();

app.get("/", (req, res) => {
  res.send("API Kho Minh Khai đang chạy với database");
});

// Lấy toàn bộ dữ liệu kho
app.get("/api/data", async (req, res) => {
  const result = await pool.query("SELECT data FROM kho_data WHERE id = 1");
  res.json(result.rows[0].data);
});

// Lưu toàn bộ dữ liệu kho
app.post("/api/data", async (req, res) => {
  await pool.query(
    "UPDATE kho_data SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    [req.body]
  );
  res.json({ success: true, message: "Đã lưu dữ liệu vào database" });
});

// Lấy đơn hàng
app.get("/api/orders", async (req, res) => {
  const result = await pool.query("SELECT data FROM kho_data WHERE id = 1");
  res.json(result.rows[0].data.orders || []);
});

// Lưu đơn hàng mới
app.post("/api/orders", async (req, res) => {
  const result = await pool.query("SELECT data FROM kho_data WHERE id = 1");
  const data = result.rows[0].data;

  data.orders = data.orders || [];
  data.orders.push(req.body);

  await pool.query(
    "UPDATE kho_data SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    [data]
  );

  res.json({ success: true, order: req.body });
});

// Sửa đơn hàng
app.put("/api/orders/:id", async (req, res) => {
  const result = await pool.query("SELECT data FROM kho_data WHERE id = 1");
  const data = result.rows[0].data;

  data.orders = (data.orders || []).map(order =>
    String(order.id) === String(req.params.id) ? req.body : order
  );

  await pool.query(
    "UPDATE kho_data SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    [data]
  );

  res.json({ success: true });
});

// Xoá đơn hàng
app.delete("/api/orders/:id", async (req, res) => {
  const result = await pool.query("SELECT data FROM kho_data WHERE id = 1");
  const data = result.rows[0].data;

  data.orders = (data.orders || []).filter(
    order => String(order.id) !== String(req.params.id)
  );

  await pool.query(
    "UPDATE kho_data SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
    [data]
  );

  res.json({ success: true });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server chạy cổng " + PORT);
});