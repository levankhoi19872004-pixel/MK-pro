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
        customerGroups: [],
        staff: [],
        deliveryStaff: [],
        receipts: [],
        masterOrders: [],
        debts: [],
        promotions: [],
        productGroups: [],
        categoryGroups: []
      })]
    );
  }

  console.log("✅ DB READY");
}
initDB();

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

    return { ...master, items: Object.values(map), total };
  });
}

function rebuildDebts(data) {
  let debts = [];

  data.orders.forEach(o => {
    let deliveryName = '';

    if (o.masterId) {
      const master = data.masterOrders.find(m => m.id === o.masterId);
      if (master) deliveryName = master.deliveryStaffName || '';
    }

    if (!deliveryName) deliveryName = o.deliveryStaffName || '';

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

app.get('/api/data', auth, async (req, res) => {
  const result = await pool.query(`SELECT data FROM kho_data LIMIT 1`);
  res.json(result.rows[0].data);
});

app.post('/api/data', auth, async (req, res) => {
  let data = req.body;

  data.customerGroups = data.customerGroups || [];
  data.promotions = data.promotions || [];
  data.productGroups = data.productGroups || [];
  data.categoryGroups = data.categoryGroups || [];

  data.masterOrders = rebuildMasterOrders(data.orders || [], data.masterOrders || []);
  data.debts = rebuildDebts(data);

  await pool.query(`UPDATE kho_data SET data=$1 WHERE id=1`, [data]);

  res.json({ success: true });
});

app.post('/api/pay-order', auth, async (req, res) => {
  const { orderId, cashPaid, bankPaid } = req.body;

  const rs = await pool.query(`SELECT data FROM kho_data LIMIT 1`);
  const data = rs.rows[0].data;

  const order = data.orders.find(o => String(o.id) === String(orderId));
  if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn' });

  order.cashPaid = Number(cashPaid) || 0;
  order.bankPaid = Number(bankPaid) || 0;

  data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
  data.debts = rebuildDebts(data);

  await pool.query(`UPDATE kho_data SET data=$1 WHERE id=1`, [data]);

  res.json({ success: true, debts: data.debts });
});

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

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log('🚀 Server chạy cổng ' + PORT);
});