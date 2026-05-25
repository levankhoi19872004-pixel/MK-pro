const jwt = require('jsonwebtoken');
const { isAdmin, hasPermission } = require('../security/permissions');

function auth(req, res, next){
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if(!token) return res.status(401).json({ error: 'Thiếu token đăng nhập' });
  try{
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
    next();
  }catch(err){
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

function requireAdmin(req, res, next){
  if(!isAdmin(req.user)) return res.status(403).json({ error: 'Không có quyền quản trị' });
  next();
}

function requirePermission(permission){
  return (req, res, next) => {
    if(!hasPermission(req.user, permission)) return res.status(403).json({ error: 'Không có quyền: ' + permission });
    next();
  };
}

module.exports = { auth, requireAdmin, requirePermission };
