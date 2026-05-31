import { mobileApi, getUser } from './api.js';
import { bindLogout, money, requireLogin, requireRole, setMessage } from './ui.js';

requireLogin();
requireRole(['delivery']);
bindLogout(document.getElementById('logoutBtn'));

const user = getUser();
document.getElementById('staffInfo').textContent = `${user.name || user.username || 'Nhân viên'} · ${user.role || 'delivery'}`;

const state = {
  orders: [],
  selectedOrderId: '',
  customerDebtRows: [],
  customerDebtLoading: false
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
const productSelectedOrderBox = document.getElementById('productSelectedOrderBox');
const deliveryProductBox = document.getElementById('deliveryProductBox');
const productMessage = document.getElementById('deliveryProductMessage');

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
  const returned = deliveryToNumber(order.returnAmount ?? order.returnedAmount ?? 0);
  return Math.max(0, Math.round(deliveryDebtBase(order) - cash - bank - reward - returned));
}

function selectedOldDebtRows() {
  return Array.from(deliveryActionBox.querySelectorAll('[data-old-debt-check]:checked')).map((input) => {
    const key = String(input.value || '').trim();
    return state.customerDebtRows.find((row) => [row.orderId, row.orderCode].map((v) => String(v || '').trim()).includes(key));
  }).filter(Boolean);
}

function selectedOldDebtTotal() {
  return selectedOldDebtRows().reduce((sum, row) => sum + deliveryToNumber(row.debt), 0);
}

function selectedOldDebtIds() {
  return selectedOldDebtRows().map((row) => String(row.orderId || row.orderCode || '').trim()).filter(Boolean);
}

function currentOrderDue(order = {}) {
  return Math.max(0, deliveryDebtBase(order) - deliveryToNumber(order.returnAmount ?? order.returnedAmount ?? 0));
}


function refreshDeliveryDraftTotals(order = {}) {
  const returned = deliveryToNumber(order.returnAmount ?? order.returnedAmount ?? 0);
  const cash = deliveryToNumber(deliveryActionBox.querySelector(`[data-cash="${order.id}"]`)?.value || 0);
  const bank = deliveryToNumber(deliveryActionBox.querySelector(`[data-bank="${order.id}"]`)?.value || 0);
  const reward = deliveryToNumber(deliveryActionBox.querySelector(`[data-reward="${order.id}"]`)?.value || 0);
  const oldDebt = selectedOldDebtTotal();
  const currentDue = currentOrderDue(order);
  const totalDue = currentDue + oldDebt;
  const debt = Math.max(0, Math.round(totalDue - cash - bank - reward));
  const oldDebtEls = deliveryActionBox.querySelectorAll('[data-old-debt-total]');
  const totalDueEl = deliveryActionBox.querySelector('[data-total-due]');
  const returnEl = deliveryActionBox.querySelector('[data-return-total]');
  const collectedEl = deliveryActionBox.querySelector('[data-collected-total]');
  const debtEl = deliveryActionBox.querySelector('[data-draft-debt]');
  const statusEl = deliveryActionBox.querySelector('[data-draft-status]');
  oldDebtEls.forEach((el) => { el.textContent = money(oldDebt); });
  if (totalDueEl) totalDueEl.textContent = money(totalDue);
  if (returnEl) returnEl.textContent = money(returned);
  if (collectedEl) collectedEl.textContent = money(cash + bank + reward);
  if (debtEl) debtEl.textContent = money(debt);
  if (statusEl) {
    statusEl.textContent = debt <= 0 ? 'Đủ tiền' : `Còn nợ ${money(debt)}`;
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
      <button class="primary-btn full-btn" data-select-order="${escapeHtml(order.id)}">Xem hàng giao</button>
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
    if (productSelectedOrderBox) {
      productSelectedOrderBox.className = 'selected-delivery-box empty';
      productSelectedOrderBox.textContent = 'Đơn đã chọn không còn trong danh sách ngày này.';
    }
    deliveryActionBox.innerHTML = '';
    if (deliveryProductBox) deliveryProductBox.innerHTML = '';
    return;
  }
  state.selectedOrderId = order.id;
  renderSelectedOrder(order);
  renderProductForm(order);
  state.customerDebtRows = [];
  renderActionForm(order);
  loadCustomerDebtsForOrder(order);
  if (openCollectTab) showTab('products');
}

