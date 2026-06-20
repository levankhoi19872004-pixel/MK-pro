require('dotenv').config();

const { validateRuntimeConfig } = require('./src/config/app.config');
validateRuntimeConfig(process.env, { profile: 'server' });

const { startServer } = require('./src/app');
const { logger } = require('./src/observability/logger');

startServer().catch((err) => {
  logger.fatal({ err }, 'Không thể khởi động server');
  process.exit(1);
});
