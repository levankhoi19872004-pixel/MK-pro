const cors = require('cors');

const corsOptions = {
  origin(origin, callback) {
    const configured = String(process.env.CORS_ORIGINS || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);

    const allowAll = configured.length === 0 || configured.includes('*');
    const isLocal = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isNetlify = !!origin && /^https:\/\/[^/]+\.netlify\.app$/.test(origin);
    const isConfigured = !!origin && configured.includes(origin);

    if (allowAll || isLocal || isNetlify || isConfigured) {
      return callback(null, true);
    }

    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = cors(corsOptions);
