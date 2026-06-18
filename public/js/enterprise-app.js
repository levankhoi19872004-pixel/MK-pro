const $ = (selector) => document.querySelector(selector);
const text = (value) => String(value ?? '');

const moduleDefinitions = {
  purchase: {
    feature: 'purchasing',
    endpoint: '/api/purchase/orders?limit=20',
    columns: [['code', 'Mã đơn'], ['supplierName', 'Nhà cung cấp'], ['status', 'Trạng thái'], ['totalAmount', 'Giá trị'], ['orderDate', 'Ngày']]
  },
  warehouse: {
    feature: 'warehouseAdvanced',
    endpoint: '/api/warehouse-advanced/reservations?limit=20',
    columns: [['code', 'Mã giữ tồn'], ['referenceCode', 'Chứng từ'], ['status', 'Trạng thái'], ['warehouseCode', 'Kho'], ['createdAt', 'Tạo lúc']]
  },
  analytics: {
    feature: 'analyticsProjections',
    endpoint: '/api/analytics/projections?limit=20',
    columns: [['projectionType', 'Loại'], ['date', 'Ngày'], ['dimensionKey', 'Chiều dữ liệu'], ['metrics', 'Chỉ số'], ['generatedAt', 'Cập nhật']]
  },
  field: {
    feature: 'fieldOperations',
    endpoint: '/api/field-operations/plans?limit=20',
    columns: [['code', 'Mã kế hoạch'], ['salesStaffName', 'NVBH'], ['planDate', 'Ngày'], ['status', 'Trạng thái'], ['stops', 'Điểm ghé']]
  },
  delivery: {
    feature: 'deliveryPlanning',
    endpoint: '/api/delivery-planning/plans?limit=20',
    columns: [['code', 'Mã tuyến'], ['deliveryStaffName', 'NVGH'], ['deliveryDate', 'Ngày'], ['status', 'Trạng thái'], ['summary', 'Tổng hợp']]
  },
  integrations: {
    feature: 'integrations',
    endpoint: '/api/integrations/jobs?limit=20',
    columns: [['provider', 'Nhà cung cấp'], ['eventType', 'Sự kiện'], ['status', 'Trạng thái'], ['attemptCount', 'Lần thử'], ['createdAt', 'Tạo lúc']]
  }
};

let enterpriseStatus = null;
let activeModule = 'purchase';

function setMessage(message = '', type = '') {
  const node = $('#enterpriseMessage');
  node.textContent = message;
  node.className = `message ${type}`.trim();
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function renderFeatureFlags(features = {}) {
  const grid = $('#featureGrid');
  grid.replaceChildren();
  Object.entries(features).forEach(([name, enabled]) => {
    const item = document.createElement('div');
    item.className = 'feature-item';
    const label = document.createElement('span');
    label.textContent = name;
    const badge = document.createElement('strong');
    badge.className = `badge ${enabled ? 'ok' : 'off'}`;
    badge.textContent = enabled ? 'Đang bật' : 'Đang tắt';
    item.append(label, badge);
    grid.append(item);
  });
}

function renderStats(selector, values = {}) {
  const root = $(selector);
  root.replaceChildren();
  const entries = Object.entries(values);
  (entries.length ? entries : [['empty', 0]]).forEach(([key, value]) => {
    const item = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = key;
    dd.textContent = Number(value || 0).toLocaleString('vi-VN');
    item.append(dt, dd);
    root.append(item);
  });
}

function renderChecks(checks = {}) {
  const root = $('#readinessChecks');
  root.replaceChildren();
  Object.entries(checks).forEach(([name, passed]) => {
    const item = document.createElement('div');
    item.className = 'check-item';
    const label = document.createElement('span');
    label.textContent = name;
    const badge = document.createElement('strong');
    badge.className = `badge ${passed ? 'ok' : 'fail'}`;
    badge.textContent = passed ? 'Đạt' : 'Không đạt';
    item.append(label, badge);
    root.append(item);
  });
}

function normalizeRows(payload) {
  const candidates = [payload.rows, payload.items, payload.orders, payload.plans, payload.jobs, payload.data, payload.result];
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.rows)) return value.rows;
  }
  return [];
}

function formatCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return value.toLocaleString('vi-VN');
  if (Array.isArray(value)) return `${value.length.toLocaleString('vi-VN')} mục`;
  if (typeof value === 'object') {
    const serialized = JSON.stringify(value);
    return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized;
  }
  return text(value);
}

function renderModuleTable(definition, rows = [], disabledMessage = '') {
  const head = $('#moduleTableHead');
  const body = $('#moduleTableBody');
  head.replaceChildren();
  body.replaceChildren();

  definition.columns.forEach(([, label]) => {
    const th = document.createElement('th');
    th.textContent = label;
    head.append(th);
  });

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = definition.columns.length;
    td.textContent = disabledMessage || 'Chưa có dữ liệu.';
    tr.append(td);
    body.append(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    definition.columns.forEach(([key]) => {
      const td = document.createElement('td');
      td.textContent = formatCell(row[key]);
      tr.append(td);
    });
    body.append(tr);
  });
}

async function loadModule(name = activeModule) {
  activeModule = name;
  const definition = moduleDefinitions[name];
  if (!definition) return;
  document.querySelectorAll('[data-module]').forEach((button) => button.classList.toggle('active', button.dataset.module === name));

  const enabled = Boolean(enterpriseStatus?.features?.[definition.feature]);
  if (!enabled) {
    renderModuleTable(definition, [], `Module đang tắt. Bật feature flag ${definition.feature} theo checklist triển khai.`);
    return;
  }

  renderModuleTable(definition, [], 'Đang tải...');
  try {
    const payload = await api(definition.endpoint);
    renderModuleTable(definition, normalizeRows(payload));
  } catch (error) {
    renderModuleTable(definition, [], `Không tải được dữ liệu: ${error.message}`);
  }
}

async function loadStatus() {
  setMessage('Đang tải trạng thái hệ thống...');
  const [statusPayload, readinessPayload] = await Promise.all([
    api('/api/enterprise/status'),
    api('/api/enterprise/readiness').catch((error) => error.payload || { ok: false, checks: {}, message: error.message })
  ]);
  enterpriseStatus = statusPayload;
  const databaseConnected = Boolean(statusPayload.database?.connected);
  $('#databaseState').textContent = databaseConnected ? 'Đã kết nối' : 'Mất kết nối';
  $('#databaseState').className = databaseConnected ? 'status-ok' : 'status-fail';
  $('#readinessState').textContent = readinessPayload.ok ? 'Sẵn sàng' : 'Cần kiểm tra';
  $('#outboxPending').textContent = Number(statusPayload.outbox?.pending || 0).toLocaleString('vi-VN');
  $('#integrationFailed').textContent = Number(statusPayload.integrations?.failed || 0).toLocaleString('vi-VN');
  renderFeatureFlags(statusPayload.features || {});
  renderStats('#outboxStats', statusPayload.outbox || {});
  renderStats('#integrationStats', statusPayload.integrations || {});
  renderChecks(readinessPayload.checks || {});
  await loadModule(activeModule);
  setMessage(`Đã cập nhật trạng thái tenant ${statusPayload.tenantId || 'default'}.`, 'success');
}

async function postAction(url, body, successMessage) {
  setMessage('Đang xử lý...');
  const result = await api(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  setMessage(successMessage, 'success');
  await loadStatus();
  return result;
}

$('#refreshEnterpriseButton').addEventListener('click', () => loadStatus().catch((error) => setMessage(error.message, 'error')));
$('#drainOutboxButton').addEventListener('click', () => postAction('/api/enterprise/outbox/drain', { limit: 100 }, 'Đã xử lý outbox.').catch((error) => setMessage(error.message, 'error')));
$('#drainIntegrationButton').addEventListener('click', () => postAction('/api/enterprise/integrations/drain', { limit: 20 }, 'Đã xử lý integration queue.').catch((error) => setMessage(error.message, 'error')));
$('#rebuildAnalyticsButton').addEventListener('click', () => postAction('/api/analytics/projections/rebuild', {}, 'Đã rebuild projection báo cáo.').catch((error) => setMessage(error.message, 'error')));
document.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => loadModule(button.dataset.module)));

Promise.resolve(window.__authReady)
  .then(loadStatus)
  .catch((error) => setMessage(error.message || 'Không tải được trung tâm mở rộng.', 'error'));
