'use strict';

const { badRequest } = require('../utils/httpError');

function requireFields(fields = []) {
  return function requireFieldsMiddleware(req, res, next) {
    const missing = fields.filter((field) => String(req.body?.[field] ?? '').trim() === '');
    if (missing.length) return next(badRequest(`Thiếu trường bắt buộc: ${missing.join(', ')}`, { missing }));
    return next();
  };
}

module.exports = { requireFields };