function deliveryOrderSummaryHtml(order) {
  return `
    <strong>${escapeHtml(order.code || order.id)} - ${escapeHtml(order.customerName || '')}</strong>
    <span>${escapeHtml(order.phone || '')} · ${escapeHtml(order.address || '')}</span>
    <span>Ngày giao: ${escapeHtml(order.deliveryDate || '')} · Tuyến: ${escapeHtml(order.routeName || 'Chưa gán')}</span>
    <span>Tổng tiền: ${money(order.totalAmount)} · Đã xử lý: ${money(deliveryProcessedAmount(order))} · Còn thu: ${money(calculateDeliveryDebt(order))}</span>
    <span>Trạng thái: <b>${statusLabel(order)}</b></span>
  `;
}

function renderSelectedOrder(order) {
  selectedOrderBox.className = 'selected-delivery-box';
  selectedOrderBox.innerHTML = deliveryOrderSummaryHtml(order);
  if (productSelectedOrderBox) {
    productSelectedOrderBox.className = 'selected-delivery-box';
    productSelectedOrderBox.innerHTML = deliveryOrderSummaryHtml(order);
  }
}

function renderProductForm(order) {
  const currentReturn = deliveryToNumber(order.returnAmount ?? order.returnedAmount ?? 0);
  const items = Array.isArray(order.items) ? order.items : [];
  const returnLocked = Boolean(order.returnLocked || order.masterReturnOrderId || order.masterReturnOrderCode || String(order.returnMergeStatus || '').toLowerCase() === 'merged');
  const returnLockMessage = order.returnLockMessage || (returnLocked ? 'Phiếu trả hàng đã gộp đơn tổng/kho đang xử lý, không được sửa hàng trả.' : '');
  if (!deliveryProductBox) return;
  deliveryProductBox.innerHTML = `
    <section class="delivery-block return-panel mobile-return-panel">
      <div class="block-title-row">
        <div>
          <h3>Sản phẩm cần giao</h3>
          <p class="return-help">Hiển thị hàng cần giao cho cửa hàng. Nếu có hàng trả, nhập số lượng ở cột SL trả.</p>
          ${returnLocked ? `<p class="return-help warn-text">${escapeHtml(returnLockMessage)}</p>` : ''}
        </div>
        <b data-product-return-total>${money(currentReturn)}</b>
      </div>
      <div class="mobile-return-scroll delivery-products-scroll">
        ${items.length ? items.map(item => {
          const qty = lineQuantity(item);
          const price = linePrice(item);
          return `
          <div class="mobile-return-line delivery-product-line">
            <div class="return-product">
              <strong>${escapeHtml(item.productCode || '')}</strong>
              <span>${escapeHtml(item.productName || '')}</span>
              <small>SL giao: ${money(qty)} · Giá bán: ${money(price)}</small>
            </div>
            <label>
              <span>SL trả</span>
              <input class="return-qty-input" data-return-order="${escapeHtml(order.id)}" data-return-code="${escapeHtml(item.productCode || item.productId || '')}" data-return-price="${price}" type="number" min="0" max="${qty}" step="1" value="${lineReturnedQty(item)}" inputmode="numeric" ${returnLocked ? 'disabled readonly' : ''} />
            </label>
          </div>`;
        }).join('') : '<div class="empty-line">Đơn này chưa có danh sách sản phẩm.</div>'}
      </div>
    </section>

    <input class="note-input" data-product-note="${escapeHtml(order.id)}" type="text" placeholder="Ghi chú giao hàng / lý do trả hàng" />

    <div class="mobile-sticky-actions two-actions">
      <button class="primary-btn" data-confirm-products="${escapeHtml(order.id)}">Xác nhận giao</button>
      <button class="danger-btn" data-no-delivery="${escapeHtml(order.id)}">Không giao</button>
    </div>
  `;

  const refresh = () => {
    const total = calculateReturnTotalFromInputs(deliveryProductBox);
    const returnEl = deliveryProductBox.querySelector('[data-product-return-total]');
    if (returnEl) returnEl.textContent = money(total);
  };
  deliveryProductBox.querySelectorAll('[data-return-order]').forEach(input => input.addEventListener('input', refresh));
  refresh();
  deliveryProductBox.querySelector('[data-confirm-products]')?.addEventListener('click', btnEvent => saveDeliveryProducts(btnEvent.currentTarget.dataset.confirmProducts));
  deliveryProductBox.querySelector('[data-no-delivery]')?.addEventListener('click', btnEvent => markWholeOrderReturned(btnEvent.currentTarget.dataset.noDelivery));
}

