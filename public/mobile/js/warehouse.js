import { mobileApi, getUser } from './api.js';
import { bindLogout, escapeHtml, formatDisplayDate, setButtonBusy, setMessage } from './ui.js';

const root = document.getElementById('warehouseApp');
const state = {
  date: todayISO(),
  rows: [],
  detail: null,
  selectedDelivery: '',
  loading: false
};

function todayISO() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function qtyText(caseQty, eachQty) {
  return `${num(caseQty).toLocaleString('vi-VN')} thùng / ${num(eachQty).toLocaleString('vi-VN')} lẻ`;
}

function diffLabel(item = {}) {
  const diffCase = num(item.diffCaseQty);
  const diffEach = num(item.diffEachQty);
  if (!diffCase && !diffEach) return { text: 'Đúng', cls: 'ok' };
  const parts = [];
  if (diffCase) parts.push(`${diffCase > 0 ? 'dư' : 'thiếu'} ${Math.abs(diffCase)} thùng`);
  if (diffEach) parts.push(`${diffEach > 0 ? 'dư' : 'thiếu'} ${Math.abs(diffEach)} lẻ`);
  return { text: `Lệch: ${parts.join(', ')}`, cls: 'warn' };
}

function normalizeItemFromInputs(item = {}) {
  const receivedCaseQty = num(item.receivedCaseQty);
  const receivedEachQty = num(item.receivedEachQty);
  return {
    ...item,
    receivedCaseQty,
    receivedEachQty,
    diffCaseQty: receivedCaseQty - num(item.reportedCaseQty),
    diffEachQty: receivedEachQty - num(item.reportedEachQty),
    status: receivedCaseQty === num(item.reportedCaseQty) && receivedEachQty === num(item.reportedEachQty) ? 'matched' : 'discrepancy'
  };
}

function statusText(status = '') {
  const map = {
    pending: 'Chờ kiểm',
    checking: 'Đang kiểm',
    confirmed: 'Đã khớp',
    discrepancy: 'Có lệch',
    empty: 'Không có hàng trả'
  };
  return map[String(status || '').toLowerCase()] || status || 'Chờ kiểm';
}

function statusClass(status = '') {
  const s = String(status || '').toLowerCase();
  if (s === 'confirmed') return 'ok';
  if (s === 'discrepancy') return 'warn';
  if (s === 'empty') return 'muted';
  return 'info';
}

function renderLayout() {
  const user = getUser();
  root.innerHTML = `
    <section class="m-header compact">
      <div><strong>${escapeHtml(user.fullName || user.name || user.username || 'Thủ kho')}</strong></div>
      <button id="warehouseLogout" type="button" class="ghost-btn">Thoát</button>
    </section>
    <section id="warehouseView" class="warehouse-view"></section>
    <p id="warehouseMessage" class="message warehouse-message"></p>
  `;
  bindLogout(document.getElementById('warehouseLogout'));
  renderList();
}

function viewEl() { return document.getElementById('warehouseView'); }
function messageEl() { return document.getElementById('warehouseMessage'); }

function renderList() {
  const rowsHtml = state.rows.length ? state.rows.map((row) => `
    <button type="button" class="warehouse-delivery-row" data-delivery-code="${escapeHtml(row.deliveryStaffCode)}">
      <span class="warehouse-row-main">
        <b>${escapeHtml(row.deliveryStaffName || row.deliveryStaffCode)}</b>
        <small>${num(row.productCount)} sản phẩm · ${num(row.returnOrderCount)} đơn trả · ${num(row.totalReportedLines)} dòng</small>
      </span>
      <span class="warehouse-status ${statusClass(row.status)}">${escapeHtml(statusText(row.status))}</span>
    </button>
  `).join('') : `
    <div class="warehouse-empty">Không có hàng trả cần kiểm trong ngày ${escapeHtml(formatDisplayDate(state.date))}.</div>
  `;

  viewEl().innerHTML = `
    <section class="mobile-card warehouse-card compact">
      <div class="warehouse-title-row">
        <div>
          <h1>Kiểm hàng trả về</h1>
          <p>Gom hàng trả theo NVGH/ngày để thủ kho kiểm trên điện thoại.</p>
        </div>
      </div>
      <label class="warehouse-date-filter">
        <span>Ngày</span>
        <input id="warehouseDate" type="date" value="${escapeHtml(state.date)}" />
      </label>
      <button id="warehouseReload" type="button" class="primary-btn slim">Tải danh sách</button>
    </section>
    <section class="warehouse-list">${rowsHtml}</section>
  `;

  document.getElementById('warehouseDate')?.addEventListener('change', (event) => {
    state.date = event.target.value || todayISO();
    void loadList();
  });
  document.getElementById('warehouseReload')?.addEventListener('click', () => loadList());
  viewEl().querySelectorAll('[data-delivery-code]').forEach((button) => {
    button.addEventListener('click', () => loadDetail(button.dataset.deliveryCode || ''));
  });
}

