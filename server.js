'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const dataRoutes = require('./routes/dataRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { initDB } = require('./config/db');

const mobileAuthRoutes = require('./routes/mobile/mobileAuthRoutes');
const mobileSalesRoutes = require('./routes/mobile/mobileSalesRoutes');
const mobileDeliveryRoutes = require('./routes/mobile/mobileDeliveryRoutes');
const mobileReportRoutes = require('./routes/mobile/mobileReportRoutes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static frontend files: index.html, sales-app.html, delivery-app.html, login.html, css/js/components/modules
app.use(express.static(__dirname));

// Web API routes. These route files already define their full paths such as /api/login and /api/data.
app.use(healthRoutes);
app.use(authRoutes);
app.use(dataRoutes);
app.use(paymentRoutes);
app.use(reportRoutes);

// Mobile API routes.
app.use('/api/mobile/auth', mobileAuthRoutes);
app.use('/api/mobile/sales', mobileSalesRoutes);
app.use('/api/mobile/delivery', mobileDeliveryRoutes);
app.use('/api/mobile/reports', mobileReportRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API hoặc file không tồn tại',
    path: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('SERVER_ERROR:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Lỗi server'
  });
});

const PORT = process.env.PORT || 10000;

initDB()
  .catch(err => {
    console.error('DB_INIT_ERROR:', err);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`KHO API running on port ${PORT}`);
    });
  });
