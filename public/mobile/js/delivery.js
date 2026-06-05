import { mobileApi, getUser } from './api.js';
import { bindLogout, money, requireLogin, requireRole, setMessage } from './ui.js';

requireLogin();
requireRole(['delivery']);
bindLogout(document.getElementById('logoutBtn'));

const user = getUser();
document.getElementById('staffInfo').textContent = `${user.name || user.username || 'Nhân viên'} · ${user.role || 'delivery'}`;

const els = {
  list: document.getElementById('deliveryOrders'),
  reportList: document.getElementById('deliveryReportList'),
  message: document.getElementById('deliveryMessage'),
  productMessage: document.getElementById('deliveryProductMessage'),
  actionMessage: document.getElementById('deliveryActionMessage'),
  cashMessage: document.getElementById('cashMessage'),
  date: document.getElementById('deliveryDateInput'),
  formula: document.getElementById('deliveryFormula'),
  selectedOrderBox: document.getElementById('selectedOrderBox'),
  productSelectedOrderBox: document.getElementById('productSelectedOrderBox'),
  productBox: document.getElementById('deliveryProductBox'),
  actionBox: document.getElementById('deliveryActionBox'),
  kpiTotalOrders: document.getElementById('kpiTotalOrders'),
  kpiDoneOrders: document.getElementById('kpiDoneOrders'),
  kpiPendingOrders: document.getElementById('kpiPendingOrders'),
  kpiDebtAmount: document.getElementById('kpiDebtAmount'),
  reportCashAmount: document.getElementById('reportCashAmount'),
  reportBankAmount: document.getElementById('reportBankAmount'),
  reportReturnAmount: document.getElementById('reportReturnAmount'),
  reportDebtAmount: document.getElementById('reportDebtAmount'),
  reportTodayCashAmount: document.getElementById('reportTodayCashAmount'),
  reportTodayBankAmount: document.getElementById('reportTodayBankAmount'),
  reportOldDebtCashAmount: document.getElementById('reportOldDebtCashAmount'),
  reportOldDebtBankAmount: document.getElementById('reportOldDebtBankAmount')
};

const state = { orders: [], selectedOrderId: '' };

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  let text = String(value ?? '').trim().toLowerCase();
  if (!text) return 0;
  let multiplier = 1;
  if (text.endsWith('k')) {
    multiplier = 1000;
    text = text.slice(0, -1);
  }
  text = text.replace(/\s/g, '');
  if (text.includes(',') && text.includes('.')) {
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    text = text.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(text)) {
    text = text.replace(/[.,]/g, '');
  } else {
    text = text.replace(',', '.');
  }
  const n = Number(text);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * multiplier)) : 0;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function orderKey(order = {}) {
  return String(order.id || order._id || order.code || order.orderCode || '').trim();
}

function lineCode(item = {}) {
  return String(item.productCode || item.code || item.productId || item.sku || '').trim();
}

function lineName(item = {}) {
  return String(item.productName || item.name || item.product || '').trim();
}

function lineQty(item = {}) {
  return toNumber(item.quantity ?? item.qty ?? item.qtyOrder ?? item.orderQty ?? 0);
}

function linePrice(item = {}) {
  return toNumber(item.salePrice ?? item.price ?? item.unitPrice ?? item.finalPrice ?? item.giaBan ?? 0);
}

function lineReturnQty(item = {}) {
  return toNumber(item.qtyReturn ?? item.returnQty ?? item.returnQuantity ?? item.returnedQty ?? 0);
}

function returnAmount(order = {}) {
  return toNumber(order.returnAmount ?? order.totalReturnAmount ?? order.returnedAmount ?? 0);
}

function cashAmount(order = {}) {
  return toNumber(order.cashCollected ?? order.cashAmount ?? 0);
}

function bankAmount(order = {}) {
  return toNumber(order.bankCollected ?? order.bankAmount ?? order.transferAmount ?? 0);
}

function rewardAmount(order = {}) {
  return toNumber(order.rewardAmount ?? order.bonusAmount ?? 0);
}

function totalAmount(order = {}) {
  return toNumber(order.totalAmount ?? order.total ?? order.amount ?? order.grandTotal ?? 0);
}

