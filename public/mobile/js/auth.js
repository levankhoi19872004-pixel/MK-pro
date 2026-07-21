import { mobileApi, setToken, setUser, getToken, getUser } from './api.js';
import { setMessage } from './ui.js';

const form = document.getElementById('loginForm');
const message = document.getElementById('loginMessage');
const appTargetContract = window.AppTargetContract || null;
const roleHomeTargets = Object.freeze({
  delivery: 'delivery',
  sales: 'sales',
  warehouse: 'warehouse',
  admin: 'sales',
  accountant: 'web',
  manager: 'web'
});

function getRoleHome(user) {
  const role = appTargetContract?.normalizeRole(user?.role) || String(user?.role || '').trim().toLowerCase();
  const targetKey = roleHomeTargets[role] || '';
  const targetUrl = appTargetContract?.getTargetUrl(targetKey) || '';
  if (targetUrl) return targetUrl.replace(/^\/mobile\//, './').replace(/^\//, '../');
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
