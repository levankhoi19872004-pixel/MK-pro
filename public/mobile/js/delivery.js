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
const deliveryDateInput = document.getElementById('deliveryDateInput');
const todayOrdersBtn = document.getElementById('todayOrdersBtn');
const deliveryFormula = document.getElementById('deliveryFormula');

document.getElementById('reloadOrdersBtn')?.addEventListener('click', loadOrders);
document.getElementById('submitCashBtn')?.addEventListener('click', submitCash);

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
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
    if (deliveryFormula) deliveryFormula.textContent = data.formula || 'App lọc theo ngày giao + nhân viên giao đang đăng nhập.';
    renderOrders(data.items || [], data.date || selectedDate);
    setMessage(message, '');
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
}

function renderOrders(items, selectedDate = '') {
  if (!items.length) {
    list.className = 'order-list empty';
    list.textContent = `Không có đơn giao trong ngày ${selectedDate || 'đã chọn'}`;
    return;
  }

  list.className = 'order-list';
  list.innerHTML = items.map(order => `
    <div class="order-item">
      <strong>${escapeHtml(order.code || order.id)} - ${escapeHtml(order.customerName || '')}</strong>
      <span>${escapeHtml(order.phone || '')} · ${escapeHtml(order.address || '')}</span>
      <span>Ngày giao: ${escapeHtml(order.deliveryDate || 'Hôm nay')} · Tuyến: ${escapeHtml(order.routeName || 'Chưa gán')}</span>
      <span>NV bán: ${escapeHtml(order.salesmanName || order.salesmanCode || 'Chưa gán')} · NV giao: ${escapeHtml(order.deliveryStaffName || order.deliveryStaffCode || 'Tôi')}</span>
      <span>Tổng: ${money(order.totalAmount)} · Đã xử lý: ${money(Number(order.paidAmount || 0) + Number(order.cashCollected || 0) + Number(order.bankCollected || 0) + Number(order.returnAmount || 0))} · Còn thu: ${money(order.amount)}</span>
      <div class="collection-tabs" data-method-wrap="${order.id}">
        <label><input type="radio" name="collectMethod-${order.id}" value="cash" checked /> Tiền mặt</label>
        <label><input type="radio" name="collectMethod-${order.id}" value="transfer" /> Chuyển khoản</label>
      </div>
      <details class="return-panel" open>
        <summary>Hàng trả về trên đơn giao</summary>
        <p class="return-help">Nhập trực tiếp sản phẩm/số lượng khách trả trên đơn này. Khi bấm “Trả 1 phần”, phần mềm tự sinh phiếu returnOrders từ đúng đơn gốc.</p>
        <div class="mini-list return-grid">
          ${(order.items || []).map(item => `
            <div class="return-line">
              <div class="return-product">
                <strong>${escapeHtml(item.productCode || '')}</strong>
                <span>${escapeHtml(item.productName || '')}</span>
                <small>SL trong đơn: ${Number(item.quantity || 0)} · Giá: ${money(item.salePrice || item.price || 0)}</small>
              </div>
              <input class="return-qty-input" data-return-order="${order.id}" data-return-code="${escapeHtml(item.productCode || item.productId || '')}" type="number" min="0" max="${Number(item.quantity || 0)}" step="1" value="0" placeholder="SL trả" />
              <input class="return-reason-input" data-return-reason-order="${order.id}" data-return-reason-code="${escapeHtml(item.productCode || item.productId || '')}" type="text" placeholder="Lý do dòng trả" />
            </div>
          `).join('')}
        </div>
      </details>
      <input class="collect-input" data-collect="${order.id}" type="number" min="0" value="${Number(order.amount || 0)}" placeholder="Tiền thực thu" />
      <input class="note-input" data-note="${order.id}" type="text" placeholder="Ghi chú giao hàng / lý do trả hàng" />
      <div class="row-actions">
        <button class="primary-btn" data-ok="${order.id}">Giao thành công</button>
        <button class="secondary-btn" data-partial-return="${order.id}">Trả 1 phần</button>
        <button class="danger-btn" data-full-return="${order.id}">Trả cả đơn</button>
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
  list.querySelectorAll('[data-partial-return]').forEach(btn => {
    btn.addEventListener('click', () => createReturn(btn.dataset.partialReturn, 'partial'));
  });
  list.querySelectorAll('[data-full-return]').forEach(btn => {
    btn.addEventListener('click', () => createReturn(btn.dataset.fullReturn, 'full'));
  });
}

async function confirmDelivery(orderId, status) {
  const collectInput = list.querySelector(`[data-collect="${orderId}"]`);
  const noteInput = list.querySelector(`[data-note="${orderId}"]`);
  const methodInput = list.querySelector(`input[name="collectMethod-${orderId}"]:checked`);
  try {
    await mobileApi.confirmDelivery({
      orderId,
      status,
      collectAmount: Number(collectInput?.value || 0),
      collectionMethod: methodInput?.value || 'cash',
      note: noteInput?.value || ''
    });
    setMessage(message, 'Đã cập nhật trạng thái giao hàng', 'success');
    loadOrders();
  } catch (err) {
    setMessage(message, err.message, 'error');
  }
}

async function createReturn(orderId, returnType) {
  const noteInput = list.querySelector(`[data-note="${orderId}"]`);
  const items = Array.from(list.querySelectorAll(`[data-return-order="${orderId}"]`))
    .map(input => {
      const reasonInput = list.querySelector(`[data-return-reason-order="${orderId}"][data-return-reason-code="${input.dataset.returnCode}"]`);
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
    setMessage(message, `Số lượng trả của ${invalidItem.productCode} không được lớn hơn số lượng trong đơn`, 'error');
    return;
  }
  if (returnType === 'partial' && !items.length) {
    setMessage(message, 'Hãy nhập số lượng trả ở ít nhất 1 dòng hàng', 'error');
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
    setMessage(message, returnType === 'full' ? 'Đã tạo phiếu trả cả đơn' : 'Đã tạo phiếu trả hàng một phần', 'success');
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