function debtAmount(order = {}) {
  const backendDebt = toNumber(order.debtAmount ?? order.debt ?? 0);
  if (backendDebt > 0) return backendDebt;
  return Math.max(0, totalAmount(order) - cashAmount(order) - bankAmount(order) - rewardAmount(order) - returnAmount(order));
}

function processedAmount(order = {}) {
  return cashAmount(order) + bankAmount(order) + rewardAmount(order) + returnAmount(order);
}

function statusText(order = {}) {
  const status = String(order.deliveryStatus || order.visualStatus || order.status || '').toLowerCase();
  if (['delivered', 'success'].includes(status)) return 'Đã giao';
  if (['partial_return'].includes(status)) return 'Trả một phần';
  if (['returned'].includes(status)) return 'Trả cả đơn';
  if (['failed', 'delivery_failed'].includes(status)) return 'Không giao';
  if (processedAmount(order) > 0) return 'Đã xử lý';
  return 'Chờ giao';
}

function isDone(order = {}) {
  const status = String(order.deliveryStatus || order.visualStatus || order.status || '').toLowerCase();
  return ['delivered', 'success', 'partial_return', 'returned', 'failed', 'delivery_failed'].includes(status) || processedAmount(order) > 0;
}

function showTab(tabName) {
  document.querySelectorAll('[data-delivery-tab]').forEach((btn) => btn.classList.toggle('active', btn.dataset.deliveryTab === tabName));
  document.querySelectorAll('.delivery-panel').forEach((panel) => panel.classList.remove('active'));
  document.getElementById(`delivery${tabName.charAt(0).toUpperCase()}${tabName.slice(1)}Panel`)?.classList.add('active');
  if (tabName === 'report') renderReport();
}

function setBusy(button, busy, text = 'Đang lưu...') {
  if (!button) return;
  if (busy) {
    button.dataset.oldText = button.textContent || '';
    button.disabled = true;
    button.textContent = text;
  } else {
    button.disabled = false;
    if (button.dataset.oldText) button.textContent = button.dataset.oldText;
    delete button.dataset.oldText;
  }
}

function mergeOrder(saved = {}) {
  const keys = [saved.id, saved._id, saved.code, saved.orderCode, saved.salesOrderCode].map((v) => String(v || '').trim()).filter(Boolean);
  if (!keys.length) return;
  state.orders = state.orders.map((order) => {
    const orderKeys = [order.id, order._id, order.code, order.orderCode, order.salesOrderCode].map((v) => String(v || '').trim()).filter(Boolean);
    return orderKeys.some((key) => keys.includes(key)) ? { ...order, ...saved, id: order.id || saved.id || saved._id } : order;
  });
}

async function loadOrders() {
  try {
    setMessage(els.message, 'Đang tải đơn...');
    const selectedDate = els.date?.value || todayValue();
    const data = await mobileApi.getDeliveryOrders({ date: selectedDate, includeCompleted: '1' });
    state.orders = Array.isArray(data.items) ? data.items : [];
    if (els.formula) els.formula.textContent = data.formula || 'App lọc theo ngày giao + nhân viên giao đang đăng nhập.';
    renderOrders();
    renderKpis();
    renderReport();
    if (state.selectedOrderId) selectOrder(state.selectedOrderId, false);
    setMessage(els.message, '');
  } catch (err) {
    setMessage(els.message, err.message || 'Không tải được đơn', 'error');
  }
}

function renderKpis() {
  const total = state.orders.length;
  const done = state.orders.filter(isDone).length;
  const pending = Math.max(0, total - done);
  const debt = state.orders.reduce((sum, order) => sum + debtAmount(order), 0);
  if (els.kpiTotalOrders) els.kpiTotalOrders.textContent = total;
  if (els.kpiDoneOrders) els.kpiDoneOrders.textContent = done;
  if (els.kpiPendingOrders) els.kpiPendingOrders.textContent = pending;
  if (els.kpiDebtAmount) els.kpiDebtAmount.textContent = money(debt);
}

