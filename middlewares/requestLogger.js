'use strict';

function requestLogger(req, res, next) {
  const started = Date.now();
  req.requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  res.on('finish', () => {
    const ms = Date.now() - started;
    const line = `[${req.requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`;
    if (res.statusCode >= 500) console.error(line);
    else if (res.statusCode >= 400) console.warn(line);
    else console.log(line);
  });

  next();
}

module.exports = requestLogger;
