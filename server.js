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
        deliveryStaff: [],
        receipts: [],
        masterOrders: [],
        debts: [],
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

// ===== REBUILD MASTER =====
function rebuildMasterOrders(orders, masterOrders) {
  return masterOrders.map(master => {
    const child = orders.filter(o => o.masterId === master.id);

    let map = {};
    let total = 0;

    child.forEach(o => {
      (o.items || []).forEach(i => {
        if (!map[i.sku]) map[i.sku] = { ...i };
        else map[i.sku].qty += i.qty;
      });

      total += Number(o.total) || 0;
    });

    return {
      ...master,
      items: Object.values(map),
      total
    };
  });
}

// ===== 🔥 REBUILD CÔNG NỢ (FIX CHUẨN) =====
function rebuildDebts(data) {
  let debts = [];

  data.orders.forEach(o => {

    // 🔥 Lấy NV giao hàng (ưu tiên master)
    let deliveryName = '';

    if (o.masterId) {
      const master = data.masterOrders.find(m => m.id === o.masterId);
      if (master) {
        deliveryName = master.deliveryStaffName || '';
      }
    }

    // fallback nếu chưa gộp
    if (!deliveryName) {
      deliveryName = o.deliveryStaffName || '';
    }

    let total = Number(o.total) || 0;
    let cash = Number(o.cashPaid) || 0;
    let bank = Number(o.bankPaid) || 0;
    let debt = total - cash - bank;

    debts.push({
      deliveryStaff: deliveryName,
      orderId: o.id,
      customerCode: o.customerCode || '',
      customerName: o.customer || '',
      total,
      cash,
      bank,
      debt,
      status: debt <= 0 ? 'Đã thanh toán' : 'Còn nợ',
      date: o.date
    });
  });

  return debts;
}

// ===== GET DATA =====
app.get('/api/data', auth, async (req, res) => {
  const result = await pool.query(`SELECT data FROM kho_data LIMIT 1`);
  res.json(result.rows[0].data);
});

// ===== SAVE DATA =====
app.post('/api/data', auth, async (req, res) => {
  let data = req.body;

  data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
  data.debts = rebuildDebts(data);

  await pool.query(`UPDATE kho_data SET data=$1 WHERE id=1`, [data]);

  res.json({ success: true });
});

// ===== 🔥 THU TIỀN REALTIME =====
app.post('/api/pay-order', auth, async (req, res) => {
  const { orderId, cash, bank } = req.body;

  const rs = await pool.query(`SELECT data FROM kho_data LIMIT 1`);
  const data = rs.rows[0].data;

  const order = data.orders.find(o => String(o.id) === String(orderId));
  if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn' });

  order.cashPaid = Number(cash) || 0;
  order.bankPaid = Number(bank) || 0;

  data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
  data.debts = rebuildDebts(data);

  await pool.query(`UPDATE kho_data SET data=$1 WHERE id=1`, [data]);

  res.json({ success: true, debts: data.debts });
});

// ===== REPORT =====
app.get('/api/debt-report', auth, async (req, res) => {
  const rs = await pool.query(`SELECT data FROM kho_data LIMIT 1`);
  const data = rs.rows[0].data;

  let report = { byStaff: {}, byCustomer: {}, overdue: [] };

  data.debts.forEach(d => {
    if (!report.byStaff[d.deliveryStaff]) report.byStaff[d.deliveryStaff] = 0;
    report.byStaff[d.deliveryStaff] += d.debt;

    if (!report.byCustomer[d.customerCode]) report.byCustomer[d.customerCode] = 0;
    report.byCustomer[d.customerCode] += d.debt;

    let days = (Date.now() - new Date(d.date)) / 86400000;
    if (days > 30 && d.debt > 0) report.overdue.push(d);
  });

  res.json(report);
});

// ===== HEALTH =====
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ===== START =====
app.listen(PORT, () => {
  console.log('🚀 Server chạy cổng ' + PORT);
});