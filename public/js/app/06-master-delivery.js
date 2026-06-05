'use strict';

// V45/V46 compatibility layer:
// - Khôi phục các hàm Đơn tổng cũ để app.js không bị chết giữa chừng.
// - Giữ các stub giao hàng mới phía dưới để không phá lõi delivery canonical.

const MASTER_ORDER_PAGE_LIMIT = 200;
let selectedMasterOrderIds = window.__selectedMasterOrderIds || new Set();
window.__selectedMasterOrderIds = selectedMasterOrderIds;

function masterOrderIdentity(row = {}) {
  return String(row.id || row._id || row.code || row.orderCode || row.documentCode || '').trim();
}

function salesOrderIdentity(row = {}) {
  return String(row.id || row._id || row.code || row.orderCode || row.salesOrderCode || row.documentCode || '').trim();
}

function masterOrderMoney(value) {
  if (typeof money === 'function') return money(value);
  return Number(value || 0).toLocaleString('vi-VN');
}

function masterOrderDate(value) {
  if (typeof formatDateVN === 'function') return formatDateVN(value);
  return String(value || '').slice(0, 10);
}

function masterOrderSetMessage(text, isError) {
  if (typeof showMessage === 'function') return showMessage(masterOrderMessage, text, !!isError);
  if (masterOrderMessage) {
    masterOrderMessage.textContent = text || '';
    masterOrderMessage.classList.toggle('error', !!isError);
  }
}

function masterOrderChildAmount(row = {}) {
  return Number(row.totalAmount ?? row.amount ?? row.total ?? row.grandTotal ?? 0) || 0;
}

function masterOrderChildDebt(row = {}) {
  return Number(row.debtAmount ?? row.remainingDebt ?? row.receivableAmount ?? row.totalDebt ?? 0) || 0;
}

function updateSelectedChildOrderSummary() {
  const selected = (unmergedOrdersCache || []).filter((row) => selectedChildOrderIds.has(salesOrderIdentity(row)));
  const totalAmount = selected.reduce((sum, row) => sum + masterOrderChildAmount(row), 0);
  const totalDebt = selected.reduce((sum, row) => sum + masterOrderChildDebt(row), 0);
  if (selectedChildOrderCount) selectedChildOrderCount.textContent = String(selected.length);
  if (selectedChildOrderAmount) selectedChildOrderAmount.textContent = masterOrderMoney(totalAmount);
  if (selectedChildOrderDebt) selectedChildOrderDebt.textContent = masterOrderMoney(totalDebt);
}

function renderUnmergedChildOrders() {
  if (!unmergedOrderList) return;
  const rows = Array.isArray(unmergedOrdersCache) ? unmergedOrdersCache : [];
  updateSelectedChildOrderSummary();
  if (unmergedOrderCount) unmergedOrderCount.textContent = `${rows.length} đơn con chưa gộp`;
  if (!rows.length) {
    unmergedOrderList.innerHTML = '<div class="empty-cell">Không có đơn con chưa gộp phù hợp.</div>';
    return;
  }
  unmergedOrderList.innerHTML = rows.map((order) => {
    const key = salesOrderIdentity(order);
    const checked = selectedChildOrderIds.has(key) ? 'checked' : '';
    const code = order.code || order.orderCode || order.salesOrderCode || key;
    const customer = order.customerName || order.customerCode || 'Khách hàng';
    const staff = order.salesStaffName || order.staffName || order.salesStaffCode || order.staffCode || '';
    const date = masterOrderDate(order.deliveryDate || order.date || order.orderDate || order.createdAt);
    return `<label class="order-row compact-order-row master-child-row">
      <input type="checkbox" class="child-order-check" data-id="${key}" ${checked} />
      <span><strong>${code}</strong><small>${customer}</small></span>
      <span>${staff}</span>
      <span>${date}</span>
      <span>${masterOrderMoney(masterOrderChildAmount(order))}</span>
    </label>`;
  }).join('');
}
window.renderUnmergedChildOrders = renderUnmergedChildOrders;

