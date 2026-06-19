'use strict';

const userService = require('../services/userService');

async function listUsers(req, res) {
  try {
    const users = await userService.listUsers(req.query);
    res.json({ ok: true, source: 'mongo-route', users });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được danh sách tài khoản từ MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function saveUser(req, res) {
  try {
    const result = await userService.saveUser(req.body || {}, { actor: req.user || {} });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.status(result.created ? 201 : 200).json({ ok: true, source: 'mongo-route', message: result.created ? 'Đã tạo tài khoản trên MongoDB' : 'Đã cập nhật tài khoản vào MongoDB', user: result.user });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lưu được tài khoản trên MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function deleteUser(req, res) {
  try {
    const result = await userService.deleteUser(req.params.id, { actor: req.user || {}, reason: req.body?.reason });
    if (result.error) return res.status(result.status || 400).json({ ok: false, message: result.error });
    res.json({ ok: true, source: 'mongo-route', message: 'Đã vô hiệu hóa tài khoản; lịch sử thao tác được giữ nguyên', deactivated: true, user: result.user });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không vô hiệu hóa được tài khoản trên MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function listStaffs(req, res) {
  try {
    const staffs = await userService.listStaffs(req.query);
    res.json({ ok: true, source: 'mongo-route', staffs });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được nhân viên từ MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function listRoles(req, res) {
  try {
    const roles = await userService.listRoles();
    res.json({ ok: true, source: 'mongo-route', roles });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được vai trò từ MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

async function listPermissions(req, res) {
  try {
    const permissions = await userService.listPermissions(req.query.roleCode || req.query.role || '');
    res.json({ ok: true, source: 'mongo-route', permissions });
  } catch (err) {
    res.status(500).json({ ok: false, message: 'Không lấy được phân quyền từ MongoDB', error: process.env.NODE_ENV === 'production' ? undefined : err.message });
  }
}

module.exports = {
  listUsers,
  saveUser,
  deleteUser,
  listStaffs,
  listRoles,
  listPermissions
};
