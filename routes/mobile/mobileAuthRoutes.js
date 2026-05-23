'use strict';

const express = require('express');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu tài khoản hoặc mật khẩu'
      });
    }

    const role = String(username).toUpperCase().startsWith('GH') ? 'delivery' : 'sales';

    return res.json({
      success: true,
      token: 'mobile-test-token',
      user: {
        username,
        maNhanVien: username,
        tenNhanVien: username,
        role
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Lỗi đăng nhập mobile'
    });
  }
});

module.exports = router;
