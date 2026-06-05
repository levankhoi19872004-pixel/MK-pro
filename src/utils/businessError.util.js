'use strict';

class BusinessError extends Error {
  constructor({ code = 'BUSINESS_ERROR', message = 'Lỗi nghiệp vụ', orderCode = '', field = '', level = 'error', meta = {} } = {}) {
    super(message);
    this.name = 'BusinessError';
    this.code = code;
    this.orderCode = orderCode;
    this.field = field;
    this.level = level;
    this.meta = meta;
  }

  toJSON() {
    return makeBusinessError({
      code: this.code,
      message: this.message,
      orderCode: this.orderCode,
      field: this.field,
      level: this.level,
      meta: this.meta
    });
  }
}

function makeBusinessError({ code = 'BUSINESS_ERROR', message = 'Lỗi nghiệp vụ', orderCode = '', field = '', level = 'error', meta = {} } = {}) {
  return { code, message, orderCode, field, level, ...(meta && Object.keys(meta).length ? { meta } : {}) };
}

function makeBusinessWarning(args = {}) {
  return makeBusinessError({ ...args, level: 'warning' });
}

function toBusinessError(err, fallback = {}) {
  if (!err) return makeBusinessError(fallback);
  if (typeof err.toJSON === 'function') return err.toJSON();
  return makeBusinessError({ ...fallback, code: err.code || fallback.code || 'BUSINESS_ERROR', message: err.message || fallback.message || 'Lỗi nghiệp vụ' });
}

module.exports = { BusinessError, makeBusinessError, makeBusinessWarning, toBusinessError };
