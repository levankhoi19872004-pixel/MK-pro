import { mobileApi, getUser } from './api.js';
import { bindLogout, money, requireLogin, requireRole, setMessage } from './ui.js';

requireLogin();
requireRole(['delivery']);
bindLogout(document.getElementById('logoutBtn'));

const user = getUser();
document.getElementById('staffInfo').textContent = `${user.name || user.username || 'Nhân viên'} · ${user.role || 'delivery'}`;

const list = document.getElementById('deliveryOrders');
const message = document.getElementById('deliveryMessage');
const cashMessage = document.getElementById('cashMessage');

document.getElementById('reloadOrdersBtn')?.addEventListener('click', loadOrders);
document.getElementById('submitCashBtn')?.addEventListener('click', submitCash);

loadOrders();

async function loadOrders() {
  try {
    setMessage(message, 'Đang tải đơn...');
    const data = await mobileApi.getDeliveryOrders();
    renderOrders(data.items || []);
    setMessage(message, '');
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
}

function renderOrders(items) {
  if (!items.length) {
    list.className = 'order-list empty';
    list.textContent = 'Chưa có đơn cần giao';
    return;
  }

  list.className = 'order-list';
  list.innerHTML = items.map(order => `
    <div class="order-item">
      <strong>${order.code || order.id} - ${order.customerName || ''}</strong>
      <span>${order.phone || ''} · ${order.address || ''}</span>
      <span>Tổng: ${money(order.totalAmount)} · Đã thu: ${money(order.paidAmount)} · Còn thu: ${money(order.amount)}</span>
      <details>
        <summary>Chi tiết hàng</summary>
        <div class="mini-list">
          ${(order.items || []).map(item => `<span>${item.productCode || ''} - ${item.productName || ''}: ${item.quantity || 0}</span>`).join('')}
        </div>
      </details>
      <input class="collect-input" data-collect="${order.id}" type="number" min="0" value="${Number(order.amount || 0)}" placeholder="Tiền thực thu" />
      <input class="note-input" data-note="${order.id}" type="text" placeholder="Ghi chú giao hàng" />
      <div class="row-actions">
        <button class="primary-btn" data-ok="${order.id}">Giao thành công</button>
        <button class="danger-btn" data-fail="${order.id}">Thất bại</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('[data-ok]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelivery(btn.dataset.ok, 'success'));
  });
  list.querySelectorAll('[data-fail]').forEach(btn => {
    btn.addEventListener('click', () => confirmDelivery(btn.dataset.fail, 'failed'));
  });
}

async function confirmDelivery(orderId, status) {
  const collectInput = list.querySelector(`[data-collect="${orderId}"]`);
  const noteInput = list.querySelector(`[data-note="${orderId}"]`);
  try {
    await mobileApi.confirmDelivery({
      orderId,
      status,
      collectAmount: Number(collectInput?.value || 0),
      note: noteInput?.value || ''
    });
    setMessage(message, 'Đã cập nhật trạng thái giao hàng', 'success');
    loadOrders();
  } catch (err) {
    setMessage(message, err.message, 'error');
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
