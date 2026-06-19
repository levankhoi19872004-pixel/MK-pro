'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { jwtSecret, refreshJwtSecret, assertTokenType, requireAuth } = require('../middlewares/auth.middleware');
const { verifyPassword } = require('../security/passwordPolicy');
const { readRefreshToken, setRefreshTokenCookie, clearRefreshTokenCookie, exposeRefreshTokenInBody } = require('../security/refreshTokenCookie');
const { setAccessTokenCookie, clearAccessTokenCookie } = require('../security/accessTokenCookie');
const { pickSalesStaffCode, pickSalesStaffName, pickUserAccountSalesStaffCode } = require('../domain/staff/staffIdentity');

const router = express.Router();

const ROLE_LABELS = {
  admin: 'Admin - toàn quyền',
  manager: 'Quản lý',
  accountant: 'Kế toán',
  warehouse: 'Kho',
  sales: 'Bán hàng',
  delivery: 'Giao hàng'
};

const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || process.env.MOBILE_ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || process.env.MOBILE_REFRESH_TOKEN_EXPIRES_IN || '30d';

const authLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { ok: false, success: false, message: 'Quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau.' }
});

const refreshLimiter = rateLimit({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.AUTH_REFRESH_RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, success: false, message: 'Quá nhiều yêu cầu làm mới phiên đăng nhập.' }
});

function safeUser(user = {}) {
  const role = String(user.role || '').trim() || 'sales';
  const salesStaffCode = role === 'sales'
    ? (pickSalesStaffCode(user) || pickUserAccountSalesStaffCode(user))
    : pickSalesStaffCode(user);
  const salesStaffName = pickSalesStaffName(user);
  const code = String(salesStaffCode || user.staffCode || user.code || '').trim();
  const name = String(salesStaffName || user.fullName || user.name || user.username || code || '').trim();
  return {
    tenantId: String(user.tenantId || process.env.DEFAULT_TENANT_ID || 'minh-khai').trim(),
    id: String(user._id || user.id || code || '').trim(),
    code,
    staffCode: code,
    username: String(user.username || code || '').trim(),
    name,
    fullName: name,
    phone: String(user.phone || '').trim(),
    role,
    roleLabel: ROLE_LABELS[role] || role,
    salesStaffCode,
    salesStaffName,
    salesmanCode: salesStaffCode,
    salesmanName: salesStaffName,
    isActive: user.isActive !== false
  };
}

function signAccessToken(user) {
  return jwt.sign({ ...safeUser(user), tokenType: 'access' }, jwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

function signRefreshToken(user) {
  return jwt.sign({ ...safeUser(user), tokenType: 'refresh' }, refreshJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

async function reloadActiveUser(tokenPayload = {}) {
  const id = String(tokenPayload.id || '').trim();
  const username = String(tokenPayload.username || '').trim();
  const staffCode = String(tokenPayload.staffCode || tokenPayload.code || '').trim();
  const or = [];
  if (/^[a-f\d]{24}$/i.test(id)) or.push({ _id: id });
  if (id) or.push({ id });
  if (username) or.push({ username });
  if (staffCode) or.push({ staffCode }, { code: staffCode });
  if (!or.length) return null;
  return User.findOne({ isActive: { $ne: false }, $or: or }).lean();
}

router.post('/login', authLimiter, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '').trim();
    if (!username || !password) return res.status(400).json({ ok: false, success: false, message: 'Thiếu tài khoản hoặc mật khẩu' });

    const tenantFilter = String(process.env.TENANT_MODE || 'single').toLowerCase() === 'multi'
      ? { tenantId: req.tenantId }
      : {};
    const user = await User.findOne({
      ...tenantFilter,
      isActive: { $ne: false },
      $or: [
        { username },
        { staffCode: username },
        { code: username },
        { phone: username }
      ]
    }).lean();

    const passwordValid = await verifyPassword(password, user && user.password);
    if (!user || !passwordValid) {
      return res.status(401).json({ ok: false, success: false, message: 'Sai tài khoản hoặc mật khẩu' });
    }

    const clientUser = safeUser(user);
    if (['sales', 'delivery'].includes(clientUser.role) && !clientUser.staffCode) {
      return res.status(400).json({ ok: false, success: false, message: 'Tài khoản chưa được gán mã nhân viên nghiệp vụ' });
    }
    const accessToken = signAccessToken(clientUser);
    const refreshToken = signRefreshToken(clientUser);
    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, refreshToken);
    return res.json({
      ok: true,
      success: true,
      source: 'users-auth-route',
      token: accessToken,
      ...(exposeRefreshTokenInBody() ? { refreshToken } : {}),
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      user: clientUser
    });
  } catch (err) {
    return res.status(500).json({ ok: false, success: false, message: err.message || 'Không đăng nhập được' });
  }
});

router.post('/refresh', refreshLimiter, async (req, res) => {
  try {
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) return res.status(401).json({ ok: false, success: false, message: 'Refresh token không hợp lệ' });
    const payload = assertTokenType(jwt.verify(refreshToken, refreshJwtSecret()), 'refresh');
    const currentUser = await reloadActiveUser(payload);
    if (!currentUser) return res.status(401).json({ ok: false, success: false, message: 'Tài khoản không còn hoạt động' });
    const clientUser = safeUser(currentUser);
    if (['sales', 'delivery'].includes(clientUser.role) && !clientUser.staffCode) {
      return res.status(400).json({ ok: false, success: false, message: 'Tài khoản chưa được gán mã nhân viên nghiệp vụ' });
    }
    const accessToken = signAccessToken(clientUser);
    const rotatedRefreshToken = signRefreshToken(clientUser);
    setAccessTokenCookie(res, accessToken);
    setRefreshTokenCookie(res, rotatedRefreshToken);
    return res.json({
      ok: true,
      success: true,
      source: 'users-auth-route',
      token: accessToken,
      ...(exposeRefreshTokenInBody() ? { refreshToken: rotatedRefreshToken } : {}),
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      user: clientUser
    });
  } catch (err) {
    return res.status(401).json({ ok: false, success: false, message: 'Refresh token không hợp lệ hoặc đã hết hạn' });
  }
});

router.post('/logout', (req, res) => {
  clearAccessTokenCookie(res);
  clearRefreshTokenCookie(res);
  return res.json({ ok: true, success: true, message: 'Đã đăng xuất' });
});

router.get('/me', requireAuth, (req, res) => res.json({ ok: true, success: true, source: 'users-auth-route', user: safeUser(req.user), roleLabels: ROLE_LABELS }));
router.get('/roles', requireAuth, (req, res) => res.json({ ok: true, success: true, source: 'users-auth-route', roles: ROLE_LABELS }));

module.exports = router;
