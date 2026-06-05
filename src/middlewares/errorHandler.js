'use strict';

function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, success: false, message: 'Không tìm thấy API', path: req.originalUrl });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = Number(err.status || err.statusCode || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const payload = {
    ok: false,
    success: false,
    message: err.message || 'Lỗi hệ thống'
  };
  if (err.details) payload.details = err.details;
  if (process.env.NODE_ENV !== 'production') payload.stack = err.stack;
  res.status(safeStatus).json(payload);
}

module.exports = { notFoundHandler, errorHandler };
