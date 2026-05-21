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
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
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
    payments: [],
    promotions: [],
    productPromotions: [],
    groupPromotions: [],
    customerGroupPromotions: [],
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
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ Chưa có DATABASE_URL');
    return;
  }

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

    fixed.masterOrders = rebuildMasterOrders(fixed.orders, fixed.masterOrders);
    fixed.debts = rebuildDebts(fixed);

    await pool.query(`UPDATE kho_data SET data=$1 WHERE id=$2`, [
      JSON.stringify(fixed),
      check.rows[0].id
    ]);
  }

  console.log('✅ DB READY');
}

const users = [
  {
    username: 'admin',
    password: '123456',
    role: 'admin',
    name: 'Admin'
  },
  {
    username: 'bh01',
    password: '123456',
    role: 'sales',
    name: 'Nhân viên bán hàng 01',
    staffCode: 'NV01'
  },
  {
    username: 'bh02',
    password: '123456',
    role: 'sales',
    name: 'Nhân viên bán hàng 02',
    staffCode: 'NV02'
  },
  {
    username: 'gh01',
    password: '123456',
    role: 'delivery',
    name: 'Nhân viên giao hàng 01',
    deliveryCode: 'GH01'
  },
  {
    username: 'gh02',
    password: '123456',
    role: 'delivery',
    name: 'Nhân viên giao hàng 02',
    deliveryCode: 'GH02'
  },
  {
    username: 'kt01',
    password: '123456',
    role: 'accountant',
    name: 'Kế toán công nợ'
  },
  {
    username: 'nv01',
    password: '123456',
    role: 'staff',
    name: 'Nhân viên 01',
    staffCode: 'NV01'
  }
];

app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'Kho Minh Khai API đang chạy',
    routes: [
      'GET /',
      'GET /api',
      'GET /api/health',
      'POST /api/login',
      'POST /api/logout',
      'GET /api/data',
      'POST /api/data',
      'POST /api/pay-order',
      'GET /api/debt-report'
    ]
  });
});

app.get('/api', (req, res) => {
  res.json({
    ok: true,
    message: 'API hoạt động bình thường'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString()
  });
});

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
    name: user.name,
    staffCode: user.staffCode || '',
    deliveryCode: user.deliveryCode || ''
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
    const childOrders = orders.filter(
      o => String(o.masterId || '') === String(master.id || '')
    );

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

function getOrderPaid(order) {
  return (Number(order.cashPaid) || 0) + (Number(order.bankPaid) || 0);
}

function getDebtStatus(total, paid, dueDate) {
  const debt = total - paid;

  if (debt < 0) return 'Thu thừa';
  if (debt === 0) return 'Đã thanh toán';

  if (dueDate) {
    const d = new Date(dueDate);
    if (!Number.isNaN(d.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);

      if (d.getTime() < today.getTime()) {
        return 'Quá hạn';
      }
    }
  }

  return 'Còn nợ';
}

function rebuildDebts(data) {
  const orders = Array.isArray(data.orders) ? data.orders : [];
  const masterOrders = Array.isArray(data.masterOrders) ? data.masterOrders : [];

  const debts = [];

  orders.forEach(order => {
    let deliveryStaff = order.deliveryStaffName || '';

    if (order.masterId) {
      const master = masterOrders.find(
        m => String(m.id) === String(order.masterId)
      );

      if (master && master.deliveryStaffName) {
        deliveryStaff = master.deliveryStaffName;
      }
    }

    const total = Number(order.total) || 0;
    const cash = Number(order.cashPaid) || 0;
    const bank = Number(order.bankPaid) || 0;
    const paid = cash + bank;
    const debt = total - paid;
    const dueDate = order.dueDate || order.paymentDueDate || '';

    debts.push({
      deliveryStaff,
      masterId: order.masterId || '',
      orderId: order.id || '',
      customerCode: order.customerCode || '',
      customerName: order.customer || order.customerName || '',
      total,
      cash,
      bank,
      paid,
      debt,
      dueDate,
      status: getDebtStatus(total, paid, dueDate),
      paymentStatus: getDebtStatus(total, paid, dueDate),
      date: order.date || ''
    });
  });

  return debts;
}

function getCollectorFromOrder(order) {
  return {
    collectedBy: order.collectedBy || order.salesName || order.staffName || order.deliveryStaffName || '',
    collectedByRole: order.collectedByRole || '',
    collectedByCode: order.collectedByCode || order.staffCode || order.deliveryStaffCode || ''
  };
}

