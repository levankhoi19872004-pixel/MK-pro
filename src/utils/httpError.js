'use strict';

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status || 500;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new HttpError(400, message || 'Dữ liệu không hợp lệ', details);
}

function notFound(message, details) {
  return new HttpError(404, message || 'Không tìm thấy dữ liệu', details);
}

function conflict(message, details) {
  return new HttpError(409, message || 'Dữ liệu đã tồn tại', details);
}

module.exports = {
  HttpError,
  badRequest,
  notFound,
  conflict
};
