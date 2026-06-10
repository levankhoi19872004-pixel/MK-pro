'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  manager: 'Quản lý',
  accountant: 'Kế toán',
  warehouse: 'Kho',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || process.env.MOBILE_ACCESS_TOKEN_EXPIRES_IN || '1d';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || process.env.MOBILE_REFRESH_TOKEN_EXPIRES_IN || '30d';

function jwtSecret() {
  const secret = [process.env.JWT_SECRET, process.env.MOBILE_JWT_SECRET].find(Boolean);
  if (!secret) {
    throw new Error('Missing JWT_SECRET');
  }
  return secret;
}

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$/.test(String(value || ''));
}

async function verifyPassword(input, stored) {
  const password = String(input || '');
  const saved = String(stored || '').trim();
  if (!saved) return password === '123456';
  if (isBcryptHash(saved)) return bcrypt.compare(password, saved);
  return password === saved;
}

function safeUser(user = {}) {
  const role = String(user.role || '').trim() || 'sales';
  const code = String(user.staffCode || user.code || user.username || user._id || '').trim();
  return {
    id: String(user._id || user.id || code || '').trim(),
    code,
    staffCode: String(user.staffCode || user.code || code || '').trim(),
    username: String(user.username || code || '').trim(),
    name: String(user.name || user.fullName || user.username || code || '').trim(),
    fullName: String(user.fullName || user.name || user.username || code || '').trim(),
    phone: String(user.phone || '').trim(),
    role,
    roleLabel: ROLE_LABELS[role] || role,
    isActive: user.isActive !== false
  };
}

function signToken(user, expiresIn = ACCESS_TOKEN_EXPIRES_IN) {
  return jwt.sign(safeUser(user), jwtSecret(), { expiresIn });
}

function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ ok: false, success: false, message: 'Bạn chưa đăng nhập' });
  try {
    req.user = jwt.verify(token, jwtSecret());
    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, success: false, message: 'Phiên đăng nhập đã hết hạn' });
  }
}

router.post('/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    if (!username || !password) return res.status(400).json({ ok: false, success: false, message: 'Thiếu tài khoản hoặc mật khẩu' });

    const user = await User.findOne({
      isActive: { $ne: false },
      $or: [
        { username },
        { staffCode: username },
        { code: username },
        { phone: username },
        { name: username },
        { fullName: username }
      ]
    }).lean();

    if (!user || !(await verifyPassword(password, user.password || user.pass || user.pin))) {
      return res.status(401).json({ ok: false, success: false, message: 'Sai tài khoản hoặc mật khẩu' });
    }

    const clientUser = safeUser(user);
    return res.json({
      ok: true,
      success: true,
      source: 'users-auth-route',
      token: signToken(clientUser),
      refreshToken: signToken(clientUser, REFRESH_TOKEN_EXPIRES_IN),
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      user: clientUser
    });
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, message: err.message || 'Không đăng nhập được' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = String(req.body?.refreshToken || '').trim();
    if (!refreshToken) return res.status(401).json({ ok: false, success: false, message: 'Refresh token không hợp lệ' });
    const user = jwt.verify(refreshToken, jwtSecret());
    const clientUser = safeUser(user);
    return res.json({
      ok: true,
      success: true,
      source: 'users-auth-route',
      token: signToken(clientUser),
      refreshToken: signToken(clientUser, REFRESH_TOKEN_EXPIRES_IN),
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      user: clientUser
    });
  } catch (err) {
    return res.status(401).json({ ok: false, success: false, message: 'Refresh token không hợp lệ hoặc đã hết hạn' });
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ ok: true, success: true, source: 'users-auth-route', user: safeUser(req.user), roleLabels: ROLE_LABELS }));
router.get('/roles', requireAuth, (req, res) => res.json({ ok: true, success: true, source: 'users-auth-route', roles: ROLE_LABELS }));

module.exports = router;