function renderDetail() {
  const data = state.detail || {};
  const header = data.header || {};
  const items = (data.items || []).map(normalizeItemFromInputs);
  const discrepancyCount = items.filter((item) => item.status === 'discrepancy').length;
  const itemHtml = items.length ? items.map((item) => {
    const diff = diffLabel(item);
    return `
      <article class="warehouse-item" data-product-code="${escapeHtml(item.productCode)}">
        <button type="button" class="warehouse-item-main" data-source-product="${escapeHtml(item.productCode)}">
          <b>${escapeHtml(item.productCode)} · ${escapeHtml(item.productName || '')}</b>
          <small>NVGH báo: ${escapeHtml(qtyText(item.reportedCaseQty, item.reportedEachQty))}</small>
        </button>
        <div class="warehouse-receive-grid">
          <label><span>Thùng nhận</span><input type="number" min="0" step="1" inputmode="numeric" data-qty-field="receivedCaseQty" data-product-code="${escapeHtml(item.productCode)}" value="${escapeHtml(item.receivedCaseQty)}" /></label>
          <label><span>Lẻ nhận</span><input type="number" min="0" step="1" inputmode="numeric" data-qty-field="receivedEachQty" data-product-code="${escapeHtml(item.productCode)}" value="${escapeHtml(item.receivedEachQty)}" /></label>
        </div>
        <div class="warehouse-item-footer">
          <span class="warehouse-diff ${diff.cls}" data-diff-product="${escapeHtml(item.productCode)}">${escapeHtml(diff.text)}</span>
          <button type="button" class="ghost-btn mini" data-source-product="${escapeHtml(item.productCode)}">Xem nguồn</button>
        </div>
        <input class="warehouse-item-note" data-note-product="${escapeHtml(item.productCode)}" type="text" placeholder="Ghi chú lệch nếu có" value="${escapeHtml(item.note || '')}" />
      </article>
    `;
  }).join('') : `<div class="warehouse-empty">Không có hàng trả cần kiểm cho NVGH này.</div>`;

  viewEl().innerHTML = `
    <section class="mobile-card warehouse-card compact sticky-top">
      <button id="warehouseBack" type="button" class="ghost-btn mini">← Danh sách</button>
      <h1>${escapeHtml(header.deliveryStaffName || header.deliveryStaffCode || 'NVGH')}</h1>
      <p>${escapeHtml(formatDisplayDate(header.date || state.date))} · ${num(header.productCount)} sản phẩm · ${num(header.returnOrderCount)} đơn trả</p>
      <span class="warehouse-status ${statusClass(header.status)}">${escapeHtml(statusText(header.status))}</span>
    </section>
    <section class="warehouse-items">${itemHtml}</section>
    <section class="warehouse-bottom-action">
      <div class="warehouse-summary ${discrepancyCount ? 'warn' : 'ok'}">${discrepancyCount ? `${discrepancyCount} sản phẩm lệch` : 'Tất cả đang khớp'}</div>
      <div class="warehouse-action-grid">
        <button id="warehouseSave" type="button" class="secondary-btn">Lưu nháp</button>
        <button id="warehouseConfirm" type="button" class="primary-btn">Xác nhận hàng trả</button>
      </div>
    </section>
    <section id="warehouseSourceSheet" class="warehouse-sheet hidden" aria-hidden="true"></section>
  `;

  document.getElementById('warehouseBack')?.addEventListener('click', () => {
    state.detail = null;
    renderList();
  });
  viewEl().querySelectorAll('[data-qty-field]').forEach((input) => input.addEventListener('input', onQtyInput));
  viewEl().querySelectorAll('[data-note-product]').forEach((input) => input.addEventListener('input', onNoteInput));
  viewEl().querySelectorAll('[data-source-product]').forEach((button) => {
    button.addEventListener('click', () => openSources(button.dataset.sourceProduct || ''));
  });
  document.getElementById('warehouseSave')?.addEventListener('click', (event) => saveCheck(event.currentTarget));
  document.getElementById('warehouseConfirm')?.addEventListener('click', (event) => confirmCheck(event.currentTarget));
}

