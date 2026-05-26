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
  if (!items || !items.length) return;

  items.slice(0, 10).forEach(item => {
    const div = document.createElement('button');
    div.type = 'button';
    div.className = 'suggestion-item';
    div.innerHTML = renderItem(item);
    div.addEventListener('click', () => onSelect(item));
    container.appendChild(div);
  });
}

export function requireLogin() {
  const token = localStorage.getItem('v43_mobile_token');
  if (!token) window.location.href = './login.html';
}

export function bindLogout(button) {
  if (!button) return;
  button.addEventListener('click', () => {
    localStorage.removeItem('v43_mobile_token');
    localStorage.removeItem('v43_mobile_user');
    window.location.href = './login.html';
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