async function loadUnmergedChildOrders() {
  if (!unmergedOrderList) return;
  try {
    unmergedOrderList.innerHTML = '<div class="empty-cell">Đang tải đơn con chưa gộp...</div>';
    const params = new URLSearchParams();
    const q = unmergedOrderSearch ? unmergedOrderSearch.value.trim() : '';
    const source = unmergedSourceFilter ? unmergedSourceFilter.value.trim() : '';
    const dateFrom = unmergedDateFrom ? unmergedDateFrom.value : '';
    const dateTo = unmergedDateTo ? unmergedDateTo.value : '';
    const salesStaff = unmergedSalesStaffFilter ? unmergedSalesStaffFilter.value.trim() : '';
    if (q) params.set('q', q);
    if (source) params.set('source', source);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (salesStaff) params.set('salesStaff', salesStaff);
    params.set('limit', '5000');
    const res = await (window.fetchWithTimeout || fetch)(`/api/master-orders/unmerged-child-orders?${params.toString()}`, {}, 15000);
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tải được đơn con chưa gộp');
    const rows = json.orders || json.rows || json.data || [];
    unmergedOrdersCache = Array.isArray(rows) ? rows : [];
    selectedChildOrderIds = new Set([...selectedChildOrderIds].filter((id) => unmergedOrdersCache.some((row) => salesOrderIdentity(row) === id)));
    window.selectedChildOrderIds = selectedChildOrderIds;
    renderUnmergedChildOrders();
  } catch (err) {
    if (unmergedOrderCount) unmergedOrderCount.textContent = 'Lỗi tải đơn con';
    if (unmergedOrderList) unmergedOrderList.innerHTML = `<div class="empty-cell error">${err.message || 'Không tải được đơn con chưa gộp'}</div>`;
  }
}
window.loadUnmergedChildOrders = loadUnmergedChildOrders;

function toggleSelectAllUnmergedOrders() {
  const rows = Array.isArray(unmergedOrdersCache) ? unmergedOrdersCache : [];
  const allSelected = rows.length && rows.every((row) => selectedChildOrderIds.has(salesOrderIdentity(row)));
  if (allSelected) selectedChildOrderIds.clear();
  else rows.forEach((row) => selectedChildOrderIds.add(salesOrderIdentity(row)));
  renderUnmergedChildOrders();
}
window.toggleSelectAllUnmergedOrders = toggleSelectAllUnmergedOrders;

function renderMasterOrders() {
  if (!masterOrderList) return;
  const rows = Array.isArray(masterOrdersCache) ? masterOrdersCache : [];
  if (masterOrderCount) masterOrderCount.textContent = `${rows.length} đơn tổng`;
  if (!rows.length) {
    masterOrderList.innerHTML = '<div class="empty-cell">Không có đơn tổng phù hợp.</div>';
    return;
  }
  masterOrderList.innerHTML = rows.map((order) => {
    const key = masterOrderIdentity(order);
    const checked = selectedMasterOrderIds.has(key) ? 'checked' : '';
    const code = order.code || order.id || key;
    const delivery = order.deliveryStaffName || order.deliveryStaffCode || '';
    const route = order.routeName || order.deliveryRoute || '';
    const childCount = Number(order.childOrderCount || order.orderCount || (order.childOrderIds || []).length || (order.children || []).length || 0);
    const total = Number(order.totalAmount ?? order.amount ?? order.grandTotal ?? 0) || 0;
    return `<div class="order-row compact-order-row master-order-row">
      <label><input type="checkbox" class="master-order-check" data-id="${key}" ${checked} /></label>
      <span><strong>${code}</strong><small>${route}</small></span>
      <span>${delivery}</span>
      <span>${masterOrderDate(order.deliveryDate || order.date || order.createdAt)}</span>
      <span>${childCount} đơn</span>
      <span>${masterOrderMoney(total)}</span>
      <span class="button-row"><button type="button" class="secondary small print-one-master-order" data-id="${key}">In</button></span>
    </div>`;
  }).join('');
}

