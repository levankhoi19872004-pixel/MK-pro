'use strict';

/**
 * V45 application entry.
 *
 * Giai đoạn tách lõi hiện tại:
 * - server.js chỉ khởi động server.
 * - src/app.js là điểm xuất app/startServer duy nhất.
 * - legacyApp.js vẫn giữ lõi cũ nhưng đã bắt đầu tách route ra module riêng.
 * - Các route mobile giao hàng, static và health đã được tách khỏi legacy.
 */

require('dotenv').config();

const { app, startServer } = require('./legacy/legacyApp');

module.exports = {
  app,
  startServer
};
