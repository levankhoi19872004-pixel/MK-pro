'use strict';

const { createMobileAuthRepository } = require('../../repositories/mobile/auth.repository');
const { verifyPassword } = require('../../security/passwordPolicy');

function fail(statusCode, message) {
  return { statusCode, body: { ok: false, success: false, message } };
}

function createMobileAuthService(ctx) {
  const repo = createMobileAuthRepository(ctx);
  const {
    ROLE_LABELS,
    VALID_ROLES,
    ACCESS_TOKEN_EXPIRES_IN,
    staffMongoToClient,
    stripMongoFields,
    buildJwtPayload,
    encodeMobileToken,
    encodeMobileRefreshToken,
    decodeMobileRefreshToken,
    writeMobileLogDirect
  } = ctx;

  async function login({ body = {} }) {
    const username = String(body.username || '').trim();
    const password = String(body.password || '').trim();
    if (!username || !password) return fail(400, 'Thiếu tài khoản hoặc mật khẩu');

    const staffDoc = await repo.findActiveStaffByLogin(username);
    const staff = staffDoc && await verifyPassword(password, staffDoc.password)
      ? staffMongoToClient(staffDoc)
      : null;
    if (!staff) return fail(401, 'Sai tài khoản hoặc mật khẩu');

    const user = buildJwtPayload(staffDoc);
    if (['sales', 'delivery'].includes(user.role) && !user.staffCode) {
      return fail(400, 'Tài khoản chưa được gán mã nhân viên nghiệp vụ');
    }

    await writeMobileLogDirect(user, 'mobile_login', { note: 'Đăng nhập mobile app bằng users' });
    return {
      body: {
        ok: true,
        success: true,
        source: 'mobile-auth-route',
        token: encodeMobileToken(user),
        refreshToken: encodeMobileRefreshToken(user),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        user
      }
    };
  }

  async function refresh({ body = {} }) {
    const refreshToken = String(body.refreshToken || '').trim();
    const user = decodeMobileRefreshToken(refreshToken);
    if (!user) return fail(401, 'Refresh token không hợp lệ hoặc đã hết hạn');
    const safeUser = buildJwtPayload(user);
    return {
      body: {
        ok: true,
        success: true,
        source: 'mobile-auth-route',
        token: encodeMobileToken(safeUser),
        refreshToken: encodeMobileRefreshToken(safeUser),
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        user: safeUser
      }
    };
  }

  async function me({ mobileUser }) {
    return { body: { ok: true, source: 'mobile-auth-route', user: mobileUser, roles: ROLE_LABELS } };
  }

  async function roles() {
    const roles = await repo.listActiveRoles();
    return { body: { ok: true, source: 'mobile-auth-route', roles: roles.map(stripMongoFields), roleLabels: ROLE_LABELS } };
  }

  return { login, refresh, me, roles };
}

module.exports = { createMobileAuthService };
