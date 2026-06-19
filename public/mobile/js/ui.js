export function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setMessage(el, text, type = '') {
  if (!el) return;
  el.textContent = text || '';
  el.className = `message ${type}`.trim();
}

export function money(value) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export function renderSuggestions(container, items, renderItem, onSelect) {
  if (!container) return;
  container.innerHTML = '';
  container.classList.remove('has-many');
  if (!items || !items.length) return;

  container.classList.toggle('has-many', items.length > 6);
  if (items.length > 6) {
    const title = document.createElement('div');
    title.className = 'suggestion-empty';
    title.textContent = `Có ${items.length} sản phẩm. Kéo thanh trượt để tìm thủ công.`;
    container.appendChild(title);
  }
  items.slice(0, 80).forEach(item => {
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'suggestion-item';
    div.textContent = String(renderItem(item) ?? '');
    div.addEventListener('click', () => onSelect(item));
    container.appendChild(div);
  });
}

export function requireLogin() {
  let user = {};
  try { user = JSON.parse(localStorage.getItem('v43_mobile_user') || localStorage.getItem('mk_web_user') || '{}'); } catch (_) {}
  if (!user || !user.role) window.location.href = './login.html';
}

export function bindLogout(button) {
  if (!button) return;
  button.addEventListener('click', () => {
    ['v43_mobile_token','v43_mobile_refresh_token','v43_mobile_user','mk_web_token','mk_web_refresh_token','mk_web_user'].forEach((key) => localStorage.removeItem(key));
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } }).catch(() => {}).finally(() => { window.location.href = './login.html'; });
  });
}

export function debounce(fn, delay = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}


export function requireRole(allowedRoles = []) {
  const user = JSON.parse(localStorage.getItem('v43_mobile_user') || '{}');
  const role = user.role || '';
  if (role === 'admin' || allowedRoles.includes(role)) return true;
  alert('Tài khoản không có quyền vào màn hình này.');
  window.location.href = './login.html';
  return false;
}
