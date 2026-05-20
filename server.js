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

async function ensureColumn(table, column, type) {
  await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('products', 'sku', 'TEXT');
  await ensureColumn('products', 'name', 'TEXT');
  await ensureColumn('products', 'pack', 'INT DEFAULT 1');
  await ensureColumn('products', 'qty', 'INT DEFAULT 0');
  await ensureColumn('products', 'cost', 'NUMERIC DEFAULT 0');
  await ensureColumn('products', 'sale', 'NUMERIC DEFAULT 0');
  await ensureColumn('products', 'brand', 'TEXT');
  await ensureColumn('products', 'category', 'TEXT');
  await ensureColumn('products', 'warehouse', 'TEXT');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('customers', 'code', 'TEXT');
  await ensureColumn('customers', 'name', 'TEXT');
  await ensureColumn('customers', 'address', 'TEXT');
  await ensureColumn('customers', 'phone', 'TEXT');
  await ensureColumn('customers', 'tax', 'TEXT');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('staff', 'code', 'TEXT');
  await ensureColumn('staff', 'name', 'TEXT');
  await ensureColumn('staff', 'phone', 'TEXT');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('orders', 'order_code', 'TEXT');
  await ensureColumn('orders', 'date', 'TEXT');
  await ensureColumn('orders', 'iso_date', 'TEXT');
  await ensureColumn('orders', 'customer_code', 'TEXT');
  await ensureColumn('orders', 'customer_name', 'TEXT');
  await ensureColumn('orders', 'staff_code', 'TEXT');
  await ensureColumn('orders', 'staff_name', 'TEXT');
  await ensureColumn('orders', 'total', 'NUMERIC DEFAULT 0');
  await ensureColumn('orders', 'cost', 'NUMERIC DEFAULT 0');
  await ensureColumn('orders', 'master_id', 'TEXT');
  await ensureColumn('orders', 'raw_data', 'JSONB DEFAULT \'{}\'::jsonb');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('order_items', 'order_code', 'TEXT');
  await ensureColumn('order_items', 'sku', 'TEXT');
  await ensureColumn('order_items', 'name', 'TEXT');
  await ensureColumn('order_items', 'pack', 'INT DEFAULT 1');
  await ensureColumn('order_items', 'qty', 'INT DEFAULT 0');
  await ensureColumn('order_items', 'qty_sell', 'INT DEFAULT 0');
  await ensureColumn('order_items', 'qty_km', 'INT DEFAULT 0');
  await ensureColumn('order_items', 'sale', 'NUMERIC DEFAULT 0');
  await ensureColumn('order_items', 'cost', 'NUMERIC DEFAULT 0');
  await ensureColumn('order_items', 'total', 'NUMERIC DEFAULT 0');
  await ensureColumn('order_items', 'raw_data', 'JSONB DEFAULT \'{}\'::jsonb');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS receipts (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('receipts', 'receipt_code', 'TEXT');
  await ensureColumn('receipts', 'date', 'TEXT');
  await ensureColumn('receipts', 'supplier', 'TEXT');
  await ensureColumn('receipts', 'note', 'TEXT');
  await ensureColumn('receipts', 'total', 'NUMERIC DEFAULT 0');
  await ensureColumn('receipts', 'raw_data', 'JSONB DEFAULT \'{}\'::jsonb');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS receipt_items (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('receipt_items', 'receipt_code', 'TEXT');
  await ensureColumn('receipt_items', 'sku', 'TEXT');
  await ensureColumn('receipt_items', 'name', 'TEXT');
  await ensureColumn('receipt_items', 'pack', 'INT DEFAULT 1');
  await ensureColumn('receipt_items', 'qty', 'INT DEFAULT 0');
  await ensureColumn('receipt_items', 'cost', 'NUMERIC DEFAULT 0');
  await ensureColumn('receipt_items', 'raw_data', 'JSONB DEFAULT \'{}\'::jsonb');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS master_orders (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('master_orders', 'master_code', 'TEXT');
  await ensureColumn('master_orders', 'date', 'TEXT');
  await ensureColumn('master_orders', 'note', 'TEXT');
  await ensureColumn('master_orders', 'total', 'NUMERIC DEFAULT 0');
  await ensureColumn('master_orders', 'raw_data', 'JSONB DEFAULT \'{}\'::jsonb');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shortage_reports (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('shortage_reports', 'report_code', 'TEXT');
  await ensureColumn('shortage_reports', 'created_at', 'TEXT');
  await ensureColumn('shortage_reports', 'file_name', 'TEXT');
  await ensureColumn('shortage_reports', 'raw_data', 'JSONB DEFAULT \'{}\'::jsonb');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shortage_items (
      id SERIAL PRIMARY KEY
    )
  `);

  await ensureColumn('shortage_items', 'report_code', 'TEXT');
  await ensureColumn('shortage_items', 'order_code', 'TEXT');
  await ensureColumn('shortage_items', 'staff_code', 'TEXT');
  await ensureColumn('shortage_items', 'staff_name', 'TEXT');
  await ensureColumn('shortage_items', 'customer_code', 'TEXT');
  await ensureColumn('shortage_items', 'customer_name', 'TEXT');
  await ensureColumn('shortage_items', 'sku', 'TEXT');
  await ensureColumn('shortage_items', 'name', 'TEXT');
  await ensureColumn('shortage_items', 'needed_qty', 'INT DEFAULT 0');
  await ensureColumn('shortage_items', 'stock_qty', 'INT DEFAULT 0');
  await ensureColumn('shortage_items', 'missing_qty', 'INT DEFAULT 0');
  await ensureColumn('shortage_items', 'import_qty', 'INT DEFAULT 0');
  await ensureColumn('shortage_items', 'raw_data', 'JSONB DEFAULT \'{}\'::jsonb');

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_staff_code ON staff(code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_code ON orders(order_code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_order_items_code ON order_items(order_code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_receipts_code ON receipts(receipt_code)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shortage_items_report ON shortage_items(report_code)`);

  console.log('✅ Database schema ready');
}

initDB().catch(err => {
  console.error('❌ Init database error:', err);
});

const users = [
  { username: 'admin', password: '123456', role: 'admin', name: 'Admin' },
  { username: 'nv01', password: '123456', role: 'staff', name: 'Nhân viên 1' }
];

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

function safeNumber(v) {
  return Number(v) || 0;
}

function safeText(v) {
  return v === undefined || v === null ? '' : String(v);
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });

  const token = jwt.sign(user, SECRET, { expiresIn: '7d' });
  res.json({ token, user });
});

