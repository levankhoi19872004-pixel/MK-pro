'use strict';

const express = require('express');
const { body } = require('express-validator');
const { createMobileAuthController } = require('../../controllers/mobile/auth.controller');

function createMobileAuthRouter(ctx) {
  const router = express.Router();
  const controller = createMobileAuthController(ctx);
  const { authLimiter, requireMobileLogin, validateRequest } = ctx;

  router.post('/login', authLimiter, [
    body('username').isLength({ min: 2 }).withMessage('Tài khoản không hợp lệ'),
    body('password').isLength({ min: 4 }).withMessage('Mật khẩu không hợp lệ')
  ], validateRequest, controller.login);
  router.post('/refresh', authLimiter, controller.refresh);
  router.get('/me', requireMobileLogin, controller.me);
  router.get('/roles', requireMobileLogin, controller.roles);

  return router;
}

module.exports = { createMobileAuthRouter };