function onQtyInput(event) {
  const input = event.target;
  const code = input.dataset.productCode || '';
  const field = input.dataset.qtyField || '';
  const items = state.detail?.items || [];
  const item = items.find((row) => row.productCode === code);
  if (!item || !field) return;
  item[field] = Math.max(0, Math.round(num(input.value)));
  const normalized = normalizeItemFromInputs(item);
  Object.assign(item, normalized);
  const diff = diffLabel(item);
  const diffEl = viewEl().querySelector(`[data-diff-product="${CSS.escape(code)}"]`);
  if (diffEl) {
    diffEl.className = `warehouse-diff ${diff.cls}`;
    diffEl.textContent = diff.text;
  }
  renderBottomSummary();
}

function onNoteInput(event) {
  const code = event.target.dataset.noteProduct || '';
  const item = (state.detail?.items || []).find((row) => row.productCode === code);
  if (item) item.note = event.target.value || '';
}

function renderBottomSummary() {
  const items = (state.detail?.items || []).map(normalizeItemFromInputs);
  const discrepancyCount = items.filter((item) => item.status === 'discrepancy').length;
  const summary = viewEl().querySelector('.warehouse-summary');
  if (!summary) return;
  summary.className = `warehouse-summary ${discrepancyCount ? 'warn' : 'ok'}`;
  summary.textContent = discrepancyCount ? `${discrepancyCount} sản phẩm lệch` : 'Tất cả đang khớp';
}

function collectPayload() {
  const header = state.detail?.header || {};
  return {
    date: header.date || state.date,
    deliveryStaffCode: header.deliveryStaffCode || state.selectedDelivery,
    items: (state.detail?.items || []).map((item) => ({
      productCode: item.productCode,
      receivedCaseQty: Math.max(0, Math.round(num(item.receivedCaseQty))),
      receivedEachQty: Math.max(0, Math.round(num(item.receivedEachQty))),
      note: item.note || ''
    }))
  };
}

async function loadList() {
  setMessage(messageEl(), 'Đang tải danh sách...');
  try {
    const result = await mobileApi.getWarehouseReturnChecks({ date: state.date });
    state.rows = result.rows || result.data?.rows || [];
    renderList();
    setMessage(messageEl(), '');
  } catch (err) {
    setMessage(messageEl(), err.message || 'Không tải được danh sách', 'error');
  }
}

async function loadDetail(deliveryStaffCode) {
  if (!deliveryStaffCode) return;
  state.selectedDelivery = deliveryStaffCode;
  setMessage(messageEl(), 'Đang tải chi tiết...');
  try {
    const result = await mobileApi.getWarehouseReturnCheckDetail({ date: state.date, deliveryStaffCode });
    state.detail = result.data || { header: result.header, items: result.items };
    renderDetail();
    setMessage(messageEl(), '');
  } catch (err) {
    setMessage(messageEl(), err.message || 'Không tải được chi tiết', 'error');
  }
}

async function saveCheck(button) {
  setButtonBusy(button, true, 'Đang lưu...');
  try {
    const result = await mobileApi.saveWarehouseReturnCheck(collectPayload());
    state.detail.check = result.check || result.data?.check || null;
    if (state.detail.header) state.detail.header.status = state.detail.check?.status || 'checking';
    setMessage(messageEl(), 'Đã lưu nháp kiểm hàng trả', 'success');
  } catch (err) {
    setMessage(messageEl(), err.message || 'Không lưu được', 'error');
  } finally {
    setButtonBusy(button, false);
  }
}