app.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

app.get('/api/data', auth, async (req, res) => {
  try {
    const products = await pool.query(`
      SELECT sku, name, brand, category, warehouse, pack, qty, cost, sale
      FROM products
      ORDER BY id ASC
    `);

    const customers = await pool.query(`
      SELECT code, name, address, phone, tax
      FROM customers
      ORDER BY id ASC
    `);

    const staff = await pool.query(`
      SELECT code, name, phone
      FROM staff
      ORDER BY id ASC
    `);

    const orderRows = await pool.query(`
      SELECT *
      FROM orders
      ORDER BY id ASC
    `);

    const orderItemRows = await pool.query(`
      SELECT *
      FROM order_items
      ORDER BY id ASC
    `);

    const receiptRows = await pool.query(`
      SELECT *
      FROM receipts
      ORDER BY id ASC
    `);

    const receiptItemRows = await pool.query(`
      SELECT *
      FROM receipt_items
      ORDER BY id ASC
    `);

    const masterRows = await pool.query(`
      SELECT *
      FROM master_orders
      ORDER BY id ASC
    `);

    const shortageReportRows = await pool.query(`
      SELECT *
      FROM shortage_reports
      ORDER BY id ASC
    `);

    const shortageItemRows = await pool.query(`
      SELECT *
      FROM shortage_items
      ORDER BY id ASC
    `);

    const orderItemsByCode = {};
    for (const row of orderItemRows.rows) {
      if (!orderItemsByCode[row.order_code]) orderItemsByCode[row.order_code] = [];
      orderItemsByCode[row.order_code].push({
        sku: row.sku,
        name: row.name,
        pack: row.pack,
        qty: row.qty,
        qtySell: row.qty_sell,
        qtyKM: row.qty_km,
        sale: Number(row.sale) || 0,
        cost: Number(row.cost) || 0,
        total: Number(row.total) || 0,
        ...(row.raw_data || {})
      });
    }

    const receiptItemsByCode = {};
    for (const row of receiptItemRows.rows) {
      if (!receiptItemsByCode[row.receipt_code]) receiptItemsByCode[row.receipt_code] = [];
      receiptItemsByCode[row.receipt_code].push({
        sku: row.sku,
        name: row.name,
        pack: row.pack,
        qty: row.qty,
        cost: Number(row.cost) || 0,
        ...(row.raw_data || {})
      });
    }

    const shortageItemsByReport = {};
    for (const row of shortageItemRows.rows) {
      if (!shortageItemsByReport[row.report_code]) shortageItemsByReport[row.report_code] = [];
      shortageItemsByReport[row.report_code].push({
        reportCode: row.report_code,
        orderCode: row.order_code,
        staffCode: row.staff_code,
        staffName: row.staff_name,
        customerCode: row.customer_code,
        customerName: row.customer_name,
        sku: row.sku,
        name: row.name,
        neededQty: row.needed_qty,
        stockQty: row.stock_qty,
        missingQty: row.missing_qty,
        importQty: row.import_qty,
        ...(row.raw_data || {})
      });
    }

    const orders = orderRows.rows.map(row => ({
      id: row.order_code,
      date: row.date,
      isoDate: row.iso_date,
      customerCode: row.customer_code,
      customer: row.customer_name,
      staffCode: row.staff_code,
      staffName: row.staff_name,
      staff: row.staff_name,
      total: Number(row.total) || 0,
      cost: Number(row.cost) || 0,
      masterId: row.master_id || '',
      items: orderItemsByCode[row.order_code] || [],
      ...(row.raw_data || {})
    }));

    const receipts = receiptRows.rows.map(row => ({
      id: row.receipt_code,
      date: row.date,
      supplier: row.supplier,
      note: row.note,
      total: Number(row.total) || 0,
      items: receiptItemsByCode[row.receipt_code] || [],
      ...(row.raw_data || {})
    }));

    const masterOrders = masterRows.rows.map(row => ({
      id: row.master_code,
      date: row.date,
      note: row.note,
      total: Number(row.total) || 0,
      ...(row.raw_data || {})
    }));

    const shortageReports = shortageReportRows.rows.map(row => ({
      id: row.report_code,
      createdAt: row.created_at,
      fileName: row.file_name,
      items: shortageItemsByReport[row.report_code] || [],
      ...(row.raw_data || {})
    }));

    res.json({
      products: products.rows,
      customers: customers.rows,
      staff: staff.rows,
      orders,
      receipts,
      masterOrders,
      shortageReports
    });
  } catch (err) {
    console.error('GET /api/data error:', err);
    res.status(500).json({ error: 'Lỗi lấy dữ liệu bảng', detail: err.message });
  }
});