function renderOrders() {
  if (!els.list) return;
  if (!state.orders.length) {
    els.list.className = 'order-list empty';
    els.list.textContent = `Không có đơn giao trong ngày ${els.date?.value || ''}`;
    return;
  }
  els.list.className = 'order-list delivery-list-cards';
  els.list.innerHTML = state.orders.map((order) => `
    <article class="delivery-mini-card ${isDone(order) ? 'done' : 'pending'}">
      <div class="delivery-mini-head">
        <div>
          <strong>${escapeHtml(order.code || order.id)} - ${escapeHtml(order.customerName || '')}</strong>
          <span>${escapeHtml(order.phone || '')} · ${escapeHtml(order.address || '')}</span>
        </div>
        <b>${statusText(order)}</b>
      </div>
      <div class="delivery-mini-money">
        <span>Tổng: ${money(totalAmount(order))}</span>
        <span>Hàng trả: ${money(returnAmount(order))}</span>
        <span>Còn thu: ${money(debtAmount(order))}</span>
      </div>
      <div class="delivery-mini-meta">
        <span>Ngày giao: ${escapeHtml(order.deliveryDate || els.date?.value || '')}</span>
        <span>NVBH: ${escapeHtml(order.salesmanName || order.salesStaffName || '')}</span>
      </div>
      <button class="primary-btn full-btn" data-select-order="${escapeHtml(orderKey(order))}" type="button">Xem hàng giao</button>
    </article>
  `).join('');
  els.list.querySelectorAll('[data-select-order]').forEach((btn) => btn.addEventListener('click', () => selectOrder(btn.dataset.selectOrder, true)));
}

function findOrder(id) {
  return state.orders.find((order) => [order.id, order._id, order.code, order.orderCode, order.salesOrderCode].map((v) => String(v || '').trim()).includes(String(id || '').trim()));
}

function summaryHtml(order = {}) {
  return `
    <strong>${escapeHtml(order.code || order.id)} - ${escapeHtml(order.customerName || '')}</strong>
    <span>${escapeHtml(order.phone || '')} · ${escapeHtml(order.address || '')}</span>
    <span>Tổng tiền: ${money(totalAmount(order))} · Đã xử lý: ${money(processedAmount(order))} · Hàng trả: ${money(returnAmount(order))} · Còn thu: ${money(debtAmount(order))}</span>
    <span>Trạng thái: <b>${statusText(order)}</b></span>
  `;
}

function selectOrder(id, openProducts = true) {
  const order = findOrder(id);
  if (!order) {
    state.selectedOrderId = '';
    if (els.selectedOrderBox) {
      els.selectedOrderBox.className = 'selected-delivery-box empty';
      els.selectedOrderBox.textContent = 'Đơn đã chọn không còn trong danh sách.';
    }
    if (els.productSelectedOrderBox) {
      els.productSelectedOrderBox.className = 'selected-delivery-box empty';
      els.productSelectedOrderBox.textContent = 'Đơn đã chọn không còn trong danh sách.';
    }
    if (els.productBox) els.productBox.innerHTML = '';
    if (els.actionBox) els.actionBox.innerHTML = '';
    return;
  }
  state.selectedOrderId = orderKey(order);
  if (els.selectedOrderBox) {
    els.selectedOrderBox.className = 'selected-delivery-box';
    els.selectedOrderBox.innerHTML = summaryHtml(order);
  }
  if (els.productSelectedOrderBox) {
    els.productSelectedOrderBox.className = 'selected-delivery-box';
    els.productSelectedOrderBox.innerHTML = summaryHtml(order);
  }
  renderProductForm(order);
  renderCollectForm(order);
  if (openProducts) showTab('products');
}

