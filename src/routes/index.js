// V45 route entrypoint.
// Giai đoạn này các route nghiệp vụ cũ vẫn được đăng ký trong src/legacy/legacyApp.js để giữ 100% tương thích API.
// Khi tách sâu từng module, mount router tại đây rồi gọi từ src/app.js.

const express = require('express');

function createRouter() {
  return express.Router();
}

module.exports = { createRouter };
