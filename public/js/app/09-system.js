'use strict';

function systemFormatNumber(value) {
  if (typeof formatNumber === 'function') return formatNumber(value);
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString('vi-VN') : '0';
}

function setSystemMessage(text, type = '') {
  if (!systemMessage) return;
  systemMessage.textContent = text || '';
  systemMessage.className = `message ${type || ''}`.trim();
}

function renderSystemCounts(counts = {}) {
  if (!systemCountsTable) return;
  const entries = Object.entries(counts || {}).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    systemCountsTable.innerHTML = '<tr><td colspan="2">Không có dữ liệu đếm collection.</td></tr>';
    return;
  }
  systemCountsTable.innerHTML = entries.map(([key, count]) => `
    <tr>
      <td>${escapeHtml(key)}</td>
      <td><strong>${systemFormatNumber(count || 0)}</strong></td>
    </tr>
  `).join('');
}

async function loadSystemStatus() {
  try {
    setSystemMessage('Đang tải trạng thái hệ thống...');
    const res = await fetch('/api/system/status');
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tải được trạng thái hệ thống');
    const ds = json.dataSource || {};
    if (systemMongoState) systemMongoState.textContent = ds.mongoState || (ds.mongoReadyState === 1 ? 'connected' : 'unknown');
    if (systemResetState) systemResetState.textContent = json.resetEnabled ? 'Đang bật' : 'Đang khóa';
    if (systemDataSource) systemDataSource.textContent = ds.primaryDataSource || 'mongodb';
    renderSystemCounts(ds.mongoCounts || {});
    setSystemMessage(json.resetEnabled ? 'Hệ thống sẵn sàng. Vẫn nên backup trước khi reset.' : 'Reset đang bị khóa. Muốn reset, bật ALLOW_SYSTEM_RESET=true trên server rồi deploy lại.', json.resetEnabled ? 'success' : '');
  } catch (err) {
    setSystemMessage(err.message || 'Không tải được trạng thái hệ thống', 'error');
  }
}

async function createSystemBackup() {
  try {
    setSystemMessage('Đang tạo backup...');
    const res = await fetch('/api/system/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tạo được backup');
    const fileName = json.data?.fileName || json.backup?.fileName || 'backup json';
    setSystemMessage(`Đã tạo backup: ${fileName}`, 'success');
    await loadSystemStatus();
  } catch (err) {
    setSystemMessage(err.message || 'Không tạo được backup', 'error');
  }
}

async function resetSystemData() {
  const confirmCode = systemResetConfirm ? systemResetConfirm.value.trim() : '';
  const scope = systemResetScope ? systemResetScope.value : 'operational';
  if (confirmCode !== 'RESET_MONGO_DATA') {
    setSystemMessage('Vui lòng nhập đúng mã xác nhận: RESET_MONGO_DATA', 'error');
    return;
  }
  const scopeText = systemResetScope?.selectedOptions?.[0]?.textContent || scope;
  const ok = window.confirm(`Bạn chắc chắn muốn reset: ${scopeText}?\n\nHệ thống sẽ backup trước rồi mới xóa dữ liệu đã chọn.`);
  if (!ok) return;
  try {
    setSystemMessage('Đang backup và reset dữ liệu...');
    const res = await fetch('/api/system/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: confirmCode, scope })
    });
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không reset được dữ liệu');
    if (systemResetConfirm) systemResetConfirm.value = '';
    setSystemMessage(`Đã reset xong (${json.scope || scope}). Đã backup trước khi reset.`, 'success');
    await loadSystemStatus();
    if (typeof loadProducts === 'function') loadProducts();
    if (typeof loadCustomers === 'function') loadCustomers();
    if (typeof loadStock === 'function') loadStock();
    if (typeof loadSalesOrders === 'function') loadSalesOrders();
    if (typeof loadDebts === 'function') loadDebts();
  } catch (err) {
    setSystemMessage(err.message || 'Không reset được dữ liệu', 'error');
  }
}