function renderProductForm(order = {}) {
  if (!els.productBox) return;
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) {
    els.productBox.innerHTML = '<div class="empty">Đơn này chưa có danh sách sản phẩm.</div>';
    return;
  }
  const locked = Boolean(order.returnLocked);
  els.productBox.innerHTML = `
    ${locked ? `<p class="message error">${escapeHtml(order.returnLockMessage || 'Phiếu trả hàng đã khóa, không được sửa.')}</p>` : ''}
    <div class="delivery-product-list">
      ${items.map((item) => {
        const code = lineCode(item);
        const qty = lineQty(item);
        const price = linePrice(item);
        return `
          <div class="delivery-product-row">
            <div>
              <strong>${escapeHtml(lineName(item) || code)}</strong>
              <span>Mã: ${escapeHtml(code)} · SL giao: ${qty} · Giá: ${money(price)}</span>
            </div>
            <label>SL trả
              <input type="number" min="0" max="${qty}" step="1" value="${lineReturnQty(item)}" data-return-input="1" data-code="${escapeHtml(code)}" data-max="${qty}" data-price="${price}" ${locked ? 'disabled' : ''} />
            </label>
          </div>
        `;
      }).join('')}
    </div>
    <textarea rows="2" data-product-note placeholder="Ghi chú hàng giao / hàng trả"></textarea>
    <div class="delivery-settlement-total">Tổng hàng trả đang nhập: <strong data-product-return-total>${money(0)}</strong></div>
    <button class="primary-btn full-btn" data-save-products="${escapeHtml(orderKey(order))}" type="button" ${locked ? 'disabled' : ''}>Xác nhận hàng giao</button>
    <button class="ghost-btn full-btn" data-return-full="${escapeHtml(orderKey(order))}" type="button" ${locked ? 'disabled' : ''}>Không giao - trả cả đơn</button>
  `;
  const refresh = () => {
    const total = readPositiveReturnItems().reduce((sum, item) => sum + item.qtyReturn * item.price, 0);
    const target = els.productBox.querySelector('[data-product-return-total]');
    if (target) target.textContent = money(total);
  };
  els.productBox.querySelectorAll('[data-return-input]').forEach((input) => input.addEventListener('input', refresh));
  els.productBox.querySelector('[data-save-products]')?.addEventListener('click', (event) => saveProducts(event.currentTarget.dataset.saveProducts, event.currentTarget));
  els.productBox.querySelector('[data-return-full]')?.addEventListener('click', (event) => returnFullOrder(event.currentTarget.dataset.returnFull, event.currentTarget));
  refresh();
}

function readPositiveReturnItems() {
  return Array.from(els.productBox?.querySelectorAll('[data-return-input]') || []).map((input) => {
    const qtyReturn = toNumber(input.value || 0);
    const maxQty = toNumber(input.dataset.max || 0);
    return {
      productCode: input.dataset.code || '',
      qtyReturn,
      maxQty,
      price: toNumber(input.dataset.price || 0)
    };
  }).filter((item) => item.qtyReturn > 0);
}

async function saveProducts(orderId, button) {
  const order = findOrder(orderId);
  if (!order) return setMessage(els.productMessage, 'Không tìm thấy đơn đang chọn', 'error');
  if (order.returnLocked) return setMessage(els.productMessage, order.returnLockMessage || 'Phiếu trả đã khóa', 'error');
  const items = readPositiveReturnItems();
  const invalid = items.find((item) => item.qtyReturn > item.maxQty);
  if (invalid) return setMessage(els.productMessage, `Số lượng trả của ${invalid.productCode} lớn hơn số lượng giao`, 'error');
  const note = els.productBox?.querySelector('[data-product-note]')?.value || '';
  try {
    setBusy(button, true);
    // Luồng mới: chỉ gửi dòng có SL trả > 0. Nếu không có hàng trả, gửi items rỗng để backend clear sạch phiếu cũ.
    const ret = await mobileApi.createDeliveryReturn({
      orderId,
      returnType: 'partial',
      items,
      replaceReturnItems: true,
      allowEmptyReturn: true,
      note
    });
    if (ret?.order) mergeOrder(ret.order);
    const confirmed = await mobileApi.confirmDelivery({
      orderId,
      status: 'success',
      cashAmount: cashAmount(order),
      bankAmount: bankAmount(order),
      rewardAmount: rewardAmount(order),
      collectAmount: cashAmount(order) + bankAmount(order),
      collectionMethod: bankAmount(order) > 0 && cashAmount(order) <= 0 ? 'transfer' : 'cash',
      note
    });
    if (confirmed?.order) mergeOrder(confirmed.order);
    setMessage(els.productMessage, 'Đã xác nhận hàng giao', 'success');
    await loadOrders();
    showTab('collect');
  } catch (err) {
    setMessage(els.productMessage, err.message || 'Không lưu được hàng giao', 'error');
  } finally {
    setBusy(button, false);
  }
}

