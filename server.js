const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const productRoutes = require('./src/routes/productRoutes');
const searchRoutes = require('./src/routes/searchRoutes');
const warehouseReceiptRoutes = require('./src/routes/warehouseReceiptRoutes');
const stockRoutes = require('./src/routes/stockRoutes');
const salesOrderRoutes = require('./src/routes/salesOrderRoutes');
const receivableRoutes = require('./src/routes/receivableRoutes');
const cashRoutes = require('./src/routes/cashRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const reverseRoutes = require('./src/routes/reverseRoutes');
const lockRoutes = require('./src/routes/lockRoutes');
const authRoutes = require('./src/routes/authRoutes');
const printRoutes = require('./src/routes/printRoutes');
const { requireAuth, accessControl } = require('./src/middlewares/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/info', (req, res) => {
  res.json({
    success: true,
    name: 'KHO Minh Khai Pro V43',
    version: '43.0.15',
    core: 'data catalog -> documents -> posting engine -> reports',
    status: 'running'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API đang hoạt động',
    time: new Date().toISOString()
  });
});

app.use(authRoutes);
app.use('/api', requireAuth, accessControl);

app.use(productRoutes);
app.use(searchRoutes);
app.use(warehouseReceiptRoutes);
app.use(stockRoutes);
app.use(salesOrderRoutes);
app.use(receivableRoutes);
app.use(cashRoutes);
app.use(reportRoutes);
app.use(reverseRoutes);
app.use(lockRoutes);
app.use(printRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Không tìm thấy API',
    path: req.originalUrl
  });
});

app.use((error, req, res, next) => {
  console.error('SERVER_ERROR:', error);
  res.status(500).json({
    success: false,
    message: error.message || 'Lỗi server'
  });
});

app.listen(PORT, () => {
  console.log(`KHO Minh Khai Pro V43 API running on port ${PORT}`);
});