async function loadCustomerDebtsForOrder(order = {}) {
  if (!order?.id) return;
  state.customerDebtLoading = true;
  renderActionForm(order);
  try {
    const data = await mobileApi.getDeliveryCustomerDebts({
      currentOrderId: order.id,
      customerId: order.customerId || '',
      customerCode: order.customerCode || '',
      customerName: order.customerName || ''
    });
    if (String(state.selectedOrderId) !== String(order.id)) return;
    state.customerDebtRows = Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    state.customerDebtRows = [];
    setMessage(actionMessage, err.message || 'Không tải được danh sách đơn nợ cũ', 'error');
  } finally {
    state.customerDebtLoading = false;
    if (String(state.selectedOrderId) === String(order.id)) renderActionForm(order);
  }
}

function debtRowsHtml(order = {}) {
  if (state.customerDebtLoading) return '<div class="empty-line">Đang tải danh sách đơn nợ cũ...</div>';
  const rows = state.customerDebtRows || [];
  if (!rows.length) return '<div class="empty-line">Khách này không còn đơn nợ cũ.</div>';
  return rows.map((row) => {
    const key = escapeHtml(row.orderId || row.orderCode || '');
    return `
      <label class="old-debt-line">
        <input type="checkbox" data-old-debt-check value="${key}" />
        <span class="old-debt-info">
          <strong>${escapeHtml(row.orderCode || row.orderId || '')}</strong>
          <small>Ngày nợ: ${escapeHtml(String(row.documentDate || '').slice(0, 10) || 'Chưa rõ ngày')}</small>
        </span>
        <b>${money(row.debt || 0)}</b>
      </label>`;
  }).join('');
}

function renderActionForm(order) {
  const existingCash = deliveryToNumber(order.cashCollected ?? order.cashAmount ?? 0);
  const existingBank = deliveryToNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0);
  const existingReward = deliveryToNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0);
  const currentReturn = deliveryToNumber(order.returnAmount ?? order.returnedAmount ?? 0);
  const currentDue = currentOrderDue(order);
  deliveryActionBox.innerHTML = `
    <section class="delivery-block debt-collect-block">
      <div class="block-title-row">
        <div>
          <h3>Đơn nợ cũ của khách</h3>
          <p class="return-help">Tích đơn khách đồng ý trả. Khi thiếu tiền, hệ thống ưu tiên trừ đơn nợ cũ trước rồi mới trừ đơn đang giao.</p>
        </div>
        <b data-old-debt-total>0</b>
      </div>
      <div class="old-debt-scroll">
        ${debtRowsHtml(order)}
      </div>
    </section>

    <section class="delivery-block payment-block">
      <h3>Thu tiền</h3>
      <div class="payment-grid">
        <label>Tiền mặt<input data-cash="${escapeHtml(order.id)}" type="text" value="${money(existingCash)}" inputmode="numeric" /></label>
        <label>Chuyển khoản<input data-bank="${escapeHtml(order.id)}" type="text" value="${money(existingBank)}" inputmode="numeric" /></label>
        <label>Trả thưởng<input data-reward="${escapeHtml(order.id)}" type="text" value="${money(existingReward)}" inputmode="numeric" /></label>
        <label>Hàng trả<input data-return-readonly type="text" value="${money(currentReturn)}" readonly /></label>
      </div>
    </section>

    <section class="delivery-block settlement-block">
      <h3>Tổng kết</h3>
      <div class="settlement-row"><span>Phải thu đơn đang giao</span><b>${money(currentDue)}</b></div>
      <div class="settlement-row"><span>Nợ cũ đã tích</span><b data-old-debt-total>0</b></div>
      <div class="settlement-row"><span>Tổng phải thu</span><b data-total-due>${money(currentDue)}</b></div>
      <div class="settlement-row"><span>Đã nhập thanh toán</span><b data-collected-total>${money(existingCash + existingBank + existingReward)}</b></div>
      <div class="settlement-row"><span>Còn nợ sau thu</span><b data-draft-debt>${money(calculateDeliveryDebt(order))}</b></div>
      <div data-draft-status class="settlement-status ${calculateDeliveryDebt(order) <= 0 ? 'ok' : 'warn'}">${calculateDeliveryDebt(order) <= 0 ? 'Đủ tiền' : `Còn nợ ${money(calculateDeliveryDebt(order))}`}</div>
    </section>

    <input class="note-input" data-note="${escapeHtml(order.id)}" type="text" placeholder="Ghi chú thu tiền" />

    <div class="mobile-sticky-actions">
      <button class="primary-btn" data-save-delivery="${escapeHtml(order.id)}">Lưu thu tiền</button>
      <button class="danger-btn" data-fail="${escapeHtml(order.id)}">Không giao được</button>
    </div>
  `;

  deliveryActionBox.querySelectorAll('[data-cash], [data-bank], [data-reward], [data-old-debt-check]').forEach(input => {
    input.addEventListener('input', () => refreshDeliveryDraftTotals(order));
    input.addEventListener('change', () => refreshDeliveryDraftTotals(order));
  });
  refreshDeliveryDraftTotals(order);

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
      debtOrderIds: selectedOldDebtIds(),
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


