'use strict';

class AppError extends Error {
  constructor(message, statusCode = 400, code = 'APP_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function asyncHandler(fn) {
  return function wrappedAsyncHandler(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function ok(res, data = null, message = 'OK', extra = {}) {
  return res.json({ success: true, message, data, ...extra });
}

function fail(res, err) {
  const status = err.statusCode || err.status || 500;
  const payload = {
    success: false,
    message: err.message || 'Lỗi server',
    code: err.code || 'SERVER_ERROR'
  };
  if (err.details) payload.details = err.details;
  return res.status(status).json(payload);
}

module.exports = { AppError, asyncHandler, ok, fail };
