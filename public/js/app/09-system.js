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

    if (systemMongoState) systemMongoState.textContent = json.mongoState || (json.mongoReadyState === 1 ? 'connected' : 'unknown');
    if (systemResetState) systemResetState.textContent = json.resetEnabled ? 'Đang bật' : 'Đang khóa';
    if (systemDataSource) systemDataSource.textContent = json.primaryDataSource || 'mongodb';

    // Không tự tải số lượng collection ở API status.
    // Muốn xem số lượng dữ liệu thì bấm nút “Tải số lượng dữ liệu”.
    setSystemMessage(json.resetEnabled ? 'Hệ thống sẵn sàng. Vẫn nên backup trước khi reset.' : 'Reset đang bị khóa. Muốn reset, bật ALLOW_SYSTEM_RESET=true trên server rồi deploy lại.', json.resetEnabled ? 'success' : '');
  } catch (err) {
    setSystemMessage(err.message || 'Không tải được trạng thái hệ thống', 'error');
  }
}

async function loadSystemDataSource() {
  try {
    if (systemCountsTable) systemCountsTable.innerHTML = '<tr><td colspan="2">Đang tải số lượng dữ liệu...</td></tr>';
    const res = await fetch('/api/system/data-source');
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tải được số lượng dữ liệu');

    if (systemMongoState) systemMongoState.textContent = json.mongoState || (json.mongoReadyState === 1 ? 'connected' : 'unknown');
    if (systemDataSource) systemDataSource.textContent = json.primaryDataSource || 'mongodb';
    renderSystemCounts(json.mongoCounts || {});
    setSystemMessage('Đã tải số lượng dữ liệu hiện tại.', 'success');
  } catch (err) {
    if (systemCountsTable) systemCountsTable.innerHTML = `<tr><td colspan="2">${apiMonitorSafeText(err.message || 'Không tải được số lượng dữ liệu')}</td></tr>`;
    setSystemMessage(err.message || 'Không tải được số lượng dữ liệu', 'error');
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
    if (typeof loadSystemDataSource === 'function') await loadSystemDataSource();
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
    if (typeof loadSystemDataSource === 'function') await loadSystemDataSource();
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

function apiMonitorFormatMs(value) {
  return `${systemFormatNumber(Math.max(0, Math.round(Number(value) || 0)))}ms`;
}

function apiMonitorSafeText(value) {
  if (typeof escapeHtml === 'function') return escapeHtml(value == null ? '' : String(value));
  return String(value == null ? '' : value).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] || c));
}


function apiMonitorSlowestQueryText(row = {}) {
  const traces = Array.isArray(row.maxQueryTraces) && row.maxQueryTraces.length
    ? row.maxQueryTraces
    : (Array.isArray(row.lastQueryTraces) ? row.lastQueryTraces : []);
  const trace = traces.slice().sort((a, b) => Number(b.ms || 0) - Number(a.ms || 0))[0] || null;
  const label = row.slowestQueryLabel || trace?.label || '';
  const ms = Number(row.slowestQueryMs || trace?.ms || 0);
  if (!label && !ms) return '';
  return `${apiMonitorSafeText(label)}${ms ? ` (${apiMonitorFormatMs(ms)})` : ''}`;
}

function apiMonitorTraceRowsText(row = {}) {
  const traces = Array.isArray(row.maxQueryTraces) && row.maxQueryTraces.length
    ? row.maxQueryTraces
    : (Array.isArray(row.lastQueryTraces) ? row.lastQueryTraces : []);
  const trace = traces.slice().sort((a, b) => Number(b.ms || 0) - Number(a.ms || 0))[0] || null;
  return systemFormatNumber(trace?.rows || 0);
}


