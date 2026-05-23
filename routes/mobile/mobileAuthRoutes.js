'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const { readKhoData } = require('../../config/db');
const { norm } = require('../../utils/format');
const { asyncHandler, ok, AppError } = require('../../utils/http');
const { buildLoginUsers, syncAccountsToStaff } = require('../../utils/accounts');

const SECRET = process.env.JWT_SECRET || 'kho_pro_secret_key';
const router = express.Router();

function toMobileRole(role, username) {
  const r = norm(role);
  if (r.includes('giao') || r === 'delivery') return 'delivery';
  if (r.includes('admin')) return 'admin';
  if (r.includes('ke toan') || r === 'accountant') return 'accountant';
  if (String(username || '').toUpperCase().startsWith('GH')) return 'delivery';
  return 'sales';
}

router.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) throw new AppError('Thiếu tài khoản hoặc mật khẩu', 400, 'MISSING_LOGIN');

  const data = await readKhoData();
  syncAccountsToStaff(data);
  const loginUsers = buildLoginUsers(data);
  const found = loginUsers.find(u => norm(u.username) === norm(username) && String(u.password) === String(password));

  if (!found) throw new AppError('Sai tài khoản hoặc mật khẩu', 401, 'INVALID_LOGIN');

  const user = {
    username: found.username,
    maNhanVien: found.staffCode || found.deliveryCode || found.code || found.username,
    tenNhanVien: found.name || found.username,
    code: found.staffCode || found.deliveryCode || found.code || found.username,
    role: toMobileRole(found.role, found.username)
  };

  const token = jwt.sign(user, SECRET, { expiresIn: '30d' });
  return ok(res, { token, user }, 'Đăng nhập mobile thành công');
}));

module.exports = router;
