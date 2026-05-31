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

function deliveryToNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = String(value ?? '').trim().toLowerCase();
  if (!text) return 0;
  let multiplier = 1;
  if (text.endsWith('k')) {
    multiplier = 1000;
    text = text.slice(0, -1);
  }
  text = text.replace(/\s/g, '');
  if (text.includes(',') && text.includes('.')) {
    // 1,234,567.89 hoặc 1.234.567,89: giữ dấu thập phân cuối cùng.
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    text = text.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(text)) {
    // 500.000 hoặc 500,000 là phân tách hàng nghìn, không phải số thập phân.
    text = text.replace(/[.,]/g, '');
  } else {
    text = text.replace(',', '.');
  }
  const n = Number(text);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * multiplier)) : 0;
}

function deliveryDebtBase(order = {}) {
  return deliveryToNumber(order.debtBeforeCollection ?? order.totalAmount ?? order.amount ?? order.debtAmount ?? 0);
}

function calculateDeliveryDebt(order = {}) {
  return Math.max(0, Math.round(
    deliveryDebtBase(order)
    - deliveryToNumber(order.cashCollected ?? order.cashAmount ?? 0)
    - deliveryToNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0)
    - deliveryToNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0)
    - deliveryToNumber(order.returnAmount ?? order.returnedAmount ?? 0)
  ));
}

function deliveryProcessedAmount(order = {}) {
  return deliveryToNumber(order.cashCollected) + deliveryToNumber(order.bankCollected) + deliveryToNumber(order.rewardAmount) + deliveryToNumber(order.returnAmount);
}

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
  return ['delivered', 'success'].includes(status) || deliveryProcessedAmount(order) > 0;
}


function lineQuantity(item = {}) {
  return deliveryToNumber(item.quantity ?? item.qty ?? item.qtyOrder ?? item.orderQty ?? 0);
}

