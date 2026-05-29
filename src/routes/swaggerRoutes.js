'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const openApiPath = path.join(__dirname, '..', '..', process.env.OPENAPI_JSON_PATH || 'docs/openapi.json');

const docsRateLimiter = rateLimit({
  windowMs: Number(process.env.DOCS_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.DOCS_RATE_LIMIT_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    success: false,
    message: 'Truy cập tài liệu API quá nhiều lần, vui lòng thử lại sau ít phút'
  }
});

function readOpenApiDocument() {
  return JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
}

function getBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function isDocsAuthRequired() {
  if (process.env.API_DOCS_PUBLIC === 'true') return false;
  if (process.env.API_DOCS_REQUIRE_AUTH === 'true') return true;
  return process.env.NODE_ENV === 'production';
}

function docsAuthGuard(req, res, next) {
  if (!isDocsAuthRequired()) return next();

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(503).json({
      ok: false,
      success: false,
      message: 'API docs đang bị khóa vì JWT_SECRET chưa được cấu hình'
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({
      ok: false,
      success: false,
      message: 'Cần Bearer token để truy cập API docs trong production'
    });
  }

  try {
    req.docsUser = jwt.verify(token, secret);
    return next();
  } catch (err) {
    return res.status(401).json({
      ok: false,
      success: false,
      message: 'Bearer token không hợp lệ hoặc đã hết hạn'
    });
  }
}

router.use('/docs', docsRateLimiter, docsAuthGuard);

router.get('/docs/openapi.json', (req, res) => {
  res.json(readOpenApiDocument());
});

router.get('/docs', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KHO Minh Khai Pro V45 API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>body{margin:0;background:#fafafa}.topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '/api/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout'
      });
    };
  </script>
</body>
</html>`);
});

module.exports = router;
module.exports.docsAuthGuard = docsAuthGuard;
module.exports.isDocsAuthRequired = isDocsAuthRequired;