async function loadMasterOrders() {
  if (!masterOrderList) return;
  try {
    masterOrderList.innerHTML = '<div class="empty-cell">Đang tải đơn tổng...</div>';
    const params = new URLSearchParams();
    const q = masterOrderSearch ? masterOrderSearch.value.trim() : '';
    const dateFrom = masterOrderDateFrom ? masterOrderDateFrom.value : '';
    const dateTo = masterOrderDateTo ? masterOrderDateTo.value : '';
    if (q) params.set('q', q);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('excludeInactive', '1');
    params.set('limit', String(MASTER_ORDER_PAGE_LIMIT));
    const res = await (window.fetchWithTimeout || fetch)(`/api/master-orders?${params.toString()}`, {}, 15000);
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tải được đơn tổng');
    const rows = json.masterOrders || json.orders || json.rows || json.data || [];
    masterOrdersCache = Array.isArray(rows) ? rows : [];
    selectedMasterOrderIds = new Set([...selectedMasterOrderIds].filter((id) => masterOrdersCache.some((row) => masterOrderIdentity(row) === id)));
    window.__selectedMasterOrderIds = selectedMasterOrderIds;
    renderMasterOrders();
  } catch (err) {
    if (masterOrderCount) masterOrderCount.textContent = 'Lỗi tải đơn tổng';
    if (masterOrderList) masterOrderList.innerHTML = `<div class="empty-cell error">${err.message || 'Không tải được đơn tổng'}</div>`;
  }
}
window.loadMasterOrders = loadMasterOrders;

async function loadMasterOrderModule() {
  await Promise.allSettled([loadUnmergedChildOrders(), loadMasterOrders()]);
}
window.loadMasterOrderModule = loadMasterOrderModule;

async function submitMasterOrder(event) {
  if (event && event.preventDefault) event.preventDefault();
  try {
    const childOrderIds = [...selectedChildOrderIds].filter(Boolean);
    if (!childOrderIds.length) throw new Error('Chưa chọn đơn con để gộp');
    const formData = masterOrderForm ? new FormData(masterOrderForm) : new FormData();
    const payload = Object.fromEntries(formData.entries());
    payload.childOrderIds = childOrderIds;
    payload.groupBySalesStaff = !!(masterOrderForm && masterOrderForm.elements.groupBySalesStaff && masterOrderForm.elements.groupBySalesStaff.checked);
    masterOrderSetMessage('Đang tạo đơn tổng...');
    const res = await (window.fetchWithTimeout || fetch)('/api/master-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 20000);
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tạo được đơn tổng');
    masterOrderSetMessage(json.message || 'Đã tạo đơn tổng');
    selectedChildOrderIds.clear();
    await loadMasterOrderModule();
  } catch (err) {
    masterOrderSetMessage(err.message || 'Không tạo được đơn tổng', true);
  }
}
window.submitMasterOrder = submitMasterOrder;

function toggleSelectAllMasterOrders() {
  const rows = Array.isArray(masterOrdersCache) ? masterOrdersCache : [];
  const allSelected = rows.length && rows.every((row) => selectedMasterOrderIds.has(masterOrderIdentity(row)));
  if (allSelected) selectedMasterOrderIds.clear();
  else rows.forEach((row) => selectedMasterOrderIds.add(masterOrderIdentity(row)));
  renderMasterOrders();
}
window.toggleSelectAllMasterOrders = toggleSelectAllMasterOrders;

function printMasterOrderIds(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return alert('Chưa chọn đơn tổng để in');
  if (list.length === 1) return window.open(`/api/print/master-orders/${encodeURIComponent(list[0])}`, '_blank');
  fetch('/api/master-orders/print-aggregate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ masterOrderIds: list })
  })
    .then(async (res) => {
      const html = await res.text();
      if (!res.ok) throw new Error(html || 'Không in được đơn tổng');
      const w = window.open('', '_blank');
      if (!w) throw new Error('Trình duyệt đang chặn cửa sổ in. Hãy cho phép popup.');
      w.document.open();
      w.document.write(html);
      w.document.close();
    })
    .catch((err) => alert(err.message || 'Không in được đơn tổng'));
}

function printSelectedMasterOrders() {
  printMasterOrderIds([...selectedMasterOrderIds]);
}
window.printSelectedMasterOrders = printSelectedMasterOrders;

function exportSelectedMasterOrders() {
  const selected = (masterOrdersCache || []).filter((row) => selectedMasterOrderIds.has(masterOrderIdentity(row)));
  if (!selected.length) return alert('Chưa chọn đơn tổng để xuất Excel');
  if (typeof exportErpRows !== 'function') return alert('Chưa sẵn sàng module xuất Excel');
  exportErpRows('don-tong.csv', ['Mã đơn tổng', 'Ngày giao', 'Tuyến', 'NV giao', 'Số đơn con', 'Tổng tiền'], selected.map((row) => [
    row.code || row.id || '',
    masterOrderDate(row.deliveryDate || row.date || row.createdAt),
    row.routeName || row.deliveryRoute || '',
    row.deliveryStaffName || row.deliveryStaffCode || '',
    row.childOrderCount || row.orderCount || (row.childOrderIds || []).length || (row.children || []).length || 0,
    row.totalAmount || row.amount || row.grandTotal || 0
  ]));
}
window.exportSelectedMasterOrders = exportSelectedMasterOrders;

