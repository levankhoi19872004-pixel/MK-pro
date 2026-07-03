const mobileSalesEscapeHtml = (value = '') => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const mobileSalesMoney = (value = 0) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0));
const mobileSalesShortDate = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  return raw;
};

export function createMobileSalesNavigation(options = {}) {
  const tabs = Array.from(options.tabs || []);
  const panels = Array.from(options.panels || []);
  const panelIds = new Set(options.panelIds || panels.map((panel) => panel.id));
  const hashByPanel = options.hashByPanel || {};
  const scrollPositions = new Map();
  let activePanel = options.initialPanel || panels.find((panel) => panel.classList.contains('active'))?.id || 'customersTab';

  const navigationPanel = (panelId) => panelId === 'cartTab' ? 'orderTab' : panelId;
  const panelFromHash = () => {
    const hash = String(window.location.hash || '').toLowerCase();
    return Object.entries(hashByPanel).find(([, value]) => value === hash)?.[0] || '';
  };

  function setActive(panelId) {
    const navigationId = navigationPanel(panelId);
    tabs.forEach((button) => {
      const active = button.dataset.tab === navigationId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    panels.forEach((panel) => {
      const active = panel.id === panelId;
      panel.classList.toggle('active', active);
      panel.setAttribute('aria-hidden', String(!active));
    });
  }

  function switchPanel(panelId, switchOptions = {}) {
    const next = panelIds.has(panelId) ? panelId : (options.fallbackPanel || 'customersTab');
    const historyMode = switchOptions.historyMode || 'push';
    if (activePanel && activePanel !== next) {
      scrollPositions.set(activePanel, window.scrollY || document.documentElement.scrollTop || 0);
    }
    activePanel = next;
    setActive(next);
    options.onActivate?.(next);

    if (historyMode !== 'none') {
      const url = new URL(window.location.href);
      url.hash = hashByPanel[next] || hashByPanel[options.fallbackPanel || 'customersTab'] || '';
      const state = { ...(window.history.state || {}), mobileSalesTab: next };
      if (historyMode === 'replace') window.history.replaceState(state, '', url);
      else if (window.history.state?.mobileSalesTab !== next) window.history.pushState(state, '', url);
    }

    const target = switchOptions.restoreScroll === false ? 0 : Number(scrollPositions.get(next) || 0);
    window.requestAnimationFrame(() => window.scrollTo({ top: target, behavior: 'auto' }));
    return activePanel;
  }

  function initialize() {
    const requested = panelFromHash() || window.history.state?.mobileSalesTab || activePanel;
    activePanel = panelIds.has(requested) ? requested : (options.fallbackPanel || 'customersTab');
    setActive(activePanel);
    const url = new URL(window.location.href);
    url.hash = hashByPanel[activePanel] || '';
    window.history.replaceState({ ...(window.history.state || {}), mobileSalesTab: activePanel }, '', url);
    window.addEventListener('popstate', (event) => {
      const next = event.state?.mobileSalesTab || panelFromHash() || options.fallbackPanel || 'customersTab';
      switchPanel(next, { historyMode: 'none', restoreScroll: true });
    });
    return activePanel;
  }

  return {
    initialize,
    switchPanel,
    getActivePanel: () => activePanel,
    getScrollPositions: () => new Map(scrollPositions)
  };
}

export function createStatusAnnouncer(element) {
  let timer = null;
  return function announce(text = '', type = 'info', options = {}) {
    if (!element) return;
    if (timer) window.clearTimeout(timer);
    const value = String(text || '').trim();
    if (!value) {
      element.hidden = true;
      element.textContent = '';
      return;
    }
    element.textContent = value;
    element.className = `mobile-global-status ${type}`;
    element.hidden = false;
    if (options.persist !== true) {
      timer = window.setTimeout(() => {
        element.hidden = true;
        element.textContent = '';
      }, Number(options.durationMs || 5000));
    }
  };
}

export function renderMobileListState(container, options = {}, escapeHtml = String) {
  if (!container) return;
  const state = options.state || 'empty';
  const title = options.title || '';
  const detail = options.detail || '';
  const retryAction = options.retryAction || '';
  container.className = `${options.baseClass || 'order-list'} mobile-list-state ${state}`;
  if (state === 'loading') {
    container.innerHTML = '<div class="mobile-skeleton" aria-label="Đang tải dữ liệu"><span></span><span></span><span></span></div>';
    return;
  }
  container.innerHTML = `
    <div class="mobile-state-content">
      <strong>${escapeHtml(title)}</strong>
      ${detail ? `<span>${escapeHtml(detail)}</span>` : ''}
      ${retryAction ? `<button type="button" class="ghost-btn" data-mobile-retry="${escapeHtml(retryAction)}">Thử lại</button>` : ''}
    </div>`;
}

export function calculateCartTotals(cart = []) {
  return cart.reduce((totals, item) => {
    const quantity = Math.max(0, Number(item.quantity || 0));
    const grossPrice = Math.max(0, Number(item.originalPrice || item.grossPrice || item.catalogSalePrice || item.salePrice || item.price || 0));
    const grossAmount = Math.max(0, Number(item.grossAmount || Math.round(quantity * grossPrice)));
    const payable = Math.max(0, Number(item.amount ?? item.netAmount ?? Math.round(quantity * Number(item.unitPrice || item.salePrice || item.price || 0))));
    const discount = Math.max(0, Number(item.discountAmount || item.promotionAmount || Math.max(0, grossAmount - payable)));
    totals.gross += grossAmount;
    totals.discount += Math.min(grossAmount, discount);
    totals.payable += payable;
    return totals;
  }, { gross: 0, discount: 0, payable: 0 });
}

export function buildCartItemsHtml(cart = [], helpers = {}) {
  const escapeHtml = helpers.escapeHtml || String;
  const money = helpers.money || String;
  const normalizePackingRate = helpers.normalizePackingRate || (() => 1);
  const quantityDisplay = helpers.quantityDisplay || ((item) => String(item.quantity || 0));

  return cart.map((item, index) => {
    const quantity = Number(item.quantity || 0);
    const rate = normalizePackingRate(item);
    const caseQty = rate > 0 ? Math.floor(quantity / rate) : 0;
    const looseQty = Math.max(0, quantity - (caseQty * rate));
    const originalPrice = Number(item.originalPrice || item.grossPrice || item.catalogSalePrice || item.salePrice || item.price || 0);
    const unitPrice = Number(item.unitPrice || item.salePrice || item.price || 0);
    const grossAmount = Number(item.grossAmount || Math.round(quantity * originalPrice));
    const discount = Number(item.discountAmount || item.promotionAmount || Math.max(0, grossAmount - Number(item.amount || 0)));
    const promotion = discount > 0
      ? `<span class="cart-promotion">KM: -${money(discount)} · Giá sau KM: ${money(unitPrice)}</span>`
      : `<span>Giá bán: ${money(unitPrice)}</span>`;
    const label = escapeHtml(item.productName || item.productCode || 'sản phẩm');
    return `
      <article class="cart-item" data-cart-index="${index}">
        <div class="cart-item-heading">
          <div><strong>${escapeHtml(item.productCode)} - ${escapeHtml(item.productName)}</strong><span>Quy cách: ${escapeHtml(String(rate))} · Hiện tại: ${escapeHtml(quantityDisplay(item))}</span></div>
          <button type="button" class="danger-btn cart-remove-btn" data-remove="${index}" aria-label="Xóa ${label} khỏi giỏ">Xóa</button>
        </div>
        <div class="cart-price-detail"><span>Giá gốc: ${money(originalPrice)}</span>${promotion}<strong>Thành tiền: ${money(item.amount)}</strong></div>
        <div class="cart-qty-editor" aria-label="Sửa số lượng ${label}">
          <label><span>Thùng</span><input type="number" min="0" step="1" inputmode="numeric" value="${caseQty}" data-cart-case="${index}" aria-label="Số thùng ${label}" /></label>
          <label><span>Lẻ</span><input type="number" min="0" step="1" inputmode="numeric" value="${looseQty}" data-cart-loose="${index}" aria-label="Số lẻ ${label}" /></label>
          <button type="button" class="ghost-btn cart-update-btn" data-cart-update="${index}">Cập nhật</button>
        </div>
      </article>`;
  }).join('');
}

export function buildOrderCardsHtml(orders = [], helpers = {}) {
  const escapeHtml = helpers.escapeHtml || String;
  const money = helpers.money || String;
  const formatDate = helpers.formatDate || String;
  const statusLabel = (value = '') => {
    const normalized = String(value || '').toLowerCase();
    if (!normalized) return 'Chưa có';
    if (normalized === 'pending') return 'Chờ xử lý';
    if (normalized === 'assigned') return 'Đã gán giao';
    if (normalized === 'delivering') return 'Đang giao';
    if (normalized === 'delivered' || normalized === 'done' || normalized === 'completed') return 'Đã giao';
    if (normalized === 'accounting_confirmed' || normalized === 'confirmed' || normalized === 'posted' || normalized === 'closed') return 'Kế toán xác nhận';
    if (normalized === 'cancelled' || normalized === 'canceled') return 'Đã hủy';
    return value;
  };
  const numberValue = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const displayRewardOffsetAmount = (tracking = {}, order = {}) => {
    const bonus = numberValue(tracking.bonusAmount ?? order.bonusAmount);
    const reward = numberValue(tracking.rewardAmount ?? order.rewardAmount);
    const offset = numberValue(tracking.offsetAmount ?? order.offsetAmount);
    if (bonus > 0) return bonus;
    if (reward > 0 && offset > 0 && reward === offset) return reward;
    return reward + offset;
  };

  return orders.map((order) => {
    const pending = order.pendingSync === true;
    const tracking = order.deliveryTracking || {};
    const error = pending && order.syncError ? `<div class="mobile-inline-error">${escapeHtml(order.syncError)}</div>` : '';
    const orderKey = String(order.id || order.orderId || order.code || '').trim();
    const printUrl = String(order.printUrl || (orderKey ? `/api/mobile/sales/orders/${encodeURIComponent(orderKey)}/print.pdf` : '')).trim();
    const totalAmount = numberValue(tracking.totalAmount ?? order.totalAmount);
    const cashAmount = numberValue(tracking.cashAmount ?? order.cashAmount);
    const bankAmount = numberValue(tracking.bankAmount ?? order.bankAmount);
    const bonusAmount = displayRewardOffsetAmount(tracking, order);
    const returnAmount = numberValue(tracking.returnAmount ?? order.returnAmount);
    const remainingDebt = numberValue(tracking.remainingDebt ?? order.remainingDebt ?? order.orderRemainingDebt ?? order.debtAmount);
    const deliveryStatus = statusLabel(tracking.deliveryStatus || order.deliveryStatus || order.lifecycleStatus || order.status || 'pending');
    const accountingStatus = statusLabel(tracking.accountingStatus || order.accountingStatus || (tracking.accountingConfirmed ? 'accounting_confirmed' : 'pending'));
    const orderCode = String(order.code || order.orderCode || orderKey || '').trim();
    const lockPills = pending
      ? '<span class="mobile-sales-order-lock-pill sync">Chờ đồng bộ</span>'
      : (order.canEdit
        ? '<span class="mobile-sales-order-lock-pill editable">Có thể sửa</span>'
        : '<span class="mobile-sales-order-lock-pill locked">Đã gộp</span><span class="mobile-sales-order-lock-pill readonly">Chỉ xem</span>');
    const viewButton = !pending && printUrl
      ? `<button type="button" class="primary-btn small-btn mobile-view-order-btn" data-view-order="${escapeHtml(orderKey)}" data-order-code="${escapeHtml(orderCode)}" data-print-url="${escapeHtml(printUrl)}">Xem đơn</button>`
      : '';
    const returnsUrl = !pending && orderKey ? `/api/mobile/sales/orders/${encodeURIComponent(orderKey)}/returns` : '';
    const viewReturnsButton = returnsUrl
      ? `<button type="button" class="ghost-btn small-btn mobile-view-returns-btn" data-view-returns="${escapeHtml(orderKey)}" data-order-code="${escapeHtml(orderCode)}" data-returns-url="${escapeHtml(returnsUrl)}">Xem hàng trả</button>`
      : '';
    const editDeleteButtons = !pending && order.canEdit
      ? `<button type="button" class="ghost-btn small-btn" data-edit-order="${escapeHtml(orderKey)}">Chỉnh sửa</button><button type="button" class="danger-btn small-btn" data-delete-order="${escapeHtml(orderKey)}" data-order-code="${escapeHtml(orderCode)}">Xóa</button>`
      : '';

    return `
      <article class="order-item mobile-order-card ${pending ? 'pending-sync-order' : ''}">
        <div class="mobile-order-heading mobile-order-heading-compact">
          <div class="mobile-order-title-block">
            <strong>${escapeHtml(orderCode)}</strong>
            <span>${escapeHtml(order.customerCode || '')}${order.customerCode && order.customerName ? ' · ' : ''}${escapeHtml(order.customerName || '')}</span>
            <div class="mobile-order-status-badges" aria-label="Trạng thái đơn ${escapeHtml(orderCode)}">
              <span class="mobile-order-status-badge delivery">Giao: ${escapeHtml(deliveryStatus)}</span>
              <span class="mobile-order-status-badge accounting">Kế toán: ${escapeHtml(accountingStatus)}</span>
            </div>
          </div>
          <div class="mobile-sales-order-lock-pills">${lockPills}</div>
        </div>
        <div class="mobile-order-metrics mobile-order-tracking-metrics mobile-order-tracking-metrics-compact">
          <span><small>PT</small><strong>${money(totalAmount)}</strong></span>
          <span><small>TM</small><strong>${money(cashAmount)}</strong></span>
          <span><small>CK</small><strong>${money(bankAmount)}</strong></span>
          <span><small>TT</small><strong>${money(bonusAmount)}</strong></span>
          <span><small>HT</small><strong>${money(returnAmount)}</strong></span>
          <span><small>CN</small><strong>${money(remainingDebt)}</strong></span>
        </div>
        ${error}
        <div class="row-actions mobile-order-actions mobile-sales-order-actions">
          ${viewButton}
          ${viewReturnsButton}
          ${editDeleteButtons}
        </div>
      </article>`;
  }).join('');
}

const MOBILE_ORDER_PRINT_STYLE_ID = 'mobile-order-print-modal-style';

function ensureMobileOrderPrintStyles() {
  if (typeof document === 'undefined' || document.getElementById(MOBILE_ORDER_PRINT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MOBILE_ORDER_PRINT_STYLE_ID;
  style.textContent = `
    body.mobile-order-print-open{overflow:hidden;touch-action:none}
    .mobile-sales-order-lock-pills{display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end;align-items:center;max-width:120px}
    .mobile-sales-order-lock-pill{display:inline-flex;align-items:center;justify-content:center;min-height:22px;border-radius:999px;padding:3px 7px;font-size:10px;font-weight:900;line-height:1;background:#eef2ff;color:#1d4ed8;white-space:nowrap}
    .mobile-sales-order-lock-pill.locked,.mobile-sales-order-lock-pill.readonly{background:#f1f5f9;color:#475569}
    .mobile-sales-order-lock-pill.editable{background:#dcfce7;color:#166534}
    .mobile-sales-order-lock-pill.sync{background:#ffedd5;color:#9a3412}
    .mobile-sales-order-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .mobile-view-order-btn,.mobile-view-returns-btn{width:100%;min-height:42px}
    .mobile-order-print-modal[hidden],.mobile-order-returns-modal[hidden]{display:none!important}
    .mobile-order-returns-modal{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;padding:12px;background:rgba(15,23,42,.50)}
    .mobile-order-returns-sheet{position:relative;z-index:1;display:grid;grid-template-rows:auto minmax(0,1fr);width:min(96vw,900px);height:min(90vh,980px);max-height:calc(100vh - 24px - env(safe-area-inset-bottom));overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.34)}
    .mobile-order-returns-header{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border-bottom:1px solid #dbe4f0;background:#fff}
    .mobile-order-returns-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;font-size:15px;font-weight:900}
    .mobile-order-returns-close{min-height:38px;border:0;border-radius:12px;background:#e2e8f0;color:#0f172a;font-weight:900;padding:7px 12px}
    .mobile-order-returns-body{position:relative;min-height:0;overflow:auto;padding:12px;background:#f8fafc}
    .mobile-order-returns-loading,.mobile-order-returns-empty,.mobile-order-returns-error{display:grid;place-items:center;min-height:180px;padding:18px;text-align:center;border-radius:14px;background:#fff;color:#475569;font-weight:900}
    .mobile-order-returns-empty{color:#334155}
    .mobile-order-returns-error{color:#b42318;background:#fff7f7}
    .mobile-order-returns-loading[hidden],.mobile-order-returns-empty[hidden],.mobile-order-returns-error[hidden],.mobile-order-returns-content[hidden]{display:none!important}
    .mobile-order-returns-meta{display:grid;gap:6px;margin-bottom:10px;padding:10px;border:1px solid #dbe4f0;border-radius:14px;background:#fff;color:#334155;font-size:12px;font-weight:800}
    .mobile-order-returns-total{color:#0f172a;font-size:14px;font-weight:950}
    .mobile-order-returns-table-wrap{overflow:auto;border:1px solid #dbe4f0;border-radius:14px;background:#fff}
    .mobile-order-returns-table{width:100%;min-width:760px;border-collapse:collapse;font-size:12px;color:#0f172a}
    .mobile-order-returns-table th,.mobile-order-returns-table td{padding:9px 10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
    .mobile-order-returns-table th{position:sticky;top:0;z-index:1;background:#f1f5f9;font-weight:950;color:#334155}
    .mobile-order-returns-table td.number{text-align:right;font-weight:900}
    .mobile-order-returns-table tr:last-child td{border-bottom:0}
    .mobile-order-print-modal[hidden]{display:none!important}
    .mobile-order-print-modal{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:12px;background:rgba(15,23,42,.48)}
    .mobile-order-print-sheet{position:relative;z-index:1;display:grid;grid-template-rows:auto minmax(0,1fr);width:min(96vw,860px);height:min(90vh,980px);max-height:calc(100vh - 24px - env(safe-area-inset-bottom));overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(15,23,42,.32)}
    .mobile-order-print-header{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid #dbe4f0;background:#fff}
    .mobile-order-print-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;font-size:15px;font-weight:900}
    .mobile-order-print-toolbar{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
    .mobile-order-print-zoom,.mobile-order-print-close{min-height:38px;border:0;border-radius:12px;background:#e2e8f0;color:#0f172a;font-weight:900;padding:7px 10px}
    .mobile-order-print-zoom-value{min-width:50px;text-align:center;color:#334155;font-size:12px;font-weight:900}
    .mobile-order-print-body{position:relative;min-height:0;overflow:auto;background:#f8fafc}
    .mobile-order-print-frame{width:100%;height:100%;min-height:100%;border:0;background:#fff;transform-origin:top left;transition:transform .12s ease}
    .mobile-order-print-loading,.mobile-order-print-error{position:absolute;inset:0;display:grid;place-items:center;padding:18px;text-align:center;color:#475569;font-weight:800;background:#f8fafc}
    .mobile-order-print-error{color:#b42318;background:#fff7f7}
    .mobile-order-print-error[hidden],.mobile-order-print-loading[hidden],.mobile-order-print-frame[hidden]{display:none!important}
    @media (max-width:420px){.mobile-order-print-header,.mobile-order-returns-header{grid-template-columns:1fr;gap:8px}.mobile-order-print-toolbar{justify-content:space-between}.mobile-order-print-title,.mobile-order-returns-title{white-space:normal}.mobile-order-heading{grid-template-columns:1fr}.mobile-sales-order-lock-pills{justify-content:flex-start;max-width:none}.mobile-order-print-modal,.mobile-order-returns-modal{padding:8px}.mobile-order-print-sheet,.mobile-order-returns-sheet{width:96vw;height:88vh;border-radius:16px}.mobile-sales-order-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}


const MOBILE_ORDER_PRINT_ZOOM_MIN = 0.8;
const MOBILE_ORDER_PRINT_ZOOM_MAX = 2;
const MOBILE_ORDER_PRINT_ZOOM_STEP = 0.1;
let mobileOrderPrintZoom = 1;

function applyMobileOrderPrintZoom(modal) {
  const frame = modal?.querySelector?.('.mobile-order-print-frame');
  const value = modal?.querySelector?.('[data-mobile-order-print-zoom-value]');
  const body = modal?.querySelector?.('.mobile-order-print-body');
  const zoom = Math.max(MOBILE_ORDER_PRINT_ZOOM_MIN, Math.min(MOBILE_ORDER_PRINT_ZOOM_MAX, Number(mobileOrderPrintZoom || 1)));
  mobileOrderPrintZoom = zoom;
  if (frame) {
    frame.style.transform = `scale(${zoom})`;
    frame.style.width = `${100 / zoom}%`;
    frame.style.height = `${100 / zoom}%`;
  }
  if (body) body.dataset.zoom = String(Math.round(zoom * 100));
  if (value) value.textContent = `${Math.round(zoom * 100)}%`;
}

function setMobileOrderPrintZoom(delta = 0) {
  const modal = typeof document === 'undefined' ? null : document.getElementById('mobileOrderPrintModal');
  if (!modal) return;
  mobileOrderPrintZoom = Math.max(MOBILE_ORDER_PRINT_ZOOM_MIN, Math.min(MOBILE_ORDER_PRINT_ZOOM_MAX, mobileOrderPrintZoom + delta));
  applyMobileOrderPrintZoom(modal);
}

function ensureMobileOrderPrintModal() {
  if (typeof document === 'undefined') return null;
  ensureMobileOrderPrintStyles();
  let modal = document.getElementById('mobileOrderPrintModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'mobileOrderPrintModal';
  modal.className = 'mobile-order-print-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="mobile-order-print-sheet" role="dialog" aria-modal="true" aria-labelledby="mobileOrderPrintTitle">
      <div class="mobile-order-print-header">
        <div id="mobileOrderPrintTitle" class="mobile-order-print-title">Xem đơn</div>
        <div class="mobile-order-print-toolbar" aria-label="Điều khiển xem đơn">
          <button type="button" class="mobile-order-print-zoom" data-mobile-order-print-zoom="out" aria-label="Thu nhỏ đơn">−</button>
          <span class="mobile-order-print-zoom-value" data-mobile-order-print-zoom-value>100%</span>
          <button type="button" class="mobile-order-print-zoom" data-mobile-order-print-zoom="in" aria-label="Phóng to đơn">+</button>
          <button type="button" class="mobile-order-print-close" data-mobile-order-print-close>Đóng</button>
        </div>
      </div>
      <div class="mobile-order-print-body">
        <div class="mobile-order-print-loading">Đang tải đơn...</div>
        <iframe class="mobile-order-print-frame" title="Xem đơn bán" hidden></iframe>
        <div class="mobile-order-print-error" hidden></div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    const zoomButton = event.target.closest('[data-mobile-order-print-zoom]');
    if (zoomButton) {
      event.preventDefault();
      setMobileOrderPrintZoom(zoomButton.dataset.mobileOrderPrintZoom === 'in' ? MOBILE_ORDER_PRINT_ZOOM_STEP : -MOBILE_ORDER_PRINT_ZOOM_STEP);
      return;
    }
    if (event.target === modal || event.target.closest('[data-mobile-order-print-close]')) closeMobileOrderPrintModal();
  });
  return modal;
}

export function closeMobileOrderPrintModal() {
  const modal = typeof document === 'undefined' ? null : document.getElementById('mobileOrderPrintModal');
  if (!modal) return;
  const frame = modal.querySelector('.mobile-order-print-frame');
  if (frame) frame.src = 'about:blank';
  modal.hidden = true;
  document.body.classList.remove('mobile-order-print-open');
}

export function openMobileOrderPrintModal(options = {}) {
  const url = String(options.printUrl || '').trim();
  if (!url) return;
  const modal = ensureMobileOrderPrintModal();
  if (!modal) return;
  const frame = modal.querySelector('.mobile-order-print-frame');
  const title = modal.querySelector('.mobile-order-print-title');
  const loading = modal.querySelector('.mobile-order-print-loading');
  const error = modal.querySelector('.mobile-order-print-error');
  if (title) title.textContent = `Xem đơn ${String(options.orderCode || options.orderKey || '').trim()}`.trim();
  mobileOrderPrintZoom = 1;
  applyMobileOrderPrintZoom(modal);
  if (loading) loading.hidden = false;
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  if (frame) {
    frame.hidden = true;
    frame.src = 'about:blank';
    frame.onload = () => {
      if (loading) loading.hidden = true;
      frame.hidden = false;
    };
    frame.onerror = () => {
      if (loading) loading.hidden = true;
      if (error) {
        error.hidden = false;
        error.textContent = 'Không tải được đơn. Vui lòng thử lại.';
      }
      frame.hidden = true;
    };
  }
  modal.hidden = false;
  document.body.classList.add('mobile-order-print-open');
  window.setTimeout(() => {
    if (frame) frame.src = url;
  }, 0);
}


function ensureMobileOrderReturnsModal() {
  if (typeof document === 'undefined') return null;
  ensureMobileOrderPrintStyles();
  let modal = document.getElementById('mobileOrderReturnsModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'mobileOrderReturnsModal';
  modal.className = 'mobile-order-returns-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="mobile-order-returns-sheet" role="dialog" aria-modal="true" aria-labelledby="mobileOrderReturnsTitle">
      <div class="mobile-order-returns-header">
        <div id="mobileOrderReturnsTitle" class="mobile-order-returns-title">Hàng trả</div>
        <button type="button" class="mobile-order-returns-close" data-mobile-order-returns-close>Đóng</button>
      </div>
      <div class="mobile-order-returns-body">
        <div class="mobile-order-returns-loading">Đang tải hàng trả...</div>
        <div class="mobile-order-returns-empty" hidden>Đơn không có hàng trả về</div>
        <div class="mobile-order-returns-error" hidden></div>
        <div class="mobile-order-returns-content" hidden>
          <div class="mobile-order-returns-meta"></div>
          <div class="mobile-order-returns-table-wrap">
            <table class="mobile-order-returns-table">
              <thead>
                <tr>
                  <th>Mã SP</th>
                  <th>Tên SP</th>
                  <th>Quy cách</th>
                  <th>Số lượng trả</th>
                  <th>Giá trị 1 đơn vị SP</th>
                  <th>Tổng giá trị trả</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-mobile-order-returns-close]')) closeMobileOrderReturnsModal();
  });
  return modal;
}

function formatReturnQty(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/, '');
}

function renderMobileOrderReturnsModal(data = {}) {
  const modal = ensureMobileOrderReturnsModal();
  if (!modal) return;
  const content = modal.querySelector('.mobile-order-returns-content');
  const meta = modal.querySelector('.mobile-order-returns-meta');
  const tbody = modal.querySelector('.mobile-order-returns-table tbody');
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const customer = [data.customerCode, data.customerName].filter(Boolean).join(' - ');
  const salesman = [data.salesStaffCode, data.salesStaffName].filter(Boolean).join(' - ');
  const delivery = [data.deliveryStaffCode, data.deliveryStaffName].filter(Boolean).join(' - ');
  if (meta) {
    meta.innerHTML = `
      <div><strong>Khách hàng:</strong> ${mobileSalesEscapeHtml(customer || '-')}</div>
      <div><strong>NVBH:</strong> ${mobileSalesEscapeHtml(salesman || '-')}</div>
      <div><strong>NVGH:</strong> ${mobileSalesEscapeHtml(delivery || '-')}</div>
      <div><strong>Ngày trả:</strong> ${mobileSalesEscapeHtml(mobileSalesShortDate(data.returnDate || '') || data.returnDate || '-')}</div>
      <div class="mobile-order-returns-total">Tổng giá trị trả: ${mobileSalesMoney(data.totalReturnAmount || 0)}</div>`;
  }
  if (tbody) {
    tbody.innerHTML = rows.map((row) => `
      <tr>
        <td>${mobileSalesEscapeHtml(row.productCode || '-')}</td>
        <td>${mobileSalesEscapeHtml(row.productName || '-')}</td>
        <td>${mobileSalesEscapeHtml(String(row.specification || '-'))}</td>
        <td class="number">${mobileSalesEscapeHtml(formatReturnQty(row.returnQty))}</td>
        <td class="number">${mobileSalesMoney(row.unitPrice || 0)}</td>
        <td class="number">${mobileSalesMoney(row.returnAmount || 0)}</td>
      </tr>`).join('');
  }
  if (content) content.hidden = false;
}

export function closeMobileOrderReturnsModal() {
  const modal = typeof document === 'undefined' ? null : document.getElementById('mobileOrderReturnsModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove('mobile-order-print-open');
}

export async function openMobileOrderReturnsModal(options = {}) {
  const url = String(options.returnsUrl || '').trim();
  if (!url) return;
  const modal = ensureMobileOrderReturnsModal();
  if (!modal) return;
  const title = modal.querySelector('.mobile-order-returns-title');
  const loading = modal.querySelector('.mobile-order-returns-loading');
  const empty = modal.querySelector('.mobile-order-returns-empty');
  const error = modal.querySelector('.mobile-order-returns-error');
  const content = modal.querySelector('.mobile-order-returns-content');
  if (title) title.textContent = `Hàng trả - ${String(options.orderCode || options.orderKey || '').trim()}`.trim();
  if (loading) loading.hidden = false;
  if (empty) empty.hidden = true;
  if (error) {
    error.hidden = true;
    error.textContent = '';
  }
  if (content) content.hidden = true;
  modal.hidden = false;
  document.body.classList.add('mobile-order-print-open');
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.message || 'Không tải được hàng trả');
    if (loading) loading.hidden = true;
    if (!data.hasReturns || !Array.isArray(data.rows) || !data.rows.length) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Đơn không có hàng trả về';
      }
      return;
    }
    renderMobileOrderReturnsModal(data);
  } catch (err) {
    if (loading) loading.hidden = true;
    if (error) {
      error.hidden = false;
      error.textContent = err?.message || 'Không tải được hàng trả. Vui lòng thử lại.';
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view-order]');
    if (!button) return;
    const url = String(button.dataset.printUrl || '').trim();
    if (!url) return;
    event.preventDefault();
    openMobileOrderPrintModal({
      printUrl: url,
      orderKey: button.dataset.viewOrder || '',
      orderCode: button.dataset.orderCode || button.dataset.viewOrder || ''
    });
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-view-returns]');
    if (!button) return;
    const url = String(button.dataset.returnsUrl || '').trim();
    if (!url) return;
    event.preventDefault();
    openMobileOrderReturnsModal({
      returnsUrl: url,
      orderKey: button.dataset.viewReturns || '',
      orderCode: button.dataset.orderCode || button.dataset.viewReturns || ''
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMobileOrderPrintModal();
      closeMobileOrderReturnsModal();
    }
  });
}
