const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { readKhoData } = require('../config/db');
const { syncAccountsToStaff, buildLoginUsers } = require('../utils/accounts');
const { normText } = require('../utils/text');

const SECRET = process.env.JWT_SECRET || 'kho_pro_secret_key';

router.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const data = await readKhoData();
    syncAccountsToStaff(data);

    const loginUsers = buildLoginUsers(data);console.log('LOGIN_USERS:', loginUsers.map(u => ({
  username: u.username,
  password: u.password,
  role: u.role,
  name: u.name
})));

    const user = loginUsers.find(
      u => normText(u.username) === normText(username) && String(u.password) === String(password)
    );

    if (!user) {
      return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    }

    const safeUser = {
      username: user.username,
      role: user.role,
      name: user.name,
      code: user.code || user.staffCode || user.deliveryCode || '',
      staffCode: user.staffCode || '',
      deliveryCode: user.deliveryCode || '',
      phone: user.phone || ''
    };

    const token = jwt.sign(safeUser, SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: safeUser
    });
  } catch (err) {
    console.error('POST /api/login error:', err);
    res.status(500).json({
      error: 'Không đăng nhập được',
      detail: err.message
    });
  }
});

router.post('/api/logout', (req, res) => {
  res.json({ success: true });
});

module.exports = router;