function renderApiMonitorTopSlowRows(rows = []) {
  if (!apiTopSlowTable) return;
  apiTopSlowTable.innerHTML = rows.length ? rows.map(row => `
    <tr class="${Number(row.maxMs || 0) >= 5000 ? 'row-danger' : ''}">
      <td>${apiMonitorSafeText(row.module || '')}</td>
      <td><code title="${apiMonitorSafeText(row.maxOriginalUrl || row.lastOriginalUrl || row.route || '')}">${apiMonitorSafeText(row.route || '')}</code></td>
      <td><strong>${apiMonitorFormatMs(row.maxMs || 0)}</strong></td>
      <td>${apiMonitorFormatMs(row.avgMs || 0)}</td>
      <td>${apiMonitorFormatMs(row.avgMongoMs || 0)}</td>
      <td>${apiMonitorFormatMs(row.avgJsMs || 0)}</td>
      <td><code title="${apiMonitorSafeText(row.slowestQueryLabel || '')}">${apiMonitorSlowestQueryText(row)}</code></td>
      <td>${systemFormatNumber(row.count || 0)}</td>
      <td>${systemFormatNumber(row.slowCount || 0)}</td>
      <td>${systemApiMonitorBadge(row.maxMs, row.lastStatus)}</td>
    </tr>
  `).join('') : '<tr><td colspan="10">Chưa có dữ liệu API chậm nhất.</td></tr>';
}

function renderApiMonitorTopCalledRows(rows = []) {
  if (!apiTopCalledTable) return;
  apiTopCalledTable.innerHTML = rows.length ? rows.map(row => `
    <tr class="${Number(row.count || 0) >= 300 ? 'row-danger' : ''}">
      <td>${apiMonitorSafeText(row.module || '')}</td>
      <td><code title="${apiMonitorSafeText(row.lastOriginalUrl || row.route || '')}">${apiMonitorSafeText(row.route || '')}</code></td>
      <td><strong>${systemFormatNumber(row.count || 0)}</strong></td>
      <td>${apiMonitorFormatMs(row.avgMs || 0)}</td>
      <td>${apiMonitorFormatMs(row.avgMongoMs || 0)}</td>
      <td>${apiMonitorFormatMs(row.avgJsMs || 0)}</td>
      <td>${systemFormatNumber(row.avgDbQueries || 0)}</td>
      <td>${apiMonitorFormatMs(row.maxMs || 0)}</td>
      <td>${systemApiMonitorBadge(row.maxMs, row.lastStatus)}</td>
    </tr>
  `).join('') : '<tr><td colspan="9">Chưa có dữ liệu API gọi nhiều nhất.</td></tr>';
}

function renderApiMonitorTopRowsRows(rows = []) {
  if (!apiTopRowsTable) return;
  apiTopRowsTable.innerHTML = rows.length ? rows.map(row => `
    <tr class="${Number(row.maxRows || 0) >= 1000 ? 'row-danger' : ''}">
      <td>${apiMonitorSafeText(row.module || '')}</td>
      <td><code title="${apiMonitorSafeText(row.lastOriginalUrl || row.route || '')}">${apiMonitorSafeText(row.route || '')}</code></td>
      <td><strong>${systemFormatNumber(row.maxRows || 0)}</strong></td>
      <td>${systemFormatNumber(row.avgRows || 0)}</td>
      <td>${systemFormatNumber(row.lastRows || 0)}</td>
      <td>${systemFormatNumber(row.count || 0)}</td>
      <td>${apiMonitorFormatMs(row.avgMs || 0)}</td>
      <td>${apiMonitorFormatMs(row.avgMongoMs || 0)}</td>
      <td>${systemApiMonitorBadge(row.maxMs, row.lastStatus)}</td>
    </tr>
  `).join('') : '<tr><td colspan="9">Chưa có dữ liệu API nhiều rows nhất.</td></tr>';
}


