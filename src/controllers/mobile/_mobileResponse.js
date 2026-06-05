'use strict';

function sendMobileResponse(res, result) {
  const status = result.statusCode || result.status || 200;
  const body = result.body || result;
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
      return res.status(err.statusCode || err.status || fallbackStatus).json({
        ok: false,
        success: false,
        message: err.message || fallbackMessage,
        error: process.env.NODE_ENV === 'production' ? undefined : err.message
      });
    }
  };
}

module.exports = { sendMobileResponse, wrapMobile };
