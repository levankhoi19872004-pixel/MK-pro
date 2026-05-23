'use strict';

/**
 * Cấu hình tập trung cho toàn bộ frontend.
 * Khi đổi API Render sau này, chỉ cần sửa duy nhất API_BASE tại file này.
 */
(function () {
  const API_BASE = 'https://kho-api-2.onrender.com';

  window.KHO_CONFIG = Object.freeze({
    API_BASE
  });

  // Giữ tương thích với các module cũ đang đọc 2 biến này.
  window.KHO_API_URL = API_BASE;
  window.WAREHOUSE_API_BASE = API_BASE;
})();