function rebuildPaymentsFromOrders(data) {
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const existed = new Set(
    payments.map(p => String(p.id || ''))
  );

  const newPayments = [...payments];

  (data.orders || []).forEach(order => {
    const cash = Number(order.cashPaid) || 0;
    const bank = Number(order.bankPaid) || 0;
    const collector = getCollectorFromOrder(order);

    if (cash > 0) {
      const id = `AUTO-CASH-${order.id}`;
      if (!existed.has(id)) {
        newPayments.push({
          id,
          orderId: order.id || '',
          customerCode: order.customerCode || '',
          customerName: order.customer || order.customerName || '',
          amount: cash,
          type: 'cash',
          method: 'Tiền mặt',
          date: order.date || new Date().toISOString().slice(0, 10),
          note: 'Tự tạo từ tiền mặt trên đơn',
          collectedBy: collector.collectedBy,
          collectedByRole: collector.collectedByRole,
          collectedByCode: collector.collectedByCode
        });
      }
    }

    if (bank > 0) {
      const id = `AUTO-BANK-${order.id}`;
      if (!existed.has(id)) {
        newPayments.push({
          id,
          orderId: order.id || '',
          customerCode: order.customerCode || '',
          customerName: order.customer || order.customerName || '',
          amount: bank,
          type: 'bank',
          method: 'Chuyển khoản',
          date: order.date || new Date().toISOString().slice(0, 10),
          note: 'Tự tạo từ chuyển khoản trên đơn',
          collectedBy: collector.collectedBy,
          collectedByRole: collector.collectedByRole,
          collectedByCode: collector.collectedByCode
        });
      }
    }
  });

  return newPayments;
}

function getCollectorFromRequest(req) {
  const user = req.user || {};

  return {
    collectedBy: user.name || '',
    collectedByRole: user.role || '',
    collectedByCode: user.staffCode || user.deliveryCode || ''
  };
}

app.get('/api/data', auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT data FROM kho_data ORDER BY id ASC LIMIT 1`);

    if (result.rows.length === 0) {
      const data = defaultData();

      await pool.query(
        `INSERT INTO kho_data (data) VALUES ($1)`,
        [JSON.stringify(data)]
      );

      return res.json(data);
    }

    const data = normalizeData(result.rows[0].data);
    data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
    data.debts = rebuildDebts(data);

    res.json(data);
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({
      error: 'Không lấy được dữ liệu',
      detail: err.message
    });
  }
});

app.post('/api/data', auth, async (req, res) => {
  try {
    const data = normalizeData(req.body);

    data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
    data.payments = rebuildPaymentsFromOrders(data);
    data.debts = rebuildDebts(data);

    const existing = await pool.query(`SELECT id FROM kho_data ORDER BY id ASC LIMIT 1`);

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO kho_data (data) VALUES ($1)`,
        [JSON.stringify(data)]
      );
    } else {
      await pool.query(
        `UPDATE kho_data SET data=$1 WHERE id=$2`,
        [JSON.stringify(data), existing.rows[0].id]
      );
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('POST /api/data error:', err);
    res.status(500).json({
      error: 'Không lưu được dữ liệu',
      detail: err.message
    });
  }
});

app.post('/api/pay-order', auth, async (req, res) => {
  try {
    const {
      orderId,
      cashPaid,
      bankPaid,
      amount,
      type,
      dueDate,
      note
    } = req.body || {};

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

    const oldCash = Number(order.cashPaid) || 0;
    const oldBank = Number(order.bankPaid) || 0;

    if (amount !== undefined && amount !== null && amount !== '') {
      const payAmount = Number(amount) || 0;

      if (type === 'bank' || type === 'Chuyển khoản') {
        order.bankPaid = oldBank + payAmount;
      } else {
        order.cashPaid = oldCash + payAmount;
      }
    } else {
      order.cashPaid = Number(cashPaid) || 0;
      order.bankPaid = Number(bankPaid) || 0;
    }

    if (dueDate !== undefined) {
      order.dueDate = dueDate || '';
    }

    const collector = getCollectorFromRequest(req);

    order.lastCollectedBy = collector.collectedBy;
    order.lastCollectedByRole = collector.collectedByRole;
    order.lastCollectedByCode = collector.collectedByCode;

    const total = Number(order.total) || 0;
    const paid = getOrderPaid(order);
    order.debt = total - paid;
    order.paymentStatus = getDebtStatus(total, paid, order.dueDate || '');

    const newCash = Number(order.cashPaid) || 0;
    const newBank = Number(order.bankPaid) || 0;

    const cashDelta = newCash - oldCash;
    const bankDelta = newBank - oldBank;

    if (cashDelta !== 0) {
      data.payments.push({
        id: `PAY-${Date.now()}-CASH`,
        orderId: order.id || '',
        customerCode: order.customerCode || '',
        customerName: order.customer || order.customerName || '',
        amount: cashDelta,
        type: 'cash',
        method: 'Tiền mặt',
        date: new Date().toISOString(),
        note: note || 'Cập nhật thanh toán đơn hàng',
        collectedBy: collector.collectedBy,
        collectedByRole: collector.collectedByRole,
        collectedByCode: collector.collectedByCode
      });
    }

    if (bankDelta !== 0) {
      data.payments.push({
        id: `PAY-${Date.now()}-BANK`,
        orderId: order.id || '',
        customerCode: order.customerCode || '',
        customerName: order.customer || order.customerName || '',
        amount: bankDelta,
        type: 'bank',
        method: 'Chuyển khoản',
        date: new Date().toISOString(),
        note: note || 'Cập nhật thanh toán đơn hàng',
        collectedBy: collector.collectedBy,
        collectedByRole: collector.collectedByRole,
        collectedByCode: collector.collectedByCode
      });
    }

    data.masterOrders = rebuildMasterOrders(data.orders, data.masterOrders);
    data.debts = rebuildDebts(data);

    await pool.query(
      `UPDATE kho_data SET data=$1 WHERE id=$2`,
      [JSON.stringify(data), dbId]
    );

    res.json({
      success: true,
      data,
      order,
      debts: data.debts,
      payments: data.payments
    });
  } catch (err) {
    console.error('POST /api/pay-order error:', err);
    res.status(500).json({
      error: 'Không cập nhật được thanh toán',
      detail: err.message
    });
  }
});

