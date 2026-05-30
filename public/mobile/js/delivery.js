import { mobileApi, getUser } from './api.js';
import { bindLogout, money, requireLogin, requireRole, setMessage } from './ui.js';

requireLogin();
requireRole(['delivery']);
bindLogout(document.getElementById('logoutBtn'));

const user = getUser();
document.getElementById('staffInfo').textContent = `${user.name || user.username || 'Nhân viên'} · ${user.role || 'delivery'}`;

const state = {
  orders: [],
  selectedOrderId: ''
};

const list = document.getElementById('deliveryOrders');
const reportList = document.getElementById('deliveryReportList');
const message = document.getElementById('deliveryMessage');
const actionMessage = document.getElementById('deliveryActionMessage');
const cashMessage = document.getElementById('cashMessage');
const deliveryDateInput = document.getElementById('deliveryDateInput');
const todayOrdersBtn = document.getElementById('todayOrdersBtn');
const deliveryFormula = document.getElementById('deliveryFormula');
const selectedOrderBox = document.getElementById('selectedOrderBox');
const deliveryActionBox = document.getElementById('deliveryActionBox');

const kpiTotalOrders = document.getElementById('kpiTotalOrders');
const kpiDoneOrders = document.getElementById('kpiDoneOrders');
const kpiPendingOrders = document.getElementById('kpiPendingOrders');
const kpiDebtAmount = document.getElementById('kpiDebtAmount');
const reportCashAmount = document.getElementById('reportCashAmount');
const reportBankAmount = document.getElementById('reportBankAmount');
const reportReturnAmount = document.getElementById('reportReturnAmount');
const reportDebtAmount = document.getElementById('reportDebtAmount');

document.getElementById('reloadOrdersBtn')?.addEventListener('click', loadOrders);
document.getElementById('submitCashBtn')?.addEventListener('click', submitCash);
document.querySelectorAll('[data-delivery-tab]').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.deliveryTab));
});

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function isCompleted(order) {
  const status = String(order.deliveryStatus || order.visualStatus || order.status || '').toLowerCase();
  return ['delivered', 'success', 'partial_return', 'returned', 'failed', 'delivery_failed'].includes(status);
}

function isDelivered(order) {
  const status = String(order.deliveryStatus || order.visualStatus || order.status || '').toLowerCase();
  return ['delivered', 'success'].includes(status) || Number(order.cashCollected || 0) + Number(order.bankCollected || 0) + Number(order.returnAmount || 0) > 0;
}

function statusLabel(order) {
  const status = String(order.deliveryStatus || order.visualStatus || order.status || '').toLowerCase();
  if (status === 'delivered' || status === 'success') return 'Đã giao';
  if (status === 'failed' || status === 'delivery_failed') return 'Giao thất bại';
  if (status === 'partial_return') return 'Trả một phần';
  if (status === 'returned') return 'Trả cả đơn';
  if (status === 'delivering') return 'Đang giao';
  return 'Chờ giao';
}

