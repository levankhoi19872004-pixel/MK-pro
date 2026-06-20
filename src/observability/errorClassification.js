'use strict';

function classifyError(error = {}, statusOverride) {
  const status = Number(statusOverride || error.status || error.statusCode || 500);
  const code = String(error.code || '').toUpperCase();
  if (status === 401 || /AUTHENTICATION|TOKEN/.test(code)) return 'AUTHENTICATION_ERROR';
  if (status === 403 || /AUTHORIZATION|FORBIDDEN/.test(code)) return 'AUTHORIZATION_ERROR';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409 || /CONFLICT|DUPLICATE|IDEMPOT/.test(code)) return 'CONFLICT';
  if (status === 400 || status === 422 || /VALIDATION|INVALID|REQUIRED/.test(code)) return 'VALIDATION_ERROR';
  if (/MONGO|DATABASE|DB_/.test(code) || error.name === 'MongoError' || error.name === 'MongooseError') return 'DATABASE_ERROR';
  if (/WORKER|JOB/.test(code)) return 'WORKER_ERROR';
  if (/EXPORT/.test(code)) return 'EXPORT_ERROR';
  if (/IMPORT/.test(code)) return 'IMPORT_ERROR';
  if (/DEPENDENCY|TIMEOUT|ECONN|ENOTFOUND/.test(code)) return 'DEPENDENCY_ERROR';
  return 'INTERNAL_ERROR';
}

module.exports = { classifyError };
