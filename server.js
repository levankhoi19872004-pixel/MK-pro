const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kho_data (
      id SERIAL PRIMARY KEY,
      data JSONB
    )
  `);

  const res = await pool.query("SELECT * FROM kho_data LIMIT 1");

  if (res.rows.length === 0) {
    await pool.query(
      "INSERT INTO kho_data (data) VALUES ($1)",
      [{
        products: [],
        receipts: [],
        orders: [],
        customers: [],
        staff: [],
        masterOrders: []
      }]
    );
  }

  console.log("Database ready");
}

// ===== API =====

app.get("/api/data", async (req, res) => {
  try {
    const result = await pool.query("SELECT data FROM kho_data LIMIT 1");
    res.json(result.rows[0].data);
  } catch (err) {
    res.status(500).json({ error: "Lỗi lấy dữ liệu" });
  }
});

app.post("/api/data", async (req, res) => {
  try {
    await pool.query(
      "UPDATE kho_data SET data = $1 WHERE id = 1",
      [req.body]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Lỗi lưu dữ liệu" });
  }
});

// ===== TEST =====
app.get("/", (req, res) => {
  res.send("API kho PRO đang chạy 🚀");
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  console.log("Server chạy cổng", PORT);
  await initDB();
});