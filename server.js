const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors());
app.use(express.json({ limit: '200mb' }));

const PORT = process.env.PORT || 10000;
const SECRET = process.env.JWT_SECRET || 'kho_pro_secret_key';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function defaultData() {
  return {
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
    categoryGroups: [],
    shortageReports: []
  };
}

function normalizeData(data) {
  const base = defaultData();
  const src = data && typeof data === 'object' ? data : {};

  Object.keys(base).forEach(key => {
    base[key] = Array.isArray(src[key]) ? src[key] : [];
  });

  return base;
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kho_data (
      id SERIAL PRIMARY KEY,
      data JSONB NOT NULL
    )
  `);

  const check = await pool.query(`SELECT id, data FROM kho_data ORDER BY id ASC LIMIT 1`);

  if (check.rows.length === 0) {
    await pool.query(
      `INSERT INTO kho_data (data) VALUES ($1)`,
      [JSON.stringify(defaultData())]
    );
  } else {
    const fixed = normalizeData(check.rows[0].data);
    await pool.query(`UPDATE kho_data SET data=$1 WHERE id=$2`, [
      JSON.stringify(fixed),
      check.rows[0].id
    ]);
  }

  console.log('✅ DB READY');
}

initDB().catch(err => {
  console.error('❌ INIT DB ERROR:', err);
});

const users = [
  { username: 'admin', password: '123456', role: 'admin', name: 'Admin' },
  { username: 'nv01', password: '123456', role: 'staff', name: 'Nhân viên 01' }
];

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  const user = users.find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  }

  const safeUser = {
    username: user.username,
    role: user.role,
    name: user.name
  };

  const token = jwt.sign(safeUser, SECRET, { expiresIn: '7d' });

  res.json({
    token,
    user: safeUser
  });
});

app.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token lỗi hoặc đã hết hạn' });
  }
}

function rebuildMasterOrders(orders, masterOrders) {
  orders = Array.isArray(orders) ? orders : [];
  masterOrders = Array.isArray(masterOrders) ? masterOrders : [];

  return masterOrders.map(master => {
    const childOrders = orders.filter(o => String(o.masterId || '') === String(master.id || ''));

    const itemMap = {};
    let total = 0;

    childOrders.forEach(order => {
      (order.items || []).forEach(item => {
        const sku = item.sku || item.code || item.productCode || '';
        if (!sku) return;

        if (!itemMap[sku]) {
          itemMap[sku] = { ...item, qty: Number(item.qty) || 0 };
        } else {
          itemMap[sku].qty += Number(item.qty) || 0;
        }
      });

      total += Number(order.total) || 0;
    });

    return {
      ...master,
      items: Object.values(itemMap),
      total
    };
  });
}

function rebuildDebts(data) {
  const orders = Array.isArray(data.orders) ? data.orders : [];
  const masterOrders = Array.isArray(data.masterOrders) ? data.masterOrders : [];

  const debts = [];

  orders.forEach(order => {
    let deliveryStaff = order.deliveryStaffName || '';

    if (order.masterId) {
      const master = masterOrders.find(m => String(m.id) === String(order.masterId));
      if (master && master.deliveryStaffName) {
        deliveryStaff = master.deliveryStaffName;
      }
    }

    const total = Number(order.total) || 0;
    const cash = Number(order.cashPaid) || 0;
    const bank = Number(order.bankPaid) || 0;
    const debt = total - cash - bank;

    debts.push({
      deliveryStaff,
      masterId: order.masterId || '',
      orderId: order.id || '',
      customerCode: order.customerCode || '',
      customerName: order.customer || order.customerName || '',
      total,
      cash,
      bank,
      debt,
      status: debt < 0 ? 'Thu thừa' : debt === 0 ? 'Đã thanh toán' : 'Còn nợ',
      date: order.date || ''
    });
  });

  return debts;
}

app.get('/api/data', auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT data FROM kho_data ORDER BY id ASC LIMIT 1`);

    if (result.rows.length === 0) {
      const data = defaultData();
      await pool.query(`INSERT INTO kho_data (data) VALUES ($1)`, [JSON.stringify(data)]);
      return res.json(data);
    }

    res.json(normalizeData(result.rows[0].data));
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({ error: 'Không lấy được dữ liệu', detail: err.message });
  }
});