app.post('/api/data', auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const data = req.body || {};

    await client.query('BEGIN');

    await client.query('DELETE FROM shortage_items');
    await client.query('DELETE FROM shortage_reports');
    await client.query('DELETE FROM receipt_items');
    await client.query('DELETE FROM receipts');
    await client.query('DELETE FROM order_items');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM master_orders');
    await client.query('DELETE FROM products');
    await client.query('DELETE FROM customers');
    await client.query('DELETE FROM staff');

    for (const p of data.products || []) {
      await client.query(
        `INSERT INTO products (sku, name, brand, category, warehouse, pack, qty, cost, sale)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          safeText(p.sku),
          safeText(p.name),
          safeText(p.brand || p.nhanHang),
          safeText(p.category || p.nganhHang),
          safeText(p.warehouse || p.khoHang || 'Kho chính'),
          safeNumber(p.pack || 1),
          safeNumber(p.qty),
          safeNumber(p.cost),
          safeNumber(p.sale)
        ]
      );
    }

    for (const c of data.customers || []) {
      await client.query(
        `INSERT INTO customers (code, name, address, phone, tax)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          safeText(c.code),
          safeText(c.name),
          safeText(c.address),
          safeText(c.phone),
          safeText(c.tax)
        ]
      );
    }

    for (const s of data.staff || []) {
      await client.query(
        `INSERT INTO staff (code, name, phone)
         VALUES ($1,$2,$3)`,
        [
          safeText(s.code || s.ma),
          safeText(s.name || s.ten),
          safeText(s.phone || s.sdt)
        ]
      );
    }

    for (const o of data.orders || []) {
      const orderCode = safeText(o.id || o.order_code || o.orderCode);
      await client.query(
        `INSERT INTO orders (
          order_code, date, iso_date, customer_code, customer_name,
          staff_code, staff_name, total, cost, master_id, raw_data
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          orderCode,
          safeText(o.date),
          safeText(o.isoDate),
          safeText(o.customerCode || o.cCode),
          safeText(o.customer || o.customerName),
          safeText(o.staffCode || o.staffMa),
          safeText(o.staffName || o.staff),
          safeNumber(o.total),
          safeNumber(o.cost),
          safeText(o.masterId),
          JSON.stringify(o)
        ]
      );

      for (const item of o.items || []) {
        await client.query(
          `INSERT INTO order_items (
            order_code, sku, name, pack, qty, qty_sell, qty_km,
            sale, cost, total, raw_data
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            orderCode,
            safeText(item.sku),
            safeText(item.name),
            safeNumber(item.pack || 1),
            safeNumber(item.qty),
            safeNumber(item.qtySell),
            safeNumber(item.qtyKM),
            safeNumber(item.sale || item.price),
            safeNumber(item.cost),
            safeNumber(item.total),
            JSON.stringify(item)
          ]
        );
      }
    }

    for (const r of data.receipts || []) {
      const receiptCode = safeText(r.id || r.receipt_code || r.receiptCode);
      await client.query(
        `INSERT INTO receipts (receipt_code, date, supplier, note, total, raw_data)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          receiptCode,
          safeText(r.date),
          safeText(r.supplier),
          safeText(r.note),
          safeNumber(r.total),
          JSON.stringify(r)
        ]
      );

      for (const item of r.items || []) {
        await client.query(
          `INSERT INTO receipt_items (receipt_code, sku, name, pack, qty, cost, raw_data)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            receiptCode,
            safeText(item.sku),
            safeText(item.name),
            safeNumber(item.pack || 1),
            safeNumber(item.qty),
            safeNumber(item.cost),
            JSON.stringify(item)
          ]
        );
      }
    }

    for (const m of data.masterOrders || []) {
      await client.query(
        `INSERT INTO master_orders (master_code, date, note, total, raw_data)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          safeText(m.id || m.masterCode),
          safeText(m.date),
          safeText(m.note),
          safeNumber(m.total),
          JSON.stringify(m)
        ]
      );
    }

    for (const report of data.shortageReports || []) {
      const reportCode = safeText(report.id || report.reportCode);
      await client.query(
        `INSERT INTO shortage_reports (report_code, created_at, file_name, raw_data)
         VALUES ($1,$2,$3,$4)`,
        [
          reportCode,
          safeText(report.createdAt || report.date),
          safeText(report.fileName),
          JSON.stringify(report)
        ]
      );

      for (const item of report.items || []) {
        await client.query(
          `INSERT INTO shortage_items (
            report_code, order_code, staff_code, staff_name, customer_code,
            customer_name, sku, name, needed_qty, stock_qty, missing_qty,
            import_qty, raw_data
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            reportCode,
            safeText(item.orderCode || item.orderId),
            safeText(item.staffCode),
            safeText(item.staffName),
            safeText(item.customerCode),
            safeText(item.customerName),
            safeText(item.sku),
            safeText(item.name),
            safeNumber(item.neededQty || item.needQty || item.requiredQty),
            safeNumber(item.stockQty || item.currentStock),
            safeNumber(item.missingQty || item.shortageQty),
            safeNumber(item.importQty || item.finalQty),
            JSON.stringify(item)
          ]
        );
      }
    }

    await client.query('COMMIT');

    res.json({ success: true, mode: 'table_schema_auto_upgrade' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /api/data error:', err);
    res.status(500).json({
      error: 'Lỗi lưu dữ liệu bảng',
      detail: err.message
    });
  } finally {
    client.release();
  }
});

app.get('/', (req, res) => {
  res.send('API kho TABLE tự nâng cấp schema đang chạy 🚀');
});

app.listen(PORT, () => {
  console.log('Server chạy cổng ' + PORT);
});