'use strict';

function authMobile(roles = []) {
  return function (req, res, next) {
    try {
      const role = req.headers['x-role'] || 'sales';
      const maNhanVien = req.headers['x-ma-nhan-vien'] || 'MOBILE_TEST';
      const tenNhanVien = req.headers['x-ten-nhan-vien'] || 'Mobile Test';

      req.user = {
        role,
        maNhanVien,
        tenNhanVien
      };

      if (Array.isArray(roles) && roles.length && !roles.includes(role)) {
        return res.status(403).json({
          success: false,
          message: 'Không có quyền truy cập'
        });
      }

      return next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Lỗi xác thực mobile'
      });
    }
  };
}

module.exports = authMobile;