app.post('/api/data', auth, async (req, res) => {
  try {
    const data = normalizeData(req.body);

    data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
    data.debts = rebuildDebts(data);

    const existing = await pool.query(`SELECT id FROM kho_data ORDER BY id ASC LIMIT 1`);

    if (existing.rows.length === 0) {
      await pool.query(`INSERT INTO kho_data (data) VALUES ($1)`, [JSON.stringify(data)]);
    } else {
      await pool.query(`UPDATE kho_data SET data=$1 WHERE id=$2`, [
        JSON.stringify(data),
        existing.rows[0].id
      ]);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/data error:', err);
    res.status(500).json({ error: 'Không lưu được dữ liệu', detail: err.message });
  }
});

app.post('/api/pay-order', auth, async (req, res) => {
  try {
    const { orderId, cashPaid, bankPaid } = req.body || {};

    const result = await pool.query(`SELECT id, data FROM kho_data ORDER BY id ASC LIMIT 1`);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chưa có dữ liệu kho' });
    }

    const dbId = result.rows[0].id;
    const data = normalizeData(result.rows[0].data);

    const order = data.orders.find(o => String(o.id) === String(orderId));

    if (!order) {
      return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
    }

    order.cashPaid = Number(cashPaid) || 0;
    order.bankPaid = Number(bankPaid) || 0;
    order.debt = (Number(order.total) || 0) - order.cashPaid - order.bankPaid;

    data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
    data.debts = rebuildDebts(data);

    await pool.query(`UPDATE kho_data SET data=$1 WHERE id=$2`, [
      JSON.stringify(data),
      dbId
    ]);

    res.json({
      success: true,
      order,
      debts: data.debts
    });
  } catch (err) {
    console.error('POST /api/pay-order error:', err);
    res.status(500).json({ error: 'Không cập nhật được thanh toán', detail: err.message });
  }
});

app.get('/api/debt-report', auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT data FROM kho_data ORDER BY id ASC LIMIT 1`);

    if (result.rows.length === 0) {
      return res.json({ byStaff: {}, byCustomer: {}, overdue: [] });
    }

    const data = normalizeData(result.rows[0].data);
    data.debts = rebuildDebts(data);

    const report = {
      byStaff: {},
      byCustomer: {},
      overdue: []
    };

    data.debts.forEach(debt => {
      const staffKey = debt.deliveryStaff || 'Chưa gán NV giao';
      const customerKey = debt.customerCode || debt.customerName || 'Chưa có khách';

      if (!report.byStaff[staffKey]) {
        report.byStaff[staffKey] = 0;
      }

      if (!report.byCustomer[customerKey]) {
        report.byCustomer[customerKey] = 0;
      }

      report.byStaff[staffKey] += Number(debt.debt) || 0;
      report.byCustomer[customerKey] += Number(debt.debt) || 0;

      const date = debt.date ? new Date(debt.date) : null;
      const validDate = date && !Number.isNaN(date.getTime());

      if (validDate) {
        const days = (Date.now() - date.getTime()) / 86400000;
        if (days > 30 && Number(debt.debt) > 0) {
          report.overdue.push({
            ...debt,
            days: Math.floor(days)
          });
        }
      }
    });

    res.json(report);
  } catch (err) {
    console.error('GET /api/debt-report error:', err);
    res.status(500).json({ error: 'Không lấy được báo cáo công nợ', detail: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'Kho Minh Khai API đang chạy',
    health: '/api/health',
    login: '/api/login',
    data: '/api/data'
  });
});

app.get('/api', (req, res) => {
  res.json({
    ok: true,
    message: 'API hợp lệ',
    routes: [
      'POST /api/login',
      'POST /api/logout',
      'GET /api/data',
      'POST /api/data',
      'POST /api/pay-order',
      'GET /api/debt-report',
      'GET /api/health'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Không tìm thấy API',
    path: req.path
  });
});