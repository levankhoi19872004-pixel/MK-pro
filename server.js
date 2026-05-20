const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

/* =========================
   DATA GIẢ LẬP (sau sẽ nối DB)
========================= */
let db = {
  staff: [],
  orders: [],
  products: [],
  receipts: [],
  customers: [],
  masterOrder: []
};

/* =========================
   USER + TOKEN
========================= */
const users = [
  { username: "admin", password: "123456", role: "admin" },
  { username: "nv01", password: "123456", role: "staff" }
];

let tokens = {}; // lưu token tạm

function generateToken(username) {
  const token = Math.random().toString(36).substring(2);
  tokens[token] = username;
  return token;
}

function authMiddleware(req, res, next) {
  const token = req.headers["authorization"];
  if (!token || !tokens[token]) {
    return res.status(401).json({ error: "Chưa đăng nhập" });
  }

  const username = tokens[token];
  req.user = users.find(u => u.username === username);

  next();
}

function isAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Không có quyền" });
  }
  next();
}

/* =========================
   LOGIN
========================= */
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  const user = users.find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: "Sai tài khoản" });
  }

  const token = generateToken(user.username);

  res.json({
    token,
    role: user.role,
    username: user.username
  });
});

/* =========================
   LẤY THÔNG TIN USER
========================= */
app.get("/api/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

/* =========================
   GET DATA (ai cũng xem được)
========================= */
app.get("/api/data", authMiddleware, (req, res) => {
  res.json(db);
});

/* =========================
   SAVE DATA
========================= */
app.post("/api/data", authMiddleware, (req, res) => {

  // staff KHÔNG được sửa sản phẩm
  if (req.user.role === "staff") {
    const newData = req.body;

    db.orders = newData.orders || db.orders;
    db.receipts = newData.receipts || db.receipts;

    return res.json({ success: true, msg: "Nhân viên đã lưu đơn" });
  }

  // admin được full quyền
  db = req.body;

  res.json({ success: true, msg: "Admin đã lưu dữ liệu" });
});

/* =========================
   DELETE ORDER (chỉ admin)
========================= */
app.delete("/api/orders/:id", authMiddleware, isAdmin, (req, res) => {
  const id = req.params.id;

  db.orders = db.orders.filter(o => o.id != id);

  res.json({ success: true });
});

/* =========================
   SERVER START
========================= */
app.listen(PORT, () => {
  console.log("Server chạy cổng", PORT);
});