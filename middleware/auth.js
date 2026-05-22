const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'kho_pro_secret_key';

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token lỗi hoặc đã hết hạn' });
  }
}

module.exports = auth;