function renderApiMonitorTopQueryTraceRows(rows = []) {
  if (typeof apiTopQueryTraceTable === 'undefined' || !apiTopQueryTraceTable) return;
  const filtered = rows.filter(row => Number(row.slowestQueryMs || 0) > 0 || (Array.isArray(row.maxQueryTraces) && row.maxQueryTraces.length));
  apiTopQueryTraceTable.innerHTML = filtered.length ? filtered.map(row => `
    <tr class="${Number(row.slowestQueryMs || 0) >= 1000 ? 'row-danger' : ''}">
      <td>${apiMonitorSafeText(row.module || '')}</td>
      <td><code title="${apiMonitorSafeText(row.maxOriginalUrl || row.lastOriginalUrl || row.route || '')}">${apiMonitorSafeText(row.route || '')}</code></td>
      <td><code title="${apiMonitorSafeText(row.slowestQueryLabel || '')}">${apiMonitorSlowestQueryText(row)}</code></td>
      <td><strong>${apiMonitorFormatMs(row.slowestQueryMs || 0)}</strong></td>
      <td>${apiMonitorTraceRowsText(row)}</td>
      <td>${apiMonitorFormatMs(row.maxMongoMs || 0)}</td>
      <td>${apiMonitorFormatMs(row.maxMs || 0)}</td>
      <td>${systemFormatNumber(row.lastDbQueries || 0)}</td>
      <td>${systemApiMonitorBadge(row.maxMs, row.lastStatus)}</td>
    </tr>
  `).join('') : '<tr><td colspan="9">Chưa có Query Trace. Hãy thao tác API rồi bấm tải lại.</td></tr>';
}

function setupApiMonitorTabs() {
  if (!apiMonitorTabButtons || !apiMonitorTabButtons.length) return;
  apiMonitorTabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.apiMonitorTab || 'all';
      apiMonitorTabButtons.forEach(btn => btn.classList.toggle('active', btn === button));
      apiMonitorTabPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.apiMonitorPanel === tab));
    });
  });
}

function renderApiMonitor(json = {}) {
  const summary = json.summary || {};
  if (apiMonitorTotalRoutes) apiMonitorTotalRoutes.textContent = systemFormatNumber(summary.totalRoutes || 0);
  if (apiMonitorTotalCalls) apiMonitorTotalCalls.textContent = systemFormatNumber(summary.totalCalls || 0);
  if (apiMonitorSlowRoutes) apiMonitorSlowRoutes.textContent = systemFormatNumber(summary.slowRoutes || 0);
  if (apiMonitorSlowCalls) apiMonitorSlowCalls.textContent = systemFormatNumber(summary.slowCalls || 0);
  if (apiMonitorErrorCalls) apiMonitorErrorCalls.textContent = systemFormatNumber(summary.errorCalls || 0);
  if (typeof apiMonitorTotalMongoMs !== 'undefined' && apiMonitorTotalMongoMs) apiMonitorTotalMongoMs.textContent = apiMonitorFormatMs(summary.totalMongoMs || 0);
  if (typeof apiMonitorTotalJsMs !== 'undefined' && apiMonitorTotalJsMs) apiMonitorTotalJsMs.textContent = apiMonitorFormatMs(summary.totalJsMs || 0);
  if (typeof apiMonitorTotalDbQueries !== 'undefined' && apiMonitorTotalDbQueries) apiMonitorTotalDbQueries.textContent = systemFormatNumber(summary.totalDbQueries || 0);

  const slowApis = Array.isArray(json.slowApis) ? json.slowApis : [];
  if (apiSlowTable) {
    apiSlowTable.innerHTML = slowApis.length ? slowApis.slice(0, 30).map(item => `
      <tr class="${Number(item.ms || 0) >= 1000 || Number(item.statusCode || 0) >= 500 ? 'row-danger' : ''}">
        <td>${apiMonitorSafeText(systemFormatTime(item.at))}</td>
        <td>${apiMonitorSafeText(item.module || '')}</td>
        <td><code>${apiMonitorSafeText(item.method || '')} ${apiMonitorSafeText(item.originalUrl || item.path || '')}</code></td>
        <td><strong>${apiMonitorFormatMs(item.ms || 0)}</strong></td>
        <td>${apiMonitorFormatMs(item.mongoMs || 0)}</td>
        <td>${apiMonitorFormatMs(item.jsMs || 0)}</td>
        <td>${systemFormatNumber(item.dbQueries || 0)}</td>
        <td><code title="${apiMonitorSafeText((item.queryTraces && item.queryTraces[0] && item.queryTraces[0].label) || '')}">${apiMonitorSafeText((item.queryTraces && item.queryTraces[0] && item.queryTraces[0].label) || '')} ${item.queryTraces && item.queryTraces[0] ? '(' + apiMonitorFormatMs(item.queryTraces[0].ms || 0) + ')' : ''}</code></td>
        <td>${systemFormatNumber(item.rows || 0)}</td>
        <td>${apiMonitorSafeText(item.statusCode || '')}</td>
      </tr>
    `).join('') : '<tr><td colspan="10">Chưa có API chậm. Hãy thao tác các màn để phần mềm ghi nhận.</td></tr>';
  }

  renderApiMonitorTopSlowRows(Array.isArray(json.topSlowestApis) ? json.topSlowestApis : []);
  renderApiMonitorTopCalledRows(Array.isArray(json.topCalledApis) ? json.topCalledApis : []);
  renderApiMonitorTopRowsRows(Array.isArray(json.topRowsApis) ? json.topRowsApis : []);
  renderApiMonitorTopQueryTraceRows(Array.isArray(json.topQueryTraceApis) ? json.topQueryTraceApis : []);

  const rows = Array.isArray(json.data) ? json.data : [];
  if (apiMonitorTable) {
    apiMonitorTable.innerHTML = rows.length ? rows.map(row => `
      <tr class="${row.status === 'slow' ? 'row-danger' : ''}">
        <td>${apiMonitorSafeText(row.module || '')}</td>
        <td><code title="${apiMonitorSafeText(row.lastOriginalUrl || row.route || '')}">${apiMonitorSafeText(row.route || '')}</code></td>
        <td>${systemFormatNumber(row.count || 0)}</td>
        <td>${apiMonitorFormatMs(row.avgMs || 0)}</td>
        <td>${apiMonitorFormatMs(row.avgMongoMs || 0)}</td>
        <td>${apiMonitorFormatMs(row.avgJsMs || 0)}</td>
        <td>${systemFormatNumber(row.avgDbQueries || 0)}</td>
        <td><strong>${apiMonitorFormatMs(row.maxMs || 0)}</strong></td>
        <td>${apiMonitorFormatMs(row.maxMongoMs || 0)}</td>
        <td><code title="${apiMonitorSafeText(row.slowestQueryLabel || '')}">${apiMonitorSlowestQueryText(row)}</code></td>
        <td>${systemFormatNumber(row.lastRows || 0)}</td>
        <td>${systemFormatNumber(row.slowCount || 0)}</td>
        <td>${systemApiMonitorBadge(row.maxMs, row.lastStatus)}</td>
      </tr>
    `).join('') : '<tr><td colspan="13">Chưa có dữ liệu API Monitor. Hãy thao tác các màn rồi bấm tải lại.</td></tr>';
  }
}

