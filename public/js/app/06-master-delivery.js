'use strict';

// V45/V46 compatibility layer:
// - Khôi phục các hàm Đơn tổng cũ để app.js không bị chết giữa chừng.
// - Giữ các stub giao hàng mới phía dưới để không phá lõi delivery canonical.

const MASTER_ORDER_PAGE_LIMIT = 200;
let selectedMasterOrderIds = window.__selectedMasterOrderIds || new Set();
window.__selectedMasterOrderIds = selectedMasterOrderIds;

// MASTER_ORDER_EDIT_MODAL_PATCH_START: trạng thái sửa đơn tổng, chỉ dùng trong popup đơn tổng
let masterOrderEditMode = false;
let editingMasterOrderId = '';
// MASTER_ORDER_EDIT_MODAL_PATCH_END

// MASTER_ORDER_UNMERGED_REFRESH_FIX_START:
// Tách trạng thái tải danh sách đơn con để chặn response cũ ghi đè response mới
// khi người dùng đổi nhanh ngày, nguồn hoặc NVBH.
let unmergedOrderRequestSeq = 0;
let unmergedOrderReloadTimer = null;
const UNMERGED_ORDER_RELOAD_DEBOUNCE_MS = 350;
// MASTER_ORDER_UNMERGED_REFRESH_FIX_END

function masterOrderIdentity(row = {}) {
  return String(row.id || row._id || row.code || row.orderCode || row.documentCode || '').trim();
}

function salesOrderIdentity(row = {}) {
  return String(row.id || row._id || row.code || row.orderCode || row.salesOrderCode || row.documentCode || '').trim();
}

function masterOrderMoney(value) {
  const number = Number(value || 0);
  const rounded = Number.isFinite(number) ? Math.round(number) : 0;
  if (typeof money === 'function') return money(rounded);
  return rounded.toLocaleString('vi-VN');
}

function masterOrderDate(value) {
  if (typeof formatDateVN === 'function') return formatDateVN(value);
  return String(value || '').slice(0, 10);
}