async function markWholeOrderReturned(orderId) {
  const order = state.orders.find(item => String(item.id) === String(orderId) || String(item.code) === String(orderId));
  if (!order) {
    setMessage(productMessage || actionMessage, 'Không tìm thấy đơn đang chọn', 'error');
    return;
  }
  if (order.returnLocked) {
    setMessage(productMessage || actionMessage, order.returnLockMessage || 'Phiếu trả hàng đã gộp đơn tổng/kho đang xử lý, không được sửa hàng trả.', 'error');
    return;
  }
  const noteInput = deliveryProductBox?.querySelector(`[data-product-note="${orderId}"]`);
  try {
    await mobileApi.createDeliveryReturn({
      orderId,
      returnType: 'full',
      items: [],
      note: noteInput?.value || 'Không giao được - trả cả đơn từ app giao hàng'
    });
    setMessage(productMessage || actionMessage, 'Đã ghi nhận không giao và trả cả đơn', 'success');
    await loadOrders();
    showTab('report');
  } catch (err) {
    setMessage(productMessage || actionMessage, err.message, 'error');
  }
}

async function saveDeliveryProducts(orderId) {
  const order = state.orders.find(item => String(item.id) === String(orderId) || String(item.code) === String(orderId));
  if (!order) {
    setMessage(productMessage || actionMessage, 'Không tìm thấy đơn đang chọn', 'error');
    return;
  }
  const noteInput = deliveryProductBox?.querySelector(`[data-product-note="${orderId}"]`);
  const items = Array.from(deliveryProductBox?.querySelectorAll(`[data-return-order="${orderId}"]`) || [])
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
    setMessage(productMessage || actionMessage, `Số lượng trả của ${invalidItem.productCode} không được lớn hơn số lượng giao`, 'error');
    return;
  }
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
      cashAmount: deliveryToNumber(order.cashCollected ?? order.cashAmount ?? 0),
      bankAmount: deliveryToNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0),
      rewardAmount: deliveryToNumber(order.rewardAmount ?? order.displayRewardAmount ?? 0),
      collectAmount: deliveryToNumber(order.cashCollected ?? order.cashAmount ?? 0) + deliveryToNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0),
      collectionMethod: deliveryToNumber(order.bankCollected ?? order.transferAmount ?? order.bankAmount ?? 0) > 0 ? 'transfer' : 'cash',
      note: noteInput?.value || ''
    });
    mergeSavedDeliveryOrder(result.order);
    setMessage(productMessage || actionMessage, 'Đã xác nhận hàng giao và hàng trả', 'success');
    await loadOrders();
    showTab('collect');
  } catch (err) {
    setMessage(productMessage || actionMessage, err.message, 'error');
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
      debtOrderIds: selectedOldDebtIds(),
      collectAmount: cashAmount + bankAmount,
      collectionMethod: bankAmount > 0 && cashAmount <= 0 ? 'transfer' : 'cash',
      note: noteInput?.value || ''
    });
    mergeSavedDeliveryOrder(result.order);
    setMessage(actionMessage, 'Đã lưu thu tiền', 'success');
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