app.get('/api/debt-report', auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT data FROM kho_data ORDER BY id ASC LIMIT 1`);

    if (result.rows.length === 0) {
      return res.json({
        totalDebt: 0,
        totalPaid: 0,
        overdueDebt: 0,
        byStaff: {},
        byCustomer: {},
        byCollector: {},
        paymentsByCollector: {},
        overdue: [],
        payments: []
      });
    }

    const data = normalizeData(result.rows[0].data);
    data.debts = rebuildDebts(data);

    const report = {
      totalDebt: 0,
      totalPaid: 0,
      overdueDebt: 0,
      byStaff: {},
      byCustomer: {},
      byCollector: {},
      paymentsByCollector: {},
      overdue: [],
      payments: data.payments || []
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

      if (Number(debt.debt) > 0) {
        report.totalDebt += Number(debt.debt) || 0;
        report.byStaff[staffKey] += Number(debt.debt) || 0;
        report.byCustomer[customerKey] += Number(debt.debt) || 0;
      }

      report.totalPaid += Number(debt.paid) || 0;

      if (debt.status === 'Quá hạn') {
        report.overdueDebt += Number(debt.debt) || 0;

        const due = debt.dueDate ? new Date(debt.dueDate) : null;
        let days = 0;

        if (due && !Number.isNaN(due.getTime())) {
          days = Math.floor((Date.now() - due.getTime()) / 86400000);
        }

        report.overdue.push({
          ...debt,
          days
        });
      }
    });

    (data.payments || []).forEach(payment => {
      const collectorKey =
        payment.collectedBy ||
        payment.collector ||
        payment.staffName ||
        payment.deliveryStaffName ||
        'Chưa rõ người thu';

      if (!report.byCollector[collectorKey]) {
        report.byCollector[collectorKey] = 0;
      }

      if (!report.paymentsByCollector[collectorKey]) {
        report.paymentsByCollector[collectorKey] = {
          collector: collectorKey,
          role: payment.collectedByRole || '',
          code: payment.collectedByCode || '',
          cash: 0,
          bank: 0,
          total: 0,
          count: 0
        };
      }

      const amount = Number(payment.amount) || 0;
      report.byCollector[collectorKey] += amount;
      report.paymentsByCollector[collectorKey].total += amount;
      report.paymentsByCollector[collectorKey].count += 1;

      if (payment.type === 'bank' || payment.method === 'Chuyển khoản') {
        report.paymentsByCollector[collectorKey].bank += amount;
      } else {
        report.paymentsByCollector[collectorKey].cash += amount;
      }
    });

    res.json(report);
  } catch (err) {
    console.error('GET /api/debt-report error:', err);
    res.status(500).json({
      error: 'Không lấy được báo cáo công nợ',
      detail: err.message
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Không tìm thấy API',
    path: req.path
  });
});

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log('🚀 Server chạy cổng ' + PORT);
    });
  })
  .catch(err => {
    console.error('❌ INIT DB ERROR:', err);
    app.listen(PORT, () => {
      console.log('🚀 Server vẫn chạy cổng ' + PORT);
    });
  });