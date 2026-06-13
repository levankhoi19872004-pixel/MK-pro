'use strict';

const { attachRefreshToken } = require('../../security/refreshTokenCookie');
const { attachAccessToken } = require('../../security/accessTokenCookie');

function sendMobileResponse(res, result) {
  const status = result.statusCode || result.status || 200;
  const body = attachAccessToken(res, attachRefreshToken(res, result.body || result));
  return res.status(status).json(body);
}

function wrapMobile(service, method, fallbackStatus = 500, fallbackMessage = 'Lỗi mobile API') {
  return async (req, res) => {
    try {
      return sendMobileResponse(res, await service[method]({
        req,
        body: req.body || {},
        query: req.query || {},
        params: req.params || {},
        mobileUser: req.mobileUser
      }));
    } catch (err) {
      const status = err.statusCode || err.status || fallbackStatus;
      const publicMessage = process.env.NODE_ENV === 'production' && Number(status) >= 500
        ? fallbackMessage
        : (err.message || fallbackMessage);
      return res.status(status).json({
        ok: false,
        success: false,
        message: publicMessage,
        error: process.env.NODE_ENV === 'production' ? undefined : err.message
      });
    }
  };
}

module.exports = { sendMobileResponse, wrapMobile };
