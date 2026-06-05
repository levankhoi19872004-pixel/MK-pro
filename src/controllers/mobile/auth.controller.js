'use strict';

const { createMobileAuthService } = require('../../services/mobile/auth.service');
const { wrapMobile } = require('./_mobileResponse');

function createMobileAuthController(ctx) {
  const service = createMobileAuthService(ctx);
  return {
    login: wrapMobile(service, 'login', 500, 'Không đăng nhập được mobile app'),
    refresh: wrapMobile(service, 'refresh', 500, 'Không làm mới được phiên đăng nhập'),
    me: wrapMobile(service, 'me'),
    roles: wrapMobile(service, 'roles', 500, 'Không tải được vai trò mobile')
  };
}

module.exports = { createMobileAuthController };
