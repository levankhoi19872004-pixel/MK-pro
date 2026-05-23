'use strict';

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'kho_pro_secret_key';

function pickHeader(req, key) {
  return req.headers[key] || req.headers[String(key).toLowerCase()] || '';
}

function authMobile(roles = []) {
  return function mobileAuthMiddleware(req, res, next) {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      let user = null;

      if (token && token !== 'mobile-test-token') {
        user = jwt.verify(token, SECRET);
      } else {
        // Backward compatible với app mobile cũ đang gửi thông tin bằng header.
        const role = pickHeader(req, 'x-role') || 'sales';
        const maNhanVien = pickHeader(req, 'x-ma-nhan-vien') || pickHeader(req, 'x-staff-code') || 'MOBILE_TEST';
        const tenNhanVien = decodeURIComponent(String(pickHeader(req, 'x-ten-nhan-vien') || pickHeader(req, 'x-staff-name') || maNhanVien));
        user = { role, maNhanVien, tenNhanVien, code: maNhanVien, username: maNhanVien };
      }

      req.user = {
        role: user.role || 'sales',
        maNhanVien: user.maNhanVien || user.staffCode || user.code || user.username || '',
        tenNhanVien: user.tenNhanVien || user.name || user.username || '',
        username: user.username || user.maNhanVien || user.code || '',
        code: user.code || user.maNhanVien || user.staffCode || ''
      };

      if (Array.isArray(roles) && roles.length && !roles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Không có quyền truy cập', code: 'FORBIDDEN' });
      }

      return next();
    } catch (err) {
      return res.status(401).json({ success: false, message: 'Token mobile lỗi hoặc đã hết hạn', code: 'MOBILE_AUTH_ERROR' });
    }
  };
}

module.exports = authMobile;