async function loadApiMonitor() {
  if (!apiMonitorTable && !apiSlowTable) return;
  try {
    const slowOnly = apiMonitorFilter && apiMonitorFilter.value === 'slow' ? '1' : '0';
    if (apiMonitorTable) apiMonitorTable.innerHTML = '<tr><td colspan="13">Đang tải API Monitor...</td></tr>';
    const res = await fetch(`/api/system/api-monitor?limit=200&slowOnly=${slowOnly}`);
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tải được API Monitor');
    renderApiMonitor(json);
  } catch (err) {
    if (apiMonitorTable) apiMonitorTable.innerHTML = `<tr><td colspan="13">${apiMonitorSafeText(err.message || 'Không tải được API Monitor')}</td></tr>`;
  }
}

async function resetApiMonitorStats() {
  const ok = window.confirm('Xóa thống kê API Monitor hiện tại? Dữ liệu sẽ được đo lại từ đầu.');
  if (!ok) return;
  try {
    const res = await fetch('/api/system/api-monitor/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không xóa được API Monitor');
    renderApiMonitor({ summary: {}, data: [], topSlowestApis: [], topCalledApis: [], topRowsApis: [], topQueryTraceApis: [], slowApis: [] });
    setSystemMessage('Đã xóa thống kê API Monitor. Hãy thao tác lại các màn để đo mới.', 'success');
  } catch (err) {
    setSystemMessage(err.message || 'Không xóa được API Monitor', 'error');
  }
}