async function returnFullOrder(orderId, button) {
  const order = findOrder(orderId);
  if (!order) return setMessage(els.productMessage, 'Không tìm thấy đơn đang chọn', 'error');
  if (!confirm('Xác nhận không giao và trả cả đơn?')) return;
  try {
    setBusy(button, true);
    const ret = await mobileApi.createDeliveryReturn({ orderId, returnType: 'full', items: [], note: 'Không giao được - trả cả đơn từ app giao hàng' });
    if (ret?.order) mergeOrder(ret.order);
    await loadOrders();
    setMessage(els.productMessage, 'Đã ghi nhận trả cả đơn', 'success');
    showTab('report');
  } catch (err) {
    setMessage(els.productMessage, err.message || 'Không tạo được phiếu trả cả đơn', 'error');
  } finally {
    setBusy(button, false);
  }
}

function renderCollectForm(order = {}) {
  if (!els.actionBox) return;
  els.actionBox.innerHTML = `
    <div class="delivery-money-form">
      <label>Tiền mặt
        <input type="number" min="0" step="1000" data-cash-input value="${cashAmount(order)}" />
      </label>
      <label>Chuyển khoản
        <input type="number" min="0" step="1000" data-bank-input value="${bankAmount(order)}" />
      </label>
      <label>Trả thưởng
        <input type="number" min="0" step="1000" data-reward-input value="${rewardAmount(order)}" />
      </label>
      <textarea rows="2" data-collect-note placeholder="Ghi chú thu tiền"></textarea>
      <div class="delivery-settlement-total">
        <span>Tổng đơn: <strong>${money(totalAmount(order))}</strong></span>
        <span>Hàng trả: <strong>${money(returnAmount(order))}</strong></span>
        <span>Còn nợ dự kiến: <strong data-collect-debt>${money(debtAmount(order))}</strong></span>
      </div>
      <button class="primary-btn full-btn" data-save-collect="${escapeHtml(orderKey(order))}" type="button">Lưu thu tiền</button>
      <button class="ghost-btn full-btn" data-failed="${escapeHtml(orderKey(order))}" type="button">Không giao được</button>
    </div>
  `;
  const refresh = () => {
    const cash = toNumber(els.actionBox.querySelector('[data-cash-input]')?.value || 0);
    const bank = toNumber(els.actionBox.querySelector('[data-bank-input]')?.value || 0);
    const reward = toNumber(els.actionBox.querySelector('[data-reward-input]')?.value || 0);
    const debt = Math.max(0, totalAmount(order) - returnAmount(order) - cash - bank - reward);
    const target = els.actionBox.querySelector('[data-collect-debt]');
    if (target) target.textContent = money(debt);
  };
  els.actionBox.querySelectorAll('input').forEach((input) => input.addEventListener('input', refresh));
  els.actionBox.querySelector('[data-save-collect]')?.addEventListener('click', (event) => saveCollect(event.currentTarget.dataset.saveCollect, event.currentTarget));
  els.actionBox.querySelector('[data-failed]')?.addEventListener('click', (event) => markFailed(event.currentTarget.dataset.failed, event.currentTarget));
  refresh();
}

async function saveCollect(orderId, button) {
  const order = findOrder(orderId);
  if (!order) return setMessage(els.actionMessage, 'Không tìm thấy đơn đang chọn', 'error');
  const cash = toNumber(els.actionBox.querySelector('[data-cash-input]')?.value || 0);
  const bank = toNumber(els.actionBox.querySelector('[data-bank-input]')?.value || 0);
  const reward = toNumber(els.actionBox.querySelector('[data-reward-input]')?.value || 0);
  const note = els.actionBox.querySelector('[data-collect-note]')?.value || '';
  try {
    setBusy(button, true);
    // Luồng mới: tab Thu tiền chỉ lưu tiền, tuyệt đối không tạo/sửa phiếu hàng trả.
    const result = await mobileApi.confirmDelivery({
      orderId,
      status: 'success',
      cashAmount: cash,
      bankAmount: bank,
      rewardAmount: reward,
      collectAmount: cash + bank,
      collectionMethod: bank > 0 && cash <= 0 ? 'transfer' : 'cash',
      note
    });
    if (result?.order) mergeOrder(result.order);
    setMessage(els.actionMessage, 'Đã lưu thu tiền', 'success');
    await loadOrders();
    showTab('report');
  } catch (err) {
    setMessage(els.actionMessage, err.message || 'Không lưu được thu tiền', 'error');
  } finally {
    setBusy(button, false);
  }
}