async function confirmCheck(button) {
  const payload = collectPayload();
  if (!payload.items.length) return setMessage(messageEl(), 'Không có hàng trả để xác nhận', 'error');
  setButtonBusy(button, true, 'Đang xác nhận...');
  try {
    const result = await mobileApi.confirmWarehouseReturnCheck(payload);
    const check = result.check || result.data?.check || null;
    setMessage(messageEl(), result.message || 'Đã xác nhận hàng trả', check?.status === 'discrepancy' ? 'warning' : 'success');
    await loadDetail(payload.deliveryStaffCode);
  } catch (err) {
    setMessage(messageEl(), err.message || 'Không xác nhận được', 'error');
  } finally {
    setButtonBusy(button, false);
  }
}

async function openSources(productCode) {
  if (!productCode) return;
  const sheet = document.getElementById('warehouseSourceSheet');
  if (!sheet) return;
  sheet.classList.remove('hidden');
  sheet.setAttribute('aria-hidden', 'false');
  sheet.innerHTML = '<div class="warehouse-sheet-card"><p>Đang tải nguồn hàng trả...</p></div>';
  try {
    const header = state.detail?.header || {};
    const result = await mobileApi.getWarehouseReturnItemSources({
      date: header.date || state.date,
      deliveryStaffCode: header.deliveryStaffCode || state.selectedDelivery,
      productCode
    });
    const product = result.product || result.data?.product || {};
    const lines = result.sourceLines || result.data?.sourceLines || [];
    const diff = diffLabel(product);
    sheet.innerHTML = `
      <div class="warehouse-sheet-backdrop" data-close-sheet></div>
      <div class="warehouse-sheet-card">
        <div class="warehouse-sheet-head">
          <div>
            <b>${escapeHtml(product.productCode || productCode)}</b>
            <small>${escapeHtml(product.productName || '')}</small>
          </div>
          <button type="button" class="ghost-btn mini" data-close-sheet>Đóng</button>
        </div>
        <p>NVGH báo: ${escapeHtml(qtyText(product.reportedCaseQty, product.reportedEachQty))}</p>
        <p>Kho nhận: ${escapeHtml(qtyText(product.receivedCaseQty, product.receivedEachQty))}</p>
        <p class="warehouse-diff ${diff.cls}">${escapeHtml(diff.text)}</p>
        <div class="warehouse-source-lines">
          ${lines.length ? lines.map((line) => `
            <div class="warehouse-source-line">
              <b>${escapeHtml(line.customerCode || '')} - ${escapeHtml(line.customerName || '')}</b>
              <small>${escapeHtml(line.orderCode || line.salesOrderCode || line.returnOrderCode || '')}</small>
              <span>${escapeHtml(qtyText(line.reportedCaseQty, line.reportedEachQty))}</span>
            </div>
          `).join('') : '<div class="warehouse-empty">Không có nguồn chi tiết.</div>'}
        </div>
      </div>
    `;
    sheet.querySelectorAll('[data-close-sheet]').forEach((el) => el.addEventListener('click', closeSources));
  } catch (err) {
    sheet.innerHTML = `<div class="warehouse-sheet-card"><button type="button" class="ghost-btn mini" data-close-sheet>Đóng</button><p class="message error">${escapeHtml(err.message || 'Không tải được nguồn')}</p></div>`;
    sheet.querySelectorAll('[data-close-sheet]').forEach((el) => el.addEventListener('click', closeSources));
  }
}

function closeSources() {
  const sheet = document.getElementById('warehouseSourceSheet');
  if (!sheet) return;
  sheet.classList.add('hidden');
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = '';
}

function bootstrap() {
  const user = getUser();
  const role = user?.role || '';
  if (!['warehouse', 'admin'].includes(role)) {
    window.location.href = './login.html';
    return;
  }
  renderLayout();
  void loadList();
}

bootstrap();