// MASTER_ORDER_DEFAULT_DATE_PATCH_START:
// Ngày tạo luôn là hôm nay. Ngày giao mặc định là ngày kế tiếp;
// nếu tạo vào thứ 7 thì bỏ qua chủ nhật và chuyển sang thứ 2.
function masterOrderTodayDate() {
  if (typeof today === 'function') return today();
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function masterOrderDefaultDeliveryDate(baseDate) {
  const match = String(baseDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return '';
  const dayOfWeek = date.getUTCDay();
  const daysToAdd = dayOfWeek === 6 ? 2 : 1;
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function applyMasterOrderDefaultDates(options = {}) {
  if (!masterOrderForm) return;
  const creationInput = masterOrderForm.elements.masterOrderDate;
  const deliveryInput = masterOrderForm.elements.deliveryDate;
  const creationDate = masterOrderTodayDate();
  if (creationInput) creationInput.value = creationDate;
  if (deliveryInput && (options.forceDelivery || !deliveryInput.value)) {
    deliveryInput.value = masterOrderDefaultDeliveryDate(creationDate);
  }
}
window.masterOrderDefaultDeliveryDate = masterOrderDefaultDeliveryDate;
// MASTER_ORDER_DEFAULT_DATE_PATCH_END

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

// MASTER_ORDER_POPUP_PATCH_START: summary lấy từ layer 3, không lấy trực tiếp checkbox layer 2
function ensureMasterOrderEditState() {
  if (!(masterOrderChildRowsById instanceof Map)) masterOrderChildRowsById = new Map();
  if (!Array.isArray(unmergedOrderResultIds)) unmergedOrderResultIds = [];
  if (!(selectedGroupedChildOrderIds instanceof Set)) selectedGroupedChildOrderIds = new Set();
  if (!(selectedUnmergedChildOrderIds instanceof Set)) selectedUnmergedChildOrderIds = new Set();
  if (!(selectedGroupedChildOrderCheckIds instanceof Set)) selectedGroupedChildOrderCheckIds = new Set();
  if (!(explicitlyRemovedGroupedChildOrderIds instanceof Set)) explicitlyRemovedGroupedChildOrderIds = new Set();
  if (!(originalGroupedChildOrderIds instanceof Set)) originalGroupedChildOrderIds = new Set();
}

function upsertMasterOrderChildRows(rows = []) {
  ensureMasterOrderEditState();
  (Array.isArray(rows) ? rows : []).filter(Boolean).forEach((row) => {
    const key = salesOrderIdentity(row);
    if (key) masterOrderChildRowsById.set(key, row);
  });
  unmergedOrdersCache = Array.from(masterOrderChildRowsById.values());
  return masterOrderChildRowsById;
}

function getMasterOrderChildRow(id) {
  ensureMasterOrderEditState();
  return masterOrderChildRowsById.get(String(id || '').trim()) || null;
}

function missingMasterOrderChildRow(id) {
  const key = String(id || '').trim();
  return { id: key, code: key, orderCode: key, __missingGroupedRow: true };
}

function getGroupedWorkingRows() {
  ensureMasterOrderEditState();
  return [...selectedGroupedChildOrderIds]
    .filter(Boolean)
    .map((id) => getMasterOrderChildRow(id) || missingMasterOrderChildRow(id));
}

function getVisibleUnmergedCandidateRows() {
  ensureMasterOrderEditState();
  const ids = [];
  const seen = new Set();
  [...unmergedOrderResultIds, ...explicitlyRemovedGroupedChildOrderIds].forEach((id) => {
    const key = String(id || '').trim();
    if (!key || seen.has(key) || selectedGroupedChildOrderIds.has(key)) return;
    seen.add(key);
    ids.push(key);
  });
  return ids.map((id) => getMasterOrderChildRow(id)).filter(Boolean);
}

function replaceUnmergedCandidateResults(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  upsertMasterOrderChildRows(list);
  unmergedOrderResultIds = list.map(salesOrderIdentity).filter(Boolean);
  selectedUnmergedChildOrderIds = new Set([...selectedUnmergedChildOrderIds]
    .filter((id) => unmergedOrderResultIds.includes(id) && !selectedGroupedChildOrderIds.has(id)));
  selectedChildOrderIds = selectedUnmergedChildOrderIds;
  window.selectedChildOrderIds = selectedChildOrderIds;
  return unmergedOrderResultIds;
}

function initializeMasterOrderEditWorkingSet(children = []) {
  const list = Array.isArray(children) ? children : [];
  upsertMasterOrderChildRows(list);
  const ids = list.map(salesOrderIdentity).filter(Boolean);
  originalGroupedChildOrderIds = new Set(ids);
  selectedGroupedChildOrderIds = new Set(ids);
  explicitlyRemovedGroupedChildOrderIds = new Set();
  selectedGroupedChildOrderCheckIds = new Set();
  selectedUnmergedChildOrderIds.clear();
  selectedChildOrderIds = selectedUnmergedChildOrderIds;
  window.selectedChildOrderIds = selectedChildOrderIds;
  return selectedGroupedChildOrderIds;
}

function resetMasterOrderEditWorkingSet(options = {}) {
  ensureMasterOrderEditState();
  selectedUnmergedChildOrderIds.clear();
  selectedGroupedChildOrderIds.clear();
  selectedGroupedChildOrderCheckIds.clear();
  explicitlyRemovedGroupedChildOrderIds.clear();
  originalGroupedChildOrderIds.clear();
  if (options.clearCandidates) {
    unmergedOrderResultIds = [];
    unmergedOrdersCache = [];
    masterOrderChildRowsById.clear();
  }
  selectedChildOrderIds = selectedUnmergedChildOrderIds;
  window.selectedChildOrderIds = selectedChildOrderIds;
}

function getGroupedChildOrderIdsForSubmit() {
  ensureMasterOrderEditState();
  return [...selectedGroupedChildOrderIds].filter(Boolean);
}

window.MasterOrderEditWorkingSet = {
  upsertMasterOrderChildRows,
  getMasterOrderChildRow,
  getGroupedWorkingRows,
  getVisibleUnmergedCandidateRows,
  replaceUnmergedCandidateResults,
  initializeMasterOrderEditWorkingSet,
  resetMasterOrderEditWorkingSet,
  getGroupedChildOrderIdsForSubmit,
  snapshot: () => ({
    groupedChildOrderIds: [...selectedGroupedChildOrderIds],
    unmergedOrderResultIds: [...unmergedOrderResultIds],
    explicitlyRemovedChildOrderIds: [...explicitlyRemovedGroupedChildOrderIds],
    originalGroupedChildOrderIds: [...originalGroupedChildOrderIds],
    groupedRows: getGroupedWorkingRows(),
    visibleCandidateRows: getVisibleUnmergedCandidateRows()
  })
};

function masterOrderGroupedRows() {
  return getGroupedWorkingRows();
}

function syncVisibleGroupedChildOrderIds() {
  selectedGroupedChildOrderCheckIds = new Set([...selectedGroupedChildOrderCheckIds].filter((id) => selectedGroupedChildOrderIds.has(id)));
  return getGroupedChildOrderIdsForSubmit();
}

function updateSelectedChildOrderSummary() {
  const selected = masterOrderGroupedRows();
  const totalAmount = selected.reduce((sum, row) => sum + masterOrderChildAmount(row), 0);
  const totalDebt = selected.reduce((sum, row) => sum + masterOrderChildDebt(row), 0);
  if (selectedChildOrderCount) selectedChildOrderCount.textContent = String(selected.length);
  if (selectedChildOrderAmount) selectedChildOrderAmount.textContent = masterOrderMoney(totalAmount);
  if (selectedChildOrderDebt) selectedChildOrderDebt.textContent = masterOrderMoney(totalDebt);
}
// MASTER_ORDER_POPUP_PATCH_END

function masterOrderEscapeHtml(value) {
  if (window.V45Common && typeof window.V45Common.escapeHtml === 'function') {
    return window.V45Common.escapeHtml(value);
  }
  return String(value || '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[ch]));
}

function masterOrderSaleDateRaw(order = {}) {
  return order.orderDate || order.documentDate || order.date || order.createdAt || '';
}

function masterOrderSaleDateTime(order = {}) {
  const raw = masterOrderSaleDateRaw(order);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

// MASTER_ORDER_POPUP_PATCH_START: layer 2 không hiển thị các đơn đã chuyển sang layer 3
function renderUnmergedChildOrders() {
  if (!unmergedOrderList) return;
  const rows = getVisibleUnmergedCandidateRows();
  rows.sort((a, b) => masterOrderSaleDateTime(a) - masterOrderSaleDateTime(b));
  updateSelectedChildOrderSummary();
  if (unmergedOrderCount) unmergedOrderCount.textContent = `${rows.length} đơn con chưa gộp`;
  if (!rows.length) {
    unmergedOrderList.innerHTML = '<div class="empty-cell">Không có đơn con chưa gộp phù hợp.</div>';
    syncUnmergedOrderToggleButton();
    return;
  }

  const header = `<div class="master-child-one-line master-child-header" aria-hidden="true">
    <span></span>
    <span>Mã đơn</span>
    <span>Khách hàng</span>
    <span>NVBH</span>
    <span>Ngày bán</span>
    <span>Giá trị</span>
  </div>`;

  const body = rows.map((order) => {
    const key = salesOrderIdentity(order);
    const checked = selectedUnmergedChildOrderIds.has(key) ? 'checked' : '';
    const selectedClass = checked ? ' selected' : '';
    const code = order.code || order.orderCode || order.salesOrderCode || key;
    const customer = order.customerName || order.customerCode || 'Khách hàng';
    const staff = canonicalSalesStaffLabel(order);
    const saleDate = masterOrderDate(masterOrderSaleDateRaw(order));
    return `<label class="master-child-one-line${selectedClass}" title="${masterOrderEscapeHtml(code)} | ${masterOrderEscapeHtml(customer)} | ${masterOrderEscapeHtml(staff)}">
      <input type="checkbox" class="child-order-check" data-selection-item data-selection-key="${masterOrderEscapeHtml(key)}" data-id="${masterOrderEscapeHtml(key)}" ${checked} />
      <span class="master-child-code">${masterOrderEscapeHtml(code)}</span>
      <span class="master-child-customer">${masterOrderEscapeHtml(customer)}</span>
      <span class="master-child-staff">${masterOrderEscapeHtml(staff)}</span>
      <span class="master-child-date">${masterOrderEscapeHtml(saleDate)}</span>
      <span class="master-child-money">${masterOrderMoney(masterOrderChildAmount(order))}</span>
    </label>`;
  }).join('');

  unmergedOrderList.innerHTML = header + body;
  syncUnmergedOrderToggleButton();
}
window.renderUnmergedChildOrders = renderUnmergedChildOrders;

function renderSelectedGroupedChildOrders() {
  if (!selectedMasterChildOrderList) return;
  const rows = masterOrderGroupedRows().sort((a, b) => masterOrderSaleDateTime(a) - masterOrderSaleDateTime(b));
  updateSelectedChildOrderSummary();
  if (!rows.length) {
    selectedMasterChildOrderList.innerHTML = '<div class="empty-cell">Chưa có đơn con nào được đưa vào danh sách gộp.</div>';
    return;
  }
  const header = `<div class="master-child-one-line master-child-header master-selected-child-header" aria-hidden="true">
    <span></span><span>Mã đơn</span><span>Khách hàng</span><span>NVBH</span><span>Ngày bán</span><span>Giá trị</span>
  </div>`;
  const body = rows.map((order) => {
    const key = salesOrderIdentity(order);
    const checked = selectedGroupedChildOrderCheckIds.has(key) ? 'checked' : '';
    const selectedClass = checked ? ' selected' : '';
    const code = order.code || order.orderCode || order.salesOrderCode || key;
    const customer = order.customerName || order.customerCode || 'Khách hàng';
    const staff = canonicalSalesStaffLabel(order);
    const saleDate = masterOrderDate(masterOrderSaleDateRaw(order));
    return `<label class="master-child-one-line master-selected-child-row${selectedClass}" title="${masterOrderEscapeHtml(code)} | ${masterOrderEscapeHtml(customer)} | ${masterOrderEscapeHtml(staff)}">
      <input type="checkbox" class="grouped-child-order-check" data-id="${masterOrderEscapeHtml(key)}" ${checked} />
      <span class="master-child-code">${masterOrderEscapeHtml(code)}</span>
      <span class="master-child-customer">${masterOrderEscapeHtml(customer)}</span>
      <span class="master-child-staff">${masterOrderEscapeHtml(staff)}</span>
      <span class="master-child-date">${masterOrderEscapeHtml(saleDate)}</span>
      <span class="master-child-money">${masterOrderMoney(masterOrderChildAmount(order))}</span>
    </label>`;
  }).join('');
  selectedMasterChildOrderList.innerHTML = `<div class="master-selected-child-list-shell">${header}${body}</div>`;
}
window.renderSelectedGroupedChildOrders = renderSelectedGroupedChildOrders;

function renderMasterOrderGroupingLayers() {
  renderUnmergedChildOrders();
  renderSelectedGroupedChildOrders();
}
window.renderMasterOrderGroupingLayers = renderMasterOrderGroupingLayers;
// MASTER_ORDER_POPUP_PATCH_END

function setUnmergedOrdersLoading(isLoading) {
  if (!reloadUnmergedOrdersButton) return;
  reloadUnmergedOrdersButton.disabled = !!isLoading;
  reloadUnmergedOrdersButton.textContent = isLoading ? 'Đang tải...' : 'Tải lại';
}

function buildUnmergedChildOrderParams() {
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
  return params;
}

async function loadUnmergedChildOrders() {
  if (!unmergedOrderList) return;
  if (unmergedOrderReloadTimer) {
    clearTimeout(unmergedOrderReloadTimer);
    unmergedOrderReloadTimer = null;
  }
  const requestSeq = ++unmergedOrderRequestSeq;
  setUnmergedOrdersLoading(true);
  try {
    unmergedOrderList.innerHTML = '<div class="empty-cell">Đang tải đơn con chưa gộp...</div>';
    if (unmergedOrderCount) unmergedOrderCount.textContent = 'Đang tải đơn con chưa gộp...';
    const params = buildUnmergedChildOrderParams();
    const res = await (window.fetchWithTimeout || fetch)(`/api/master-orders/unmerged-child-orders?${params.toString()}`, {}, 15000);
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tải được đơn con chưa gộp');
    if (requestSeq !== unmergedOrderRequestSeq) return;
    const rows = json.orders || json.rows || json.data || [];
    replaceUnmergedCandidateResults(Array.isArray(rows) ? rows : []);
    selectedGroupedChildOrderCheckIds = new Set([...selectedGroupedChildOrderCheckIds].filter((id) => selectedGroupedChildOrderIds.has(id)));
    renderMasterOrderGroupingLayers();
  } catch (err) {
    if (requestSeq !== unmergedOrderRequestSeq) return;
    if (unmergedOrderCount) unmergedOrderCount.textContent = 'Lỗi tải đơn con';
    if (unmergedOrderList) unmergedOrderList.innerHTML = `<div class="empty-cell error">${masterOrderEscapeHtml(err.message || 'Không tải được đơn con chưa gộp')}</div>`;
  } finally {
    if (requestSeq === unmergedOrderRequestSeq) setUnmergedOrdersLoading(false);
  }
}

function reloadUnmergedChildOrdersNow() {
  if (unmergedOrderReloadTimer) {
    clearTimeout(unmergedOrderReloadTimer);
    unmergedOrderReloadTimer = null;
  }
  return loadUnmergedChildOrders();
}

function scheduleUnmergedChildOrdersReload() {
  if (unmergedOrderReloadTimer) clearTimeout(unmergedOrderReloadTimer);
  unmergedOrderReloadTimer = setTimeout(() => {
    unmergedOrderReloadTimer = null;
    loadUnmergedChildOrders();
  }, UNMERGED_ORDER_RELOAD_DEBOUNCE_MS);
}

window.loadUnmergedChildOrders = loadUnmergedChildOrders;
window.reloadUnmergedChildOrdersNow = reloadUnmergedChildOrdersNow;
window.scheduleUnmergedChildOrdersReload = scheduleUnmergedChildOrdersReload;

// MASTER_ORDER_POPUP_PATCH_START: chọn tất cả chỉ tác động layer 2 đang nhìn thấy
function unmergedBulkRows(){
  return getVisibleUnmergedCandidateRows();
}
function deriveUnmergedOrderBulkSelectionState(){
  const rows=unmergedBulkRows();
  const api=window.ScopedBulkSelection;
  if(api&&typeof api.deriveScopeSelectionState==='function')return api.deriveScopeSelectionState({visibleRows:rows,selectedKeys:selectedUnmergedChildOrderIds,getKey:salesOrderIdentity,isSelectable:()=>true});
  const keys=rows.map(salesOrderIdentity).filter(Boolean);
  const count=keys.filter(key=>selectedUnmergedChildOrderIds.has(key)).length;
  const allSelected=Boolean(keys.length&&count===keys.length);
  return {selectableKeys:keys,selectableCount:keys.length,selectedSelectableCount:count,allSelected,buttonLabel:allSelected?'Bỏ chọn tất cả':'Chọn tất cả',disabled:keys.length===0};
}
function syncUnmergedOrderToggleButton(){
  if(typeof selectAllUnmergedOrdersButton==='undefined'||!selectAllUnmergedOrdersButton)return;
  const summary=deriveUnmergedOrderBulkSelectionState();
  const api=window.ScopedBulkSelection;
  if(api&&typeof api.applyToggleButtonState==='function')api.applyToggleButtonState(selectAllUnmergedOrdersButton,summary,{entityLabel:'đơn con chưa gộp đang hiển thị'});
  else{
    selectAllUnmergedOrdersButton.textContent=summary.buttonLabel;
    selectAllUnmergedOrdersButton.disabled=summary.disabled;
    selectAllUnmergedOrdersButton.setAttribute('aria-disabled',summary.disabled?'true':'false');
    selectAllUnmergedOrdersButton.setAttribute('aria-pressed',summary.allSelected?'true':'false');
  }
}

function toggleSelectAllUnmergedOrders() {
  const rows=unmergedBulkRows();
  const api=window.ScopedBulkSelection;
  if(api&&typeof api.toggleScopeSelection==='function')api.toggleScopeSelection({visibleRows:rows,selectedKeys:selectedUnmergedChildOrderIds,getKey:salesOrderIdentity,isSelectable:()=>true});
  else{
    const summary=deriveUnmergedOrderBulkSelectionState();
    if(summary.allSelected)summary.selectableKeys.forEach(key=>selectedUnmergedChildOrderIds.delete(key));
    else summary.selectableKeys.forEach(key=>selectedUnmergedChildOrderIds.add(key));
  }
  selectedChildOrderIds = selectedUnmergedChildOrderIds;
  renderUnmergedChildOrders();
}
window.toggleSelectAllUnmergedOrders = toggleSelectAllUnmergedOrders;

function moveSelectedUnmergedToGrouped() {
  const ids = [...selectedUnmergedChildOrderIds].filter(Boolean);
  if (!ids.length) return masterOrderSetMessage('Chưa chọn đơn con ở layer 2 để đưa vào danh sách gộp', true);
  ids.forEach((id) => {
    selectedGroupedChildOrderIds.add(id);
    explicitlyRemovedGroupedChildOrderIds.delete(id);
  });
  selectedUnmergedChildOrderIds.clear();
  selectedChildOrderIds = selectedUnmergedChildOrderIds;
  masterOrderSetMessage(`Đã đưa ${ids.length} đơn sang danh sách gộp`);
  renderMasterOrderGroupingLayers();
}
window.moveSelectedUnmergedToGrouped = moveSelectedUnmergedToGrouped;

function removeSelectedGroupedChildOrders() {
  const ids = [...selectedGroupedChildOrderCheckIds].filter(Boolean);
  if (!ids.length) return masterOrderSetMessage('Chưa chọn đơn ở layer 3 để bỏ khỏi danh sách gộp', true);
  ids.forEach((id) => {
    selectedGroupedChildOrderIds.delete(id);
    if (originalGroupedChildOrderIds.has(id)) explicitlyRemovedGroupedChildOrderIds.add(id);
  });
  selectedGroupedChildOrderCheckIds.clear();
  masterOrderSetMessage(`Đã bỏ ${ids.length} đơn khỏi danh sách gộp`);
  renderMasterOrderGroupingLayers();
}
window.removeSelectedGroupedChildOrders = removeSelectedGroupedChildOrders;

// MASTER_ORDER_CHILD_SELECTION_FIX_START:
// Danh sách được render lại bằng innerHTML nên phải bắt sự kiện theo delegation.
// Trước đây checkbox chỉ đổi trạng thái trên DOM, không cập nhật Set; vì vậy nút
// "Bỏ khỏi danh sách gộp" luôn đọc selectedGroupedChildOrderCheckIds rỗng.
function syncMasterChildCheckboxSelection(selectionSet, checkbox) {
  const id = String(checkbox?.dataset?.id || '').trim();
  if (!id) return false;
  if (checkbox.checked) selectionSet.add(id);
  else selectionSet.delete(id);
  const row = checkbox.closest('.master-child-one-line');
  if (row) row.classList.toggle('selected', checkbox.checked);
  return true;
}

function handleUnmergedChildSelectionChange(event) {
  const check = event?.target?.closest?.('.child-order-check');
  if (!check || !unmergedOrderList?.contains(check)) return;
  if (!syncMasterChildCheckboxSelection(selectedUnmergedChildOrderIds, check)) return;
  selectedChildOrderIds = selectedUnmergedChildOrderIds;
  window.selectedChildOrderIds = selectedChildOrderIds;
  syncUnmergedOrderToggleButton();
}

function handleGroupedChildSelectionChange(event) {
  const check = event?.target?.closest?.('.grouped-child-order-check');
  if (!check || !selectedMasterChildOrderList?.contains(check)) return;
  syncMasterChildCheckboxSelection(selectedGroupedChildOrderCheckIds, check);
}
// MASTER_ORDER_CHILD_SELECTION_FIX_END
// MASTER_ORDER_POPUP_PATCH_END

function isMasterOrderLocked(order) {
  const status = String(order.status || order.deliveryStatus || '').toLowerCase();
  return status === 'delivered' || status === 'completed' || order.accountingConfirmed === true || order.accountingStatus === 'confirmed';
}

function renderMasterOrders() {
  if (!masterOrderList) return;
  const rows = Array.isArray(masterOrdersCache) ? masterOrdersCache : [];
  if (masterOrderCount) masterOrderCount.textContent = `${rows.length} đơn tổng`;
  if (!rows.length) {
    masterOrderList.innerHTML = '<div class="empty-cell">Không có đơn tổng phù hợp.</div>';
    syncMasterOrderToggleButton();
    return;
  }
  // MASTER_ORDER_LIST_ACTION_PATCH_START: thêm ghi chú + thao tác Sửa/Hủy
  masterOrderList.innerHTML = rows.map((order) => {
    const key = masterOrderIdentity(order);
    const checked = selectedMasterOrderIds.has(key) ? 'checked' : '';
    const code = order.code || order.id || key;
    const delivery = order.deliveryStaffName || order.deliveryStaffCode || '';
    // MASTER_ORDER_SEARCH_NOTE_PATCH_START: render cùng nhóm field ghi chú mà backend search đang dùng
    const note = order.note || order.notes || order.deliveryNote || order.remark || order.description || '';
    // MASTER_ORDER_SEARCH_NOTE_PATCH_END
    const total = Number(order.totalAmount ?? order.amount ?? order.grandTotal ?? 0) || 0;
    const locked = isMasterOrderLocked(order);
    const actions = locked
      ? '<span class="locked-text">Đã khóa</span>'
      : `<button type="button" class="secondary small edit-master-order" data-id="${masterOrderEscapeHtml(key)}">Sửa</button><button type="button" class="secondary small danger cancel-master-order" data-id="${masterOrderEscapeHtml(key)}">Huỷ</button>`;
    return `<div class="order-row compact-order-row master-order-row">
      <label><input type="checkbox" class="master-order-check" data-selection-item data-selection-key="${masterOrderEscapeHtml(key)}" data-id="${masterOrderEscapeHtml(key)}" ${checked} /></label>
      <span class="master-order-code" title="${masterOrderEscapeHtml(code)}">${masterOrderEscapeHtml(code)}</span>
      <span title="${masterOrderEscapeHtml(delivery)}">${masterOrderEscapeHtml(delivery)}</span>
      <span class="master-order-note-cell" title="${masterOrderEscapeHtml(note)}">${masterOrderEscapeHtml(note || '-')}</span>
      <span>${masterOrderDate(order.deliveryDate || order.date || order.createdAt)}</span>
      <span class="money-cell">${masterOrderMoney(total)}</span>
      <span class="button-row master-order-actions">${actions}</span>
    </div>`;
  }).join('');
  syncMasterOrderToggleButton();
  // MASTER_ORDER_LIST_ACTION_PATCH_END
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
    if (masterOrderList) masterOrderList.innerHTML = `<div class="empty-cell error">${masterOrderEscapeHtml(err.message || 'Không tải được đơn tổng')}</div>`;
  }
}
window.loadMasterOrders = loadMasterOrders;

// MASTER_ORDER_POPUP_PATCH_START: mở/đóng/reset popup tạo đơn tổng 3 layer
function setMasterOrderModalTitle(text) {
  const title = document.getElementById('masterOrderModalTitle');
  if (title) title.textContent = text || 'Tạo đơn tổng';
  const submitButton = masterOrderForm ? masterOrderForm.querySelector('.master-order-submit-button') : null;
  if (submitButton) submitButton.textContent = masterOrderEditMode ? 'Lưu sửa đơn tổng' : 'Tạo đơn tổng';
}

function openMasterOrderModal(options = {}) {
  if (!masterOrderModal) return;
  if (!options.keepMode && !masterOrderEditMode) {
    masterOrderEditMode = false;
    editingMasterOrderId = '';
    setMasterOrderModalTitle('Tạo đơn tổng');
  }
  masterOrderModal.classList.add('show');
  masterOrderModal.setAttribute('aria-hidden', 'false');
  if (!masterOrderEditMode) applyMasterOrderDefaultDates();
  if (!options.skipLoad) loadUnmergedChildOrders();
  renderSelectedGroupedChildOrders();
}
window.openMasterOrderModal = openMasterOrderModal;

function closeMasterOrderModal() {
  if (!masterOrderModal) return;
  masterOrderModal.classList.remove('show');
  masterOrderModal.setAttribute('aria-hidden', 'true');
}
window.closeMasterOrderModal = closeMasterOrderModal;

function resetMasterOrderModal() {
  masterOrderEditMode = false;
  editingMasterOrderId = '';
  setMasterOrderModalTitle('Tạo đơn tổng');
  resetMasterOrderEditWorkingSet();
  if (masterOrderForm) {
    masterOrderForm.reset();
    applyMasterOrderDefaultDates({ forceDelivery: true });
    if (masterOrderForm.elements.groupBySalesStaff) masterOrderForm.elements.groupBySalesStaff.checked = true;
  }
  masterOrderSetMessage('');
  renderMasterOrderGroupingLayers();
}
window.resetMasterOrderModal = resetMasterOrderModal;
// MASTER_ORDER_POPUP_PATCH_END

async function loadMasterOrderModule() {
  await Promise.allSettled([loadUnmergedChildOrders(), loadMasterOrders()]);
}
window.loadMasterOrderModule = loadMasterOrderModule;

async function submitMasterOrder(event) {
  if (event && event.preventDefault) event.preventDefault();
  try {
    syncVisibleGroupedChildOrderIds();
    const childOrderIds = getGroupedChildOrderIdsForSubmit();
    if (!childOrderIds.length) throw new Error('Chưa chọn đơn con để gộp');
    const formData = masterOrderForm ? new FormData(masterOrderForm) : new FormData();
    const payload = Object.fromEntries(formData.entries());
    const isEdit = masterOrderEditMode && editingMasterOrderId;
    payload.childOrderIds = childOrderIds;
    if (isEdit) {
      payload.expectedChildOrderIds = [...originalGroupedChildOrderIds];
      payload.removedChildOrderIds = [...explicitlyRemovedGroupedChildOrderIds];
    }
    payload.groupBySalesStaff = !!(masterOrderForm && masterOrderForm.elements.groupBySalesStaff && masterOrderForm.elements.groupBySalesStaff.checked);
    // MASTER_ORDER_EDIT_MODAL_PATCH_START: dùng chung form tạo/sửa nhưng không chạm logic hủy/in/kế toán
    masterOrderSetMessage(isEdit ? 'Đang lưu sửa đơn tổng...' : 'Đang tạo đơn tổng...');
    const res = await (window.fetchWithTimeout || fetch)(isEdit ? `/api/master-orders/${encodeURIComponent(editingMasterOrderId)}` : '/api/master-orders', {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 20000);
    const json = await res.json();
    if (!res.ok || json.ok === false) throw new Error(json.message || (isEdit ? 'Không cập nhật được đơn tổng' : 'Không tạo được đơn tổng'));
    masterOrderSetMessage(json.message || (isEdit ? 'Đã cập nhật đơn tổng' : 'Đã tạo đơn tổng'));
    masterOrderEditMode = false;
    editingMasterOrderId = '';
    resetMasterOrderEditWorkingSet();
    setMasterOrderModalTitle('Tạo đơn tổng');
    closeMasterOrderModal();
    await loadMasterOrderModule();
    // MASTER_ORDER_EDIT_MODAL_PATCH_END
  } catch (err) {
    masterOrderSetMessage(err.message || 'Không tạo/cập nhật được đơn tổng', true);
  }
}
window.submitMasterOrder = submitMasterOrder;

function deriveMasterOrderBulkSelectionState(){
  const rows=Array.isArray(masterOrdersCache)?masterOrdersCache:[];
  const api=window.ScopedBulkSelection;
  if(api&&typeof api.deriveScopeSelectionState==='function')return api.deriveScopeSelectionState({visibleRows:rows,selectedKeys:selectedMasterOrderIds,getKey:masterOrderIdentity,isSelectable:()=>true});
  const keys=rows.map(masterOrderIdentity).filter(Boolean);
  const count=keys.filter(key=>selectedMasterOrderIds.has(key)).length;
  const allSelected=Boolean(keys.length&&count===keys.length);
  return {selectableKeys:keys,selectableCount:keys.length,selectedSelectableCount:count,allSelected,buttonLabel:allSelected?'Bỏ chọn tất cả':'Chọn tất cả',disabled:keys.length===0};
}
function syncMasterOrderToggleButton(){
  if(typeof selectAllMasterOrdersButton==='undefined'||!selectAllMasterOrdersButton)return;
  const summary=deriveMasterOrderBulkSelectionState();
  const api=window.ScopedBulkSelection;
  if(api&&typeof api.applyToggleButtonState==='function')api.applyToggleButtonState(selectAllMasterOrdersButton,summary,{entityLabel:'đơn tổng đang hiển thị'});
  else{
    selectAllMasterOrdersButton.textContent=summary.buttonLabel;
    selectAllMasterOrdersButton.disabled=summary.disabled;
    selectAllMasterOrdersButton.setAttribute('aria-disabled',summary.disabled?'true':'false');
    selectAllMasterOrdersButton.setAttribute('aria-pressed',summary.allSelected?'true':'false');
  }
}

function toggleSelectAllMasterOrders() {
  const rows=Array.isArray(masterOrdersCache)?masterOrdersCache:[];
  const api=window.ScopedBulkSelection;
  if(api&&typeof api.toggleScopeSelection==='function')api.toggleScopeSelection({visibleRows:rows,selectedKeys:selectedMasterOrderIds,getKey:masterOrderIdentity,isSelectable:()=>true});
  else{
    const summary=deriveMasterOrderBulkSelectionState();
    if(summary.allSelected)summary.selectableKeys.forEach(key=>selectedMasterOrderIds.delete(key));
    else summary.selectableKeys.forEach(key=>selectedMasterOrderIds.add(key));
  }
  renderMasterOrders();
}
window.toggleSelectAllMasterOrders = toggleSelectAllMasterOrders;

function printMasterOrderIds(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return alert('Chưa chọn đơn tổng để in');
  fetch('/api/print/master-orders/batch', {
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




// MASTER_ORDER_EDIT_MODAL_PATCH_START: mở popup 3 layer ở chế độ sửa đơn tổng
function mergeRowsIntoUnmergedCache(rows = []) {
  upsertMasterOrderChildRows(rows);
}

async function editMasterOrderFromList(id) {
  if (!id) return;
  const order = (masterOrdersCache || []).find((row) => masterOrderIdentity(row) === id);
  if (!order) return alert('Không tìm thấy đơn tổng để sửa');
  if (isMasterOrderLocked(order)) return alert('Đơn tổng đã khóa/giao/xác nhận kế toán, không thể sửa');
  try {
    masterOrderEditMode = true;
    editingMasterOrderId = id;
    resetMasterOrderEditWorkingSet();
    await loadUnmergedChildOrders();

    const res = await (window.fetchWithTimeout || fetch)(`/api/master-orders/${encodeURIComponent(id)}`, {}, 15000);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.message || 'Không tải được chi tiết đơn tổng');
    const detail = json.masterOrder || json.order || json.data || order;
    const children = detail.children || detail.childOrders || detail.orders || detail.salesOrders || [];
    initializeMasterOrderEditWorkingSet(children);

    if (masterOrderForm) {
      if (masterOrderForm.elements.masterOrderDate) masterOrderForm.elements.masterOrderDate.value = String(detail.masterOrderDate || detail.createdDate || detail.createdAt || masterOrderTodayDate()).slice(0, 10);
      if (masterOrderForm.elements.deliveryDate) masterOrderForm.elements.deliveryDate.value = String(detail.deliveryDate || detail.date || '').slice(0, 10);
      if (masterOrderForm.elements.routeName) masterOrderForm.elements.routeName.value = detail.routeName || detail.deliveryRoute || '';
      if (masterOrderForm.elements.deliveryStaffCode) masterOrderForm.elements.deliveryStaffCode.value = detail.deliveryStaffCode || '';
      if (masterOrderForm.elements.deliveryStaffName) masterOrderForm.elements.deliveryStaffName.value = detail.deliveryStaffName || '';
      if (masterOrderForm.elements.note) masterOrderForm.elements.note.value = detail.note || detail.deliveryNote || detail.description || detail.remark || '';
      if (masterOrderForm.elements.groupBySalesStaff) masterOrderForm.elements.groupBySalesStaff.checked = !!detail.groupBySalesStaff;
    }

    setMasterOrderModalTitle('Sửa đơn tổng');
    openMasterOrderModal({ keepMode: true, skipLoad: true });
    renderMasterOrderGroupingLayers();
    masterOrderSetMessage('Đang sửa đơn tổng. Chỉ lưu khi bấm "Lưu sửa đơn tổng".');
  } catch (err) {
    masterOrderEditMode = false;
    editingMasterOrderId = '';
    setMasterOrderModalTitle('Tạo đơn tổng');
    alert(err.message || 'Không mở được đơn tổng để sửa');
  }
}
window.editMasterOrderFromList = editMasterOrderFromList;
// MASTER_ORDER_EDIT_MODAL_PATCH_END

async function cancelMasterOrderFromList(id) {
  if (!id) return;
  if (!confirm('Huỷ đơn tổng này và trả các đơn con về danh sách chưa gộp?')) return;
  try {
    const res = await (window.fetchWithTimeout || fetch)(`/api/master-orders/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'Huỷ từ danh sách đơn tổng' })
    }, 15000);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.message || json.error || 'Không huỷ được đơn tổng');
    selectedMasterOrderIds.delete(id);
    window.__selectedMasterOrderIds = selectedMasterOrderIds;
    await loadMasterOrderModule();
  } catch (err) {
    alert(err.message || 'Không huỷ được đơn tổng');
  }
}
window.cancelMasterOrderFromList = cancelMasterOrderFromList;


if (masterOrderList) {
  masterOrderList.addEventListener('change', (event) => {
    const check = event.target.closest('.master-order-check');
    if (!check) return;
    if (check.checked) selectedMasterOrderIds.add(check.dataset.id);
    else selectedMasterOrderIds.delete(check.dataset.id);
    window.__selectedMasterOrderIds = selectedMasterOrderIds;
    syncMasterOrderToggleButton();
  });
  masterOrderList.addEventListener('click', (event) => {
    // MASTER_ORDER_LIST_ACTION_PATCH_START: thêm nút sửa, giữ nguyên hủy
    const editBtn = event.target.closest('.edit-master-order');
    if (editBtn) return editMasterOrderFromList(editBtn.dataset.id);
    const btn = event.target.closest('.cancel-master-order');
    if (!btn) return;
    cancelMasterOrderFromList(btn.dataset.id);
    // MASTER_ORDER_LIST_ACTION_PATCH_END
  });
}

// MASTER_ORDER_EDIT_MODAL_PATCH_START: gắn event popup đơn tổng nếu file event tổng chưa gắn
if (typeof openMasterOrderModalButton !== 'undefined' && openMasterOrderModalButton) openMasterOrderModalButton.addEventListener('click', () => { resetMasterOrderModal(); openMasterOrderModal(); });
if (typeof closeMasterOrderModalButton !== 'undefined' && closeMasterOrderModalButton) closeMasterOrderModalButton.addEventListener('click', closeMasterOrderModal);
if (typeof masterOrderForm !== 'undefined' && masterOrderForm) masterOrderForm.addEventListener('submit', submitMasterOrder);
if (typeof moveToGroupedOrdersButton !== 'undefined' && moveToGroupedOrdersButton) moveToGroupedOrdersButton.addEventListener('click', moveSelectedUnmergedToGrouped);
if (typeof removeFromGroupedOrdersButton !== 'undefined' && removeFromGroupedOrdersButton) removeFromGroupedOrdersButton.addEventListener('click', removeSelectedGroupedChildOrders);
if (typeof unmergedOrderList !== 'undefined' && unmergedOrderList) unmergedOrderList.addEventListener('change', handleUnmergedChildSelectionChange);
if (typeof selectedMasterChildOrderList !== 'undefined' && selectedMasterChildOrderList) selectedMasterChildOrderList.addEventListener('change', handleGroupedChildSelectionChange);
if (typeof reloadUnmergedOrdersButton !== 'undefined' && reloadUnmergedOrdersButton) reloadUnmergedOrdersButton.addEventListener('click', reloadUnmergedChildOrdersNow);
if (typeof unmergedSourceFilter !== 'undefined' && unmergedSourceFilter) unmergedSourceFilter.addEventListener('change', reloadUnmergedChildOrdersNow);
if (typeof unmergedDateFrom !== 'undefined' && unmergedDateFrom) unmergedDateFrom.addEventListener('change', reloadUnmergedChildOrdersNow);
if (typeof unmergedDateTo !== 'undefined' && unmergedDateTo) unmergedDateTo.addEventListener('change', reloadUnmergedChildOrdersNow);
if (typeof unmergedOrderSearch !== 'undefined' && unmergedOrderSearch) unmergedOrderSearch.addEventListener('input', scheduleUnmergedChildOrdersReload);
if (typeof unmergedSalesStaffFilter !== 'undefined' && unmergedSalesStaffFilter) unmergedSalesStaffFilter.addEventListener('input', scheduleUnmergedChildOrdersReload);
if (typeof selectAllUnmergedOrdersButton !== 'undefined' && selectAllUnmergedOrdersButton) selectAllUnmergedOrdersButton.addEventListener('click', toggleSelectAllUnmergedOrders);
if (typeof selectAllMasterOrdersButton !== 'undefined' && selectAllMasterOrdersButton) selectAllMasterOrdersButton.addEventListener('click', toggleSelectAllMasterOrders);
if (typeof printSelectedMasterOrdersButton !== 'undefined' && printSelectedMasterOrdersButton) printSelectedMasterOrdersButton.addEventListener('click', printSelectedMasterOrders);
if (typeof reloadMasterOrdersButton !== 'undefined' && reloadMasterOrdersButton) reloadMasterOrdersButton.addEventListener('click', loadMasterOrderModule);
// MASTER_ORDER_EDIT_MODAL_PATCH_END



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
