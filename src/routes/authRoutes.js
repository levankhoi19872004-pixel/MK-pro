const express = require('express');
const router = express.Router();

const { readData, writeData } = require('../config/db');
const {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  login,
  listUsers,
  createUser,
  updateUser
} = require('../services/authService');

function sendError(res, error, status = 400) {
  return res.status(status).json({ success: false, message: error.message });
}

router.post('/api/auth/login', async (req, res) => {
  try {
    const data = await readData();
    const result = login(data, req.body && req.body.username, req.body && req.body.password);
    await writeData(data);
    res.json({ success: true, message: 'Đăng nhập thành công', data: result });
  } catch (error) {
    sendError(res, error, 401);
  }
});

router.get('/api/auth/me', async (req, res) => {
  res.json({ success: true, data: req.user });
});

router.get('/api/auth/roles', (req, res) => {
  res.json({
    success: true,
    data: {
      roles: ROLES,
      permissions: PERMISSIONS,
      rolePermissions: ROLE_PERMISSIONS
    }
  });
});

router.get('/api/auth/users', async (req, res) => {
  try {
    const data = await readData();
    const users = listUsers(data);
    res.json({ success: true, total: users.length, data: users });
  } catch (error) {
    sendError(res, error, 500);
  }
});

router.post('/api/auth/users', async (req, res) => {
  try {
    const data = await readData();
    const user = createUser(data, req.body || {});
    await writeData(data);
    res.status(201).json({ success: true, message: 'Đã tạo tài khoản', data: user });
  } catch (error) {
    sendError(res, error);
  }
});

router.put('/api/auth/users/:id', async (req, res) => {
  try {
    const data = await readData();
    const user = updateUser(data, req.params.id, req.body || {});
    await writeData(data);
    res.json({ success: true, message: 'Đã cập nhật tài khoản', data: user });
  } catch (error) {
    sendError(res, error, error.message === 'Không tìm thấy tài khoản' ? 404 : 400);
  }
});

module.exports = router;