if (masterOrderList) {
  masterOrderList.addEventListener('change', (event) => {
    const check = event.target.closest('.master-order-check');
    if (!check) return;
    if (check.checked) selectedMasterOrderIds.add(check.dataset.id);
    else selectedMasterOrderIds.delete(check.dataset.id);
    window.__selectedMasterOrderIds = selectedMasterOrderIds;
  });
  masterOrderList.addEventListener('click', (event) => {
    const btn = event.target.closest('.print-one-master-order');
    if (!btn) return;
    printMasterOrderIds([btn.dataset.id]);
  });
}



// V45 canonical delivery finance display helpers.
// PT: phải thu, TM: tiền mặt, CK: chuyển khoản, TT: trả thưởng, TH: trả hàng, CN: công nợ còn lại.
function deliveryCompactMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num) >= 1000000) return `${Math.round(num / 100000) / 10}tr`;
  if (Math.abs(num) >= 1000) return `${Math.round(num / 1000)}k`;
  return String(Math.round(num));
}
window.deliveryCompactMoney = window.deliveryCompactMoney || deliveryCompactMoney;

function deliveryDebtCompactLabel(value) {
  const num = Number(value || 0);
  if (Math.abs(num) <= 1000) return '0';
  return deliveryCompactMoney(num);
}
window.deliveryDebtCompactLabel = window.deliveryDebtCompactLabel || deliveryDebtCompactLabel;

function deliveryAmountMetricLine(row) {
  const amount = row && typeof row.deliveryAmount === 'object' ? row.deliveryAmount : row || {};
  const pt = Number(amount.totalReceivable ?? row?.totalReceivable ?? row?.receivableAmount ?? row?.totalAmount ?? 0) || 0;
  const tm = Number(amount.cashAmount ?? row?.cashAmount ?? row?.cashCollected ?? 0) || 0;
  const ck = Number(amount.bankAmount ?? row?.bankAmount ?? row?.bankCollected ?? row?.transferAmount ?? 0) || 0;
  const tt = Number(amount.bonusAmount ?? amount.rewardAmount ?? row?.bonusAmount ?? row?.rewardAmount ?? 0) || 0;
  const th = Number(amount.returnAmount ?? row?.returnAmount ?? row?.totalReturnAmount ?? 0) || 0;
  const cn = Number(amount.debtAmount ?? amount.remainingAmount ?? row?.debtAmount ?? row?.remainingAmount ?? Math.max(0, pt - tm - ck - tt - th)) || 0;
  const title = 'Trả hàng từ returnOrders';
  return `<div class="delivery-amount-metrics" title="${title}">
    <span>PT ${deliveryCompactMoney(pt)}</span>
    <span>TM ${deliveryCompactMoney(tm)}</span>
    <span>CK ${deliveryCompactMoney(ck)}</span>
    <span>TT ${deliveryCompactMoney(tt)}</span>
    <span>TH ${deliveryCompactMoney(th)}</span>
    <span>CN ${deliveryDebtCompactLabel(cn)}</span>
  </div>`;
}
window.deliveryAmountMetricLine = deliveryAmountMetricLine;

// V46 canonical delivery: old web delivery logic removed.
// Web UI now delegates to public/js/delivery/delivery-core.js + delivery-web-view.js.
window.loadDeliveryTodayOrders = function () { return window.DeliveryWebView && window.DeliveryWebView.load ? window.DeliveryWebView.load() : null; };
window.loadDeliveryToday = window.loadDeliveryTodayOrders;
window.submitDeliveryEdit = function (event) { if (event && event.preventDefault) event.preventDefault(); alert('Màn giao hàng đã chuyển sang lõi chung. Vui lòng dùng giao diện Đơn đi giao hôm nay mới.'); };
window.clearDeliveryEditPanel = function () {};
window.recalcDeliveryEditDebt = function () {};
window.renderDeliveryEditPanel = function () {};
window.selectDeliveryOrder = function (key) { return window.DeliveryWebView && window.DeliveryWebView.select ? window.DeliveryWebView.select(key) : null; };
