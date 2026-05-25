const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ROLE_DEFINITIONS, normalizeRole, publicProfile } = require('../security/permissions');

async function ensureAdminUser(){
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const exists = await User.findOne({ username });
  if(exists) return exists;
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || '123456', 10);
  return User.create({ username, passwordHash, name: 'Admin', code: 'ADMIN', role: 'admin' });
}

async function login(username, password){
  const user = await User.findOne({ username: String(username || '').trim().toLowerCase(), active: true });
  if(!user) throw new Error('Sai tài khoản hoặc mật khẩu');
  const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
  if(!ok) throw new Error('Sai tài khoản hoặc mật khẩu');
  const payload = publicProfile({ id: user._id.toString(), username: user.username, name: user.name, code: user.code, role: user.role, permissions: user.permissions });
  const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
  return { token, user: payload };
}

async function upsertUser(input){
  const username = String(input.username || input.code || '').trim().toLowerCase();
  if(!username) throw new Error('Thiếu tài khoản');
  const update = {
    username,
    name: input.name || username,
    code: input.code || '',
    role: normalizeRole(input.role || 'sales'),
    active: input.active !== false
  };
  if(!ROLE_DEFINITIONS[update.role]) throw new Error('Vai trò không hợp lệ');
  if(Array.isArray(input.permissions)){ update.permissions = input.permissions.filter(Boolean).map(String); }
  if(input.password){ update.passwordHash = await bcrypt.hash(String(input.password), 10); }
  const user = await User.findOneAndUpdate({ username }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  return { username: user.username, name: user.name, code: user.code, role: user.role, active: user.active, permissions: user.permissions || [] };
}

async function listUsers(){
  return User.find({}).select('username name code role active permissions createdAt updatedAt').sort({ role: 1, username: 1 }).lean();
}

async function deleteUser(username){
  const user = String(username || '').trim().toLowerCase();
  if(!user) throw new Error('Thiếu tài khoản cần xoá');
  if(user === 'admin') throw new Error('Không xoá tài khoản admin mặc định');
  await User.deleteOne({ username: user });
}

module.exports = { ensureAdminUser, login, upsertUser, listUsers, deleteUser };
