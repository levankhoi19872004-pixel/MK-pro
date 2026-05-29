'use strict';

const { createMobileAuthRepository } = require('../../repositories/mobile/auth.repository');

function fail(statusCode, message) {
  return { statusCode, body: { ok: false, success: false, message } };
}

function createMobileAuthService(ctx) {
  const repo = createMobileAuthRepository(ctx);
  const {
    ROLE_LABELS,
    VALID_ROLES,
    ACCESS_TOKEN_EXPIRES_IN,
    verifyPasswordSync,
    staffMongoToClient,
    stripMongoFields,
    buildJwtPayload,
    encodeMobileToken,
    encodeMobileRefreshToken,
    decodeMobileRefreshToken,
    writeMobileLog
  } = ctx;

  async function login({ body = {} }) {
    const data = await repo.getPrimaryDataSnapshot();
    const username = String(body.username || '').trim();
    const password = String(body.password || '').trim();
    if (!username || !password) return fail(400, 'Thiếu tài khoản hoặc mật khẩu');

    const staffDoc = await repo.findActiveStaffByLogin(username);
    const staff = staffDoc && verifyPasswordSync(password, staffDoc.password || staffDoc.pass || staffDoc.pin || '123456')
      ? staffMongoToClient(staffDoc)
      : null;
    if (!staff) return fail(401, 'Sai tài khoản hoặc mật khẩu');

    const role = VALID_ROLES.includes(staff.role || staff.type) ? (staff.role || staff.type) : 'sales';
    const user = {
      id: staff.id || staff.code || username,
      code: staff.code || '',
      username: staff.username || staff.code || username,
      name: staff.name || staff.fullName || username,
      role,
      roleLabel: ROLE_LABELS[role]
    };

    writeMobileLog(data, user, 'mobile_login', { note: 'Đăng nhập mobile app bằng Mongo staffs' });
    await repo.persistPrimaryDataSnapshot(data);
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