async function markFailed(orderId, button) {
  try {
    setBusy(button, true);
    const result = await mobileApi.confirmDelivery({ orderId, status: 'failed', cashAmount: 0, bankAmount: 0, rewardAmount: 0, collectAmount: 0, note: 'Không giao được từ app giao hàng' });
    if (result?.order) mergeOrder(result.order);
    setMessage(els.actionMessage, 'Đã ghi nhận không giao được', 'success');
    await loadOrders();
    showTab('report');
  } catch (err) {
    setMessage(els.actionMessage, err.message || 'Không lưu được trạng thái không giao', 'error');
  } finally {
    setBusy(button, false);
  }
}

function renderReport() {
  const totals = state.orders.reduce((acc, order) => {
    acc.cash += cashAmount(order);
    acc.bank += bankAmount(order);
    acc.reward += rewardAmount(order);
    acc.returns += returnAmount(order);
    acc.debt += debtAmount(order);
    return acc;
  }, { cash: 0, bank: 0, reward: 0, returns: 0, debt: 0 });
  if (els.reportCashAmount) els.reportCashAmount.textContent = money(totals.cash);
  if (els.reportBankAmount) els.reportBankAmount.textContent = money(totals.bank);
  if (els.reportReturnAmount) els.reportReturnAmount.textContent = money(totals.returns);
  if (els.reportDebtAmount) els.reportDebtAmount.textContent = money(totals.debt);
  if (els.reportTodayCashAmount) els.reportTodayCashAmount.textContent = money(totals.cash);
  if (els.reportTodayBankAmount) els.reportTodayBankAmount.textContent = money(totals.bank);
  if (els.reportOldDebtCashAmount) els.reportOldDebtCashAmount.textContent = money(0);
  if (els.reportOldDebtBankAmount) els.reportOldDebtBankAmount.textContent = money(0);

  if (!els.reportList) return;
  const rows = state.orders.filter(isDone);
  if (!rows.length) {
    els.reportList.className = 'order-list delivery-report-list empty';
    els.reportList.textContent = 'Chưa có dữ liệu báo cáo.';
    return;
  }
  els.reportList.className = 'order-list delivery-report-list';
  els.reportList.innerHTML = rows.map((order) => `
    <article class="delivery-mini-card done">
      <div class="delivery-mini-head">
        <div>
          <strong>${escapeHtml(order.code || order.id)} - ${escapeHtml(order.customerName || '')}</strong>
          <span>${statusText(order)}</span>
        </div>
        <b>${money(processedAmount(order))}</b>
      </div>
      <div class="delivery-mini-money">
        <span>TM ${money(cashAmount(order))}</span>
        <span>CK ${money(bankAmount(order))}</span>
        <span>Trả ${money(returnAmount(order))}</span>
        <span>Còn nợ ${money(debtAmount(order))}</span>
      </div>
      <button class="ghost-btn small-btn" data-edit-report="${escapeHtml(orderKey(order))}" type="button">Sửa</button>
    </article>
  `).join('');
  els.reportList.querySelectorAll('[data-edit-report]').forEach((btn) => btn.addEventListener('click', () => selectOrder(btn.dataset.editReport, true)));
}

async function submitCash() {
  const amountInput = document.getElementById('cashAmountInput');
  const noteInput = document.getElementById('cashNoteInput');
  const amount = toNumber(amountInput?.value || 0);
  if (amount <= 0) return setMessage(els.cashMessage, 'Nhập số tiền nộp quỹ lớn hơn 0', 'error');
  try {
    const result = await mobileApi.submitCash({ amount, note: noteInput?.value || '' });
    setMessage(els.cashMessage, result.message || 'Đã ghi nhận nộp quỹ', 'success');
    if (amountInput) amountInput.value = '';
    if (noteInput) noteInput.value = '';
  } catch (err) {
    setMessage(els.cashMessage, err.message || 'Không nộp được quỹ', 'error');
  }
}

document.getElementById('reloadOrdersBtn')?.addEventListener('click', loadOrders);
document.getElementById('submitCashBtn')?.addEventListener('click', submitCash);
document.getElementById('todayOrdersBtn')?.addEventListener('click', () => {
  if (els.date) els.date.value = todayValue();
  loadOrders();
});
els.date?.addEventListener('change', loadOrders);
document.querySelectorAll('[data-delivery-tab]').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.deliveryTab)));

if (els.date) els.date.value = todayValue();
loadOrders();
