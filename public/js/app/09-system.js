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

function systemApiMonitorBadge(ms, status) {
  const n = Number(ms || 0);
  if (status && Number(status) >= 500) return '<span class="status-pill danger">Lỗi</span>';
  if (n >= 1000) return '<span class="status-pill danger">Chậm</span>';
  if (n >= 300) return '<span class="status-pill warn">Theo dõi</span>';
  return '<span class="status-pill ok">Tốt</span>';
}

function systemFormatTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('vi-VN');
  } catch (err) {
    return String(value || '');
  }
}

function apiMonitorSafeText(value) {
  if (typeof escapeHtml === 'function') return escapeHtml(value == null ? '' : String(value));
  return String(value == null ? '' : value).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c));
}

function renderApiMonitor(json = {}) {
  const summary = json.summary || {};
  if (apiMonitorTotalRoutes) apiMonitorTotalRoutes.textContent = systemFormatNumber(summary.totalRoutes || 0);
  if (apiMonitorTotalCalls) apiMonitorTotalCalls.textContent = systemFormatNumber(summary.totalCalls || 0);
  if (apiMonitorSlowRoutes) apiMonitorSlowRoutes.textContent = systemFormatNumber(summary.slowRoutes || 0);
  if (apiMonitorSlowCalls) apiMonitorSlowCalls.textContent = systemFormatNumber(summary.slowCalls || 0);
  if (apiMonitorErrorCalls) apiMonitorErrorCalls.textContent = systemFormatNumber(summary.errorCalls || 0);

  const slowApis = Array.isArray(json.slowApis) ? json.slowApis : [];
  if (apiSlowTable) {
    apiSlowTable.innerHTML = slowApis.length ? slowApis.slice(0, 30).map(item => `
      <tr class="${Number(item.ms || 0) >= 1000 || Number(item.statusCode || 0) >= 500 ? 'row-danger' : ''}">
        <td>${apiMonitorSafeText(systemFormatTime(item.at))}</td>
        <td>${apiMonitorSafeText(item.module || '')}</td>
        <td><code>${apiMonitorSafeText(item.method || '')} ${apiMonitorSafeText(item.originalUrl || item.path || '')}</code></td>
        <td><strong>${systemFormatNumber(item.ms || 0)}ms</strong></td>
        <td>${systemFormatNumber(item.rows || 0)}</td>
        <td>${apiMonitorSafeText(item.statusCode || '')}</td>
      </tr>
    `).join('') : '<tr><td colspan="6">Chưa có API chậm. Hãy thao tác các màn để phần mềm ghi nhận.</td></tr>';
  }

  const rows = Array.isArray(json.data) ? json.data : [];
  if (apiMonitorTable) {
    apiMonitorTable.innerHTML = rows.length ? rows.map(row => `
      <tr class="${row.status === 'slow' ? 'row-danger' : ''}">
        <td>${apiMonitorSafeText(row.module || '')}</td>
        <td><code title="${apiMonitorSafeText(row.lastOriginalUrl || row.route || '')}">${apiMonitorSafeText(row.route || '')}</code></td>
        <td>${systemFormatNumber(row.count || 0)}</td>
        <td>${systemFormatNumber(row.avgMs || 0)}ms</td>
        <td><strong>${systemFormatNumber(row.maxMs || 0)}ms</strong></td>
        <td>${systemFormatNumber(row.lastRows || 0)}</td>
        <td>${systemFormatNumber(row.slowCount || 0)}</td>
        <td>${systemApiMonitorBadge(row.maxMs, row.lastStatus)}</td>
      </tr>
    `).join('') : '<tr><td colspan="8">Chưa có dữ liệu API Monitor. Hãy thao tác các màn rồi bấm tải lại.</td></tr>';
  }
}

async function loadApiMonitor() {
  if (!apiMonitorTable && !apiSlowTable) return;
  try {
    const slowOnly = apiMonitorFilter && apiMonitorFilter.value === 'slow' ? '1' : '0';
    if (apiMonitorTable) apiMonitorTable.innerHTML = '<tr><td colspan="8">Đang tải API Monitor...</td></tr>';
    const res = await fetch(`/api/system/api-monitor?limit=200&slowOnly=${slowOnly}`);
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tải được API Monitor');
    renderApiMonitor(json);
  } catch (err) {
    if (apiMonitorTable) apiMonitorTable.innerHTML = `<tr><td colspan="8">${apiMonitorSafeText(err.message || 'Không tải được API Monitor')}</td></tr>`;
  }
}

async function resetApiMonitorStats() {
  const ok = window.confirm('Xóa thống kê API Monitor hiện tại? Dữ liệu sẽ được đo lại từ đầu.');
  if (!ok) return;
  try {
    const res = await fetch('/api/system/api-monitor/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không xóa được API Monitor');
    renderApiMonitor({ summary: {}, data: [], slowApis: [] });
    setSystemMessage('Đã xóa thống kê API Monitor. Hãy thao tác lại các màn để đo mới.', 'success');
  } catch (err) {
    setSystemMessage(err.message || 'Không xóa được API Monitor', 'error');
  }
}
