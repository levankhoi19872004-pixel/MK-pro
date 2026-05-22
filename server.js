const express = require('express');

const app = express();

const corsMiddleware = require('./config/cors');
const { initDB } = require('./config/db');

const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const dataRoutes = require('./routes/dataRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const reportRoutes = require('./routes/reportRoutes');

const PORT = process.env.PORT || 10000;

app.use(corsMiddleware);
app.use(express.json({ limit: '200mb' }));

app.use(healthRoutes);
app.use(authRoutes);
app.use(dataRoutes);
app.use(paymentRoutes);
app.use(reportRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Không tìm thấy API',
    path: req.path
  });
});

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log('Server chay cong ' + PORT);
    });
  })
  .catch(err => {
    console.error('INIT DB ERROR:', err);
    app.listen(PORT, () => {
      console.log('Server van chay cong ' + PORT);
    });
  });
