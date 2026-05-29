require('dotenv').config();

const { startServer } = require('./src/app');

startServer().catch((err) => {
  console.error('Không thể khởi động server:', err);
  process.exit(1);
});