function showTab(tabName) {
  document.querySelectorAll('[data-delivery-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.deliveryTab === tabName));
  document.querySelectorAll('.delivery-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById(`delivery${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}Panel`)?.classList.add('active');
  if (tabName === 'report') renderReport();
}

if (deliveryDateInput) {
  deliveryDateInput.value = todayValue();
  deliveryDateInput.addEventListener('change', loadOrders);
}

todayOrdersBtn?.addEventListener('click', () => {
  if (deliveryDateInput) deliveryDateInput.value = todayValue();
  loadOrders();
});

loadOrders();

async function loadOrders() {
  try {
    setMessage(message, 'Đang tải đơn...');
    const selectedDate = deliveryDateInput?.value || todayValue();
    const data = await mobileApi.getDeliveryOrders({ date: selectedDate, includeCompleted: '1' });
    state.orders = data.items || [];
    if (deliveryFormula) deliveryFormula.textContent = data.formula || 'App lọc theo ngày giao + nhân viên giao đang đăng nhập.';
    renderOrders(state.orders, data.date || selectedDate);
    renderKpis();
    renderReport();
    if (state.selectedOrderId) selectOrder(state.selectedOrderId, false);
    setMessage(message, '');
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
}

function renderKpis() {
  const total = state.orders.length;
  const done = state.orders.filter(isDelivered).length;
  const pending = state.orders.filter(order => !isCompleted(order)).length;
  const debt = state.orders.reduce((sum, order) => sum + Number(order.debtAmount || order.amount || 0), 0);
  if (kpiTotalOrders) kpiTotalOrders.textContent = total;
  if (kpiDoneOrders) kpiDoneOrders.textContent = done;
  if (kpiPendingOrders) kpiPendingOrders.textContent = pending;
  if (kpiDebtAmount) kpiDebtAmount.textContent = money(debt);
}

function renderOrders(items, selectedDate = '') {
  if (!items.length) {
    list.className = 'order-list empty';
    list.textContent = `Không có đơn giao trong ngày ${selectedDate || 'đã chọn'}`;
    return;
  }

  list.className = 'order-list delivery-list-cards';
  list.innerHTML = items.map(order => `
    <article class="delivery-mini-card ${isCompleted(order) ? 'done' : 'pending'}">
      <div class="delivery-mini-head">
        <div>
          <strong>${escapeHtml(order.code || order.id)} - ${escapeHtml(order.customerName || '')}</strong>
          <span>${escapeHtml(order.phone || '')} · ${escapeHtml(order.address || '')}</span>
        </div>
        <b>${statusLabel(order)}</b>
      </div>
      <div class="delivery-mini-money">
        <span>Tổng: ${money(order.totalAmount)}</span>
        <span>Còn thu: ${money(order.amount || order.debtAmount)}</span>
      </div>
      <div class="delivery-mini-meta">
        <span>Ngày giao: ${escapeHtml(order.deliveryDate || selectedDate)}</span>
        <span>Tuyến: ${escapeHtml(order.routeName || 'Chưa gán')}</span>
      </div>
      <button class="primary-btn full-btn" data-select-order="${escapeHtml(order.id)}">Thu tiền / xử lý</button>
    </article>
  `).join('');

  list.querySelectorAll('[data-select-order]').forEach(btn => {
    btn.addEventListener('click', () => selectOrder(btn.dataset.selectOrder, true));
  });
}

function selectOrder(orderId, openCollectTab = true) {
  const order = state.orders.find(item => String(item.id) === String(orderId) || String(item.code) === String(orderId));
  if (!order) {
    state.selectedOrderId = '';
    selectedOrderBox.className = 'selected-delivery-box empty';
    selectedOrderBox.textContent = 'Đơn đã chọn không còn trong danh sách ngày này.';
    deliveryActionBox.innerHTML = '';
    return;
  }
  state.selectedOrderId = order.id;
  renderSelectedOrder(order);
  renderActionForm(order);
  if (openCollectTab) showTab('collect');
}

function renderSelectedOrder(order) {
  selectedOrderBox.className = 'selected-delivery-box';
  selectedOrderBox.innerHTML = `
    <strong>${escapeHtml(order.code || order.id)} - ${escapeHtml(order.customerName || '')}</strong>
    <span>${escapeHtml(order.phone || '')} · ${escapeHtml(order.address || '')}</span>
    <span>Ngày giao: ${escapeHtml(order.deliveryDate || '')} · Tuyến: ${escapeHtml(order.routeName || 'Chưa gán')}</span>
    <span>Tổng tiền: ${money(order.totalAmount)} · Đã xử lý: ${money(Number(order.paidAmount || 0) + Number(order.cashCollected || 0) + Number(order.bankCollected || 0) + Number(order.returnAmount || 0))} · Còn thu: ${money(order.amount || order.debtAmount)}</span>
    <span>Trạng thái: <b>${statusLabel(order)}</b></span>
  `;
}

function renderActionForm(order) {
  deliveryActionBox.innerHTML = `
    
    <div class="delivery-summary-box">
      <h3>Tổng kết giao hàng</h3>
      <div>Phải thu: <b>${money(order.amount || order.debtAmount || 0)}</b></div>
      <div>Còn nợ: <b>${money(order.debtAmount || 0)}</b></div>
    </div>
    <details class="return-panel" open>
      <summary>Danh sách hàng trả (chọn đúng sản phẩm trả)</summary>
      <p class="return-help">Nhập hàng trả trước khi thu tiền.</p>
      <div class="mini-list return-grid">
        ${(order.items || []).map(item => `
          <div class="return-line">
            <div class="return-product">
              <strong>${escapeHtml(item.productCode || '')}</strong>
              <span>${escapeHtml(item.productName || '')}</span>
            </div>
            <input class="return-qty-input" data-return-order="${escapeHtml(order.id)}" data-return-code="${escapeHtml(item.productCode || item.productId || '')}" type="number" min="0" max="${Number(item.quantity || 0)}" step="1" value="0" placeholder="SL trả" />
          </div>
        `).join('')}
      </div>
    </details>
    <div class="collection-tabs" data-method-wrap="${escapeHtml(order.id)}">
      <label><input type="radio" name="collectMethod-${escapeHtml(order.id)}" value="cash" checked /> Tiền mặt</label>
      <label><input type="radio" name="collectMethod-${escapeHtml(order.id)}" value="transfer" /> Chuyển khoản</label>
      <label><input type="radio" name="collectMethod-${escapeHtml(order.id)}" value="none" /> Chưa thu</label>
    </div>
    <input class="collect-input" data-collect="${escapeHtml(order.id)}" type="number" min="0" value="${Number(order.amount || order.debtAmount || 0)}" placeholder="Tiền thực thu" />
    <input class="note-input" data-note="${escapeHtml(order.id)}" type="text" placeholder="Ghi chú giao hàng / lý do trả hàng" />
    
    <div class="row-actions delivery-action-buttons">
      <button class="primary-btn" data-ok="${escapeHtml(order.id)}">Giao thành công</button>
      <button class="ghost-btn" data-partial-return="${escapeHtml(order.id)}">Trả 1 phần</button>
      <button class="danger-btn" data-full-return="${escapeHtml(order.id)}">Trả cả đơn</button>
      <button class="danger-btn" data-fail="${escapeHtml(order.id)}">Giao thất bại</button>
    </div>
  `;

  deliveryActionBox.querySelector('[data-ok]')?.addEventListener('click', btnEvent => confirmDelivery(btnEvent.currentTarget.dataset.ok, 'success'));
  deliveryActionBox.querySelector('[data-fail]')?.addEventListener('click', btnEvent => confirmDelivery(btnEvent.currentTarget.dataset.fail, 'failed'));
  deliveryActionBox.querySelector('[data-partial-return]')?.addEventListener('click', btnEvent => createReturn(btnEvent.currentTarget.dataset.partialReturn, 'partial'));
  deliveryActionBox.querySelector('[data-full-return]')?.addEventListener('click', btnEvent => createReturn(btnEvent.currentTarget.dataset.fullReturn, 'full'));
}

function renderReport() {
  const completed = state.orders.filter(isCompleted);
  const cash = completed.reduce((sum, order) => sum + Number(order.cashCollected || 0), 0);
  const bank = completed.reduce((sum, order) => sum + Number(order.bankCollected || 0), 0);
  const returns = completed.reduce((sum, order) => sum + Number(order.returnAmount || 0), 0);
  const debt = completed.reduce((sum, order) => sum + Number(order.debtAmount || order.amount || 0), 0);
  if (reportCashAmount) reportCashAmount.textContent = money(cash);
  if (reportBankAmount) reportBankAmount.textContent = money(bank);
  if (reportReturnAmount) reportReturnAmount.textContent = money(returns);
  if (reportDebtAmount) reportDebtAmount.textContent = money(debt);

  if (!completed.length) {
    reportList.className = 'order-list empty';
    reportList.textContent = 'Chưa có đơn đã giao / đã xử lý trong ngày này.';
    return;
  }
  reportList.className = 'order-list delivery-report-list';
  reportList.innerHTML = completed.map(order => `
    <article class="delivery-report-item">
      <div>
        <strong>${escapeHtml(order.code || order.id)} - ${escapeHtml(order.customerName || '')}</strong>
        <span>${statusLabel(order)} · Còn nợ: ${money(order.debtAmount || order.amount)}</span>
        <span>TM: ${money(order.cashCollected || 0)} · CK: ${money(order.bankCollected || 0)} · Trả: ${money(order.returnAmount || 0)}</span>
      </div>
      <button class="ghost-btn small-btn" data-edit-report="${escapeHtml(order.id)}">Sửa</button>
    </article>
  `).join('');

  reportList.querySelectorAll('[data-edit-report]').forEach(btn => {
    btn.addEventListener('click', () => selectOrder(btn.dataset.editReport, true));
  });
}

async function confirmDelivery(orderId, status) {
  const collectInput = deliveryActionBox.querySelector(`[data-collect="${orderId}"]`);
  const noteInput = deliveryActionBox.querySelector(`[data-note="${orderId}"]`);
  const methodInput = deliveryActionBox.querySelector(`input[name="collectMethod-${orderId}"]:checked`);
  try {
    await mobileApi.confirmDelivery({
      orderId,
      status,
      collectAmount: methodInput?.value === 'none' ? 0 : Number(collectInput?.value || 0),
      collectionMethod: methodInput?.value === 'transfer' ? 'transfer' : 'cash',
      note: noteInput?.value || ''
    });
    setMessage(actionMessage, 'Đã cập nhật trạng thái giao hàng', 'success');
    await loadOrders();
    showTab('report');
  } catch (err) {
    setMessage(actionMessage, err.message, 'error');
  }
}

async function createReturn(orderId, returnType) {
  const noteInput = deliveryActionBox.querySelector(`[data-note="${orderId}"]`);
  const items = Array.from(deliveryActionBox.querySelectorAll(`[data-return-order="${orderId}"]`))
    .map(input => {
      const reasonInput = deliveryActionBox.querySelector(`[data-return-reason-order="${orderId}"][data-return-reason-code="${input.dataset.returnCode}"]`);
      const maxQty = Number(input.getAttribute('max') || 0);
      const qtyReturn = Number(input.value || 0);
      return {
        productCode: input.dataset.returnCode,
        qtyReturn,
        maxQty,
        reason: reasonInput?.value || ''
      };
    })
    .filter(item => item.qtyReturn > 0);
  const invalidItem = items.find(item => item.qtyReturn > item.maxQty);
  if (invalidItem) {
    setMessage(actionMessage, `Số lượng trả của ${invalidItem.productCode} không được lớn hơn số lượng trong đơn`, 'error');
    return;
  }
  if (returnType === 'partial' && !items.length) {
    setMessage(actionMessage, 'Hãy nhập số lượng trả ở ít nhất 1 dòng hàng', 'error');
    return;
  }
  if (returnType === 'full' && !confirm('Xác nhận trả cả đơn? Hệ thống sẽ nhập lại tồn, giảm công nợ/doanh thu và đánh dấu đơn trả toàn bộ.')) return;
  try {
    await mobileApi.createDeliveryReturn({
      orderId,
      returnType,
      items,
      note: noteInput?.value || ''
    });
    setMessage(actionMessage, returnType === 'full' ? 'Đã tạo phiếu trả cả đơn' : 'Đã tạo phiếu trả hàng một phần', 'success');
    await loadOrders();
    showTab('report');
  } catch (err) {
    setMessage(actionMessage, err.message, 'error');
  }
}

async function submitCash() {
  const amountEl = document.getElementById('cashAmountInput');
  const noteEl = document.getElementById('cashNoteInput');
  try {
    await mobileApi.submitCash({
      amount: Number(amountEl.value || 0),
      note: noteEl.value || ''
    });
    amountEl.value = '';
    noteEl.value = '';
    setMessage(cashMessage, 'Đã ghi nhận nộp tiền về quỹ', 'success');
  } catch (err) {
    setMessage(cashMessage, err.message, 'error');
  }
}
