import { mobileApi, setToken, setUser, getToken, getUser } from './api.js';
import { setMessage } from './ui.js';

const form = document.getElementById('loginForm');
const message = document.getElementById('loginMessage');

function getRoleHome(user) {
  if (user?.role === 'delivery') return './delivery.html';
  if (user?.role === 'sales') return './sales.html';
  if (user?.role === 'admin') return './sales.html';
  if (user?.role === 'accountant') return '../index.html';
  return './login.html';
}

if (getToken()) {
  const user = getUser();
  window.location.href = getRoleHome(user);
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  setMessage(message, 'Đang đăng nhập...');

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const data = await mobileApi.login({ username, password });
    setToken(data.token, data.refreshToken);
    setUser(data.user);

    window.location.href = getRoleHome(data.user);
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
});