function linePrice(item = {}) {
  return deliveryToNumber(item.salePrice ?? item.price ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
}

function lineReturnedQty(item = {}) {
  return deliveryToNumber(item.qtyReturn ?? item.returnQuantity ?? item.returnedQty ?? item.returnQty ?? 0);
}

function calculateReturnTotalFromInputs(root = deliveryActionBox) {
  return Array.from(root.querySelectorAll('[data-return-order]')).reduce((sum, input) => {
    const qty = deliveryToNumber(input.value || 0);
    const price = deliveryToNumber(input.dataset.returnPrice || 0);
    return sum + Math.round(qty * price);
  }, 0);
}

function calculateDraftDebt(order = {}) {
  const cash = deliveryToNumber(deliveryActionBox.querySelector(`[data-cash="${order.id}"]`)?.value || 0);
  const bank = deliveryToNumber(deliveryActionBox.querySelector(`[data-bank="${order.id}"]`)?.value || 0);
  const reward = deliveryToNumber(deliveryActionBox.querySelector(`[data-reward="${order.id}"]`)?.value || 0);
  const returned = calculateReturnTotalFromInputs();
  return Math.max(0, Math.round(deliveryDebtBase(order) - cash - bank - reward - returned));
}

function refreshDeliveryDraftTotals(order = {}) {
  const returned = calculateReturnTotalFromInputs();
  const cash = deliveryToNumber(deliveryActionBox.querySelector(`[data-cash="${order.id}"]`)?.value || 0);
  const bank = deliveryToNumber(deliveryActionBox.querySelector(`[data-bank="${order.id}"]`)?.value || 0);
  const reward = deliveryToNumber(deliveryActionBox.querySelector(`[data-reward="${order.id}"]`)?.value || 0);
  const debt = Math.max(0, Math.round(deliveryDebtBase(order) - cash - bank - reward - returned));
  const returnEl = deliveryActionBox.querySelector('[data-return-total]');
  const collectedEl = deliveryActionBox.querySelector('[data-collected-total]');
  const debtEl = deliveryActionBox.querySelector('[data-draft-debt]');
  const statusEl = deliveryActionBox.querySelector('[data-draft-status]');
  if (returnEl) returnEl.textContent = money(returned);
  if (collectedEl) collectedEl.textContent = money(cash + bank + reward + returned);
  if (debtEl) debtEl.textContent = money(debt);
  if (statusEl) {
    statusEl.textContent = debt <= 0 ? 'Đủ tiền / đủ bù trừ' : `Còn nợ ${money(debt)}`;
    statusEl.className = debt <= 0 ? 'settlement-status ok' : 'settlement-status warn';
  }
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


function mergeSavedDeliveryOrder(savedOrder = {}) {
  if (!savedOrder || !savedOrder.id && !savedOrder.code && !savedOrder._id) return;
  const keys = [savedOrder.id, savedOrder._id, savedOrder.code, savedOrder.orderNo, savedOrder.orderCode].map(value => String(value || '')).filter(Boolean);
  state.orders = state.orders.map(order => {
    const orderKeys = [order.id, order._id, order.code, order.orderNo, order.orderCode].map(value => String(value || '')).filter(Boolean);
    return orderKeys.some(key => keys.includes(key)) ? { ...order, ...savedOrder, id: order.id || savedOrder.id || savedOrder._id } : order;
  });
}

function renderKpis() {
  const total = state.orders.length;
  const done = state.orders.filter(isDelivered).length;
  const pending = state.orders.filter(order => !isCompleted(order)).length;
  const debt = state.orders.reduce((sum, order) => sum + calculateDeliveryDebt(order), 0);
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
        <span>Còn thu: ${money(calculateDeliveryDebt(order))}</span>
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
    <span>Tổng tiền: ${money(order.totalAmount)} · Đã xử lý: ${money(deliveryProcessedAmount(order))} · Còn thu: ${money(calculateDeliveryDebt(order))}</span>
    <span>Trạng thái: <b>${statusLabel(order)}</b></span>
  `;
}

function renderActionForm(order) {
  const existingCash = deliveryToNumber(order.cashCollected ?? order.cashAmount ?? 0);
  const existingBank = deliveryToNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0);
  const existingReward = deliveryToNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0);
  const currentReturn = deliveryToNumber(order.returnAmount ?? order.returnedAmount ?? 0);
  const items = Array.isArray(order.items) ? order.items : [];
  const returnLocked=Boolean(order.returnLocked || order.masterReturnOrderId || order.masterReturnOrderCode || String(order.returnMergeStatus||'').toLowerCase()==='merged');
  const returnLockMessage=order.returnLockMessage || (returnLocked ? 'Phiếu trả hàng đã gộp đơn tổng/kho đang xử lý, không được sửa hàng trả.' : '');
  deliveryActionBox.innerHTML = `
    <section class="delivery-block delivery-customer-block">
      <h3>Thông tin khách hàng</h3>
      <strong>${escapeHtml(order.customerName || '')}</strong>
      <span>${escapeHtml(order.phone || '')}</span>
      <span>${escapeHtml(order.address || '')}</span>
      <b>Phải thu: ${money(deliveryDebtBase(order))}</b>
    </section>

    <section class="delivery-block return-panel mobile-return-panel">
      <div class="block-title-row">
        <div>
          <h3>Danh sách hàng trả</h3>
          <p class="return-help">${returnLocked ? escapeHtml(returnLockMessage) : 'Có SL đặt và giá bán. Nhập SL trả, hệ thống tự tính tiền hàng trả.'}</p>
        </div>
        <b data-return-total>${money(currentReturn)}</b>
      </div>
      <div class="mobile-return-scroll">
        ${items.length ? items.map(item => {
          const qty = lineQuantity(item);
          const price = linePrice(item);
          return `
          <div class="mobile-return-line">
            <div class="return-product">
              <strong>${escapeHtml(item.productCode || '')}</strong>
              <span>${escapeHtml(item.productName || '')}</span>
              <small>SL đặt: ${money(qty)} · Giá bán: ${money(price)}</small>
            </div>
            <label>
              <span>SL trả</span>
              <input class="return-qty-input" data-return-order="${escapeHtml(order.id)}" data-return-code="${escapeHtml(item.productCode || item.productId || '')}" data-return-price="${price}" type="number" min="0" max="${qty}" step="1" value="${lineReturnedQty(item)}" inputmode="numeric" ${returnLocked?'disabled readonly':''} />
            </label>
          </div>`;
        }).join('') : '<div class="empty-line">Đơn này chưa có danh sách sản phẩm.</div>'}
      </div>
    </section>

    <section class="delivery-block payment-block">
      <h3>Thu tiền</h3>
      <div class="payment-grid">
        <label>Tiền mặt<input data-cash="${escapeHtml(order.id)}" type="text" value="${money(existingCash)}" inputmode="numeric" /></label>
        <label>Chuyển khoản<input data-bank="${escapeHtml(order.id)}" type="text" value="${money(existingBank)}" inputmode="numeric" /></label>
        <label>Trả thưởng<input data-reward="${escapeHtml(order.id)}" type="text" value="${money(existingReward)}" inputmode="numeric" /></label>
        <label>Trả hàng<input data-return-readonly type="text" value="${money(currentReturn)}" readonly /></label>
      </div>
    </section>

    <section class="delivery-block settlement-block">
      <h3>Tổng kết</h3>
      <div class="settlement-row"><span>Phải thu</span><b>${money(deliveryDebtBase(order))}</b></div>
      <div class="settlement-row"><span>Đã thu / bù trừ</span><b data-collected-total>${money(existingCash + existingBank + existingReward + currentReturn)}</b></div>
      <div class="settlement-row"><span>Còn nợ</span><b data-draft-debt>${money(calculateDeliveryDebt(order))}</b></div>
      <div data-draft-status class="settlement-status ${calculateDeliveryDebt(order) <= 0 ? 'ok' : 'warn'}">${calculateDeliveryDebt(order) <= 0 ? 'Đủ tiền / đủ bù trừ' : `Còn nợ ${money(calculateDeliveryDebt(order))}`}</div>
    </section>

    <input class="note-input" data-note="${escapeHtml(order.id)}" type="text" placeholder="Ghi chú giao hàng / lý do trả hàng" />

    <div class="mobile-sticky-actions">
      <button class="primary-btn" data-save-delivery="${escapeHtml(order.id)}">Lưu / hoàn thành giao</button>
      <button class="danger-btn" data-fail="${escapeHtml(order.id)}">Không giao được</button>
    </div>
  `;

  const refresh = () => {
    refreshDeliveryDraftTotals(order);
    const returnReadonly = deliveryActionBox.querySelector('[data-return-readonly]');
    if (returnReadonly) returnReadonly.value = money(calculateReturnTotalFromInputs());
  };
  deliveryActionBox.querySelectorAll('[data-return-order], [data-cash], [data-bank], [data-reward]').forEach(input => {
    input.addEventListener('input', refresh);
  });
  refresh();

  deliveryActionBox.querySelector('[data-save-delivery]')?.addEventListener('click', btnEvent => saveDeliverySettlement(btnEvent.currentTarget.dataset.saveDelivery));
  deliveryActionBox.querySelector('[data-fail]')?.addEventListener('click', btnEvent => confirmDelivery(btnEvent.currentTarget.dataset.fail, 'failed'));
}

function renderReport() {
  const completed = state.orders.filter(isCompleted);
  const cash = completed.reduce((sum, order) => sum + Number(order.cashCollected || 0), 0);
  const bank = completed.reduce((sum, order) => sum + Number(order.bankCollected || 0), 0);
  const returns = completed.reduce((sum, order) => sum + Number(order.returnAmount || 0), 0);
  const debt = completed.reduce((sum, order) => sum + calculateDeliveryDebt(order), 0);
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
        <span>${statusLabel(order)} · Còn nợ: ${money(calculateDeliveryDebt(order))}</span>
        <span>TM: ${money(order.cashCollected || 0)} · CK: ${money(order.bankCollected || 0)} · Thưởng: ${money(order.rewardAmount || 0)} · Trả: ${money(order.returnAmount || 0)}</span>
      </div>
      <button class="ghost-btn small-btn" data-edit-report="${escapeHtml(order.id)}">Sửa</button>
    </article>
  `).join('');

  reportList.querySelectorAll('[data-edit-report]').forEach(btn => {
    btn.addEventListener('click', () => selectOrder(btn.dataset.editReport, true));
  });
}

async function confirmDelivery(orderId, status, amounts = null) {
  const noteInput = deliveryActionBox.querySelector(`[data-note="${orderId}"]`);
  const cashAmount = amounts ? deliveryToNumber(amounts.cashAmount) : deliveryToNumber(deliveryActionBox.querySelector(`[data-cash="${orderId}"]`)?.value || 0);
  const bankAmount = amounts ? deliveryToNumber(amounts.bankAmount) : deliveryToNumber(deliveryActionBox.querySelector(`[data-bank="${orderId}"]`)?.value || 0);
  const rewardAmount = amounts ? deliveryToNumber(amounts.rewardAmount) : deliveryToNumber(deliveryActionBox.querySelector(`[data-reward="${orderId}"]`)?.value || 0);
  try {
    const result = await mobileApi.confirmDelivery({
      orderId,
      status,
      cashAmount,
      bankAmount,
      rewardAmount,
      collectAmount: cashAmount + bankAmount,
      collectionMethod: bankAmount > 0 && cashAmount <= 0 ? 'transfer' : 'cash',
      note: noteInput?.value || ''
    });
    mergeSavedDeliveryOrder(result.order);
    setMessage(actionMessage, status === 'failed' ? 'Đã ghi nhận không giao được' : 'Đã lưu xử lý giao hàng', 'success');
    await loadOrders();
    showTab(status === 'failed' ? 'report' : 'report');
  } catch (err) {
    setMessage(actionMessage, err.message, 'error');
  }
}

async function saveDeliverySettlement(orderId) {
  const order = state.orders.find(item => String(item.id) === String(orderId) || String(item.code) === String(orderId));
  if (!order) {
    setMessage(actionMessage, 'Không tìm thấy đơn đang chọn', 'error');
    return;
  }
  const noteInput = deliveryActionBox.querySelector(`[data-note="${orderId}"]`);
  const items = Array.from(deliveryActionBox.querySelectorAll(`[data-return-order="${orderId}"]`))
    .map(input => {
      const maxQty = deliveryToNumber(input.getAttribute('max') || 0);
      const qtyReturn = deliveryToNumber(input.value || 0);
      return {
        productCode: input.dataset.returnCode,
        qtyReturn,
        maxQty
      };
    })
    .filter(item => item.qtyReturn > 0);
  const invalidItem = items.find(item => item.qtyReturn > item.maxQty);
  if (invalidItem) {
    setMessage(actionMessage, `Số lượng trả của ${invalidItem.productCode} không được lớn hơn số lượng đặt`, 'error');
    return;
  }
  const cashAmount = deliveryToNumber(deliveryActionBox.querySelector(`[data-cash="${orderId}"]`)?.value || 0);
  const bankAmount = deliveryToNumber(deliveryActionBox.querySelector(`[data-bank="${orderId}"]`)?.value || 0);
  const rewardAmount = deliveryToNumber(deliveryActionBox.querySelector(`[data-reward="${orderId}"]`)?.value || 0);
  try {
    if (items.length && !order.returnLocked) {
      await mobileApi.createDeliveryReturn({
        orderId,
        returnType: 'partial',
        items,
        note: noteInput?.value || ''
      });
    }
    const result = await mobileApi.confirmDelivery({
      orderId,
      status: 'success',
      cashAmount,
      bankAmount,
      rewardAmount,
      collectAmount: cashAmount + bankAmount,
      collectionMethod: bankAmount > 0 && cashAmount <= 0 ? 'transfer' : 'cash',
      note: noteInput?.value || ''
    });
    mergeSavedDeliveryOrder(result.order);
    setMessage(actionMessage, 'Đã lưu thu tiền, hàng trả và hoàn thành giao hàng', 'success');
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
  const order = state.orders.find(item => String(item.id) === String(orderId) || String(item.code) === String(orderId));
  if (order?.returnLocked) {
    setMessage(actionMessage, order.returnLockMessage || 'Phiếu trả hàng đã gộp đơn tổng/kho đang xử lý, không được sửa hàng trả.', 'error');
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
